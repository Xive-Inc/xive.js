import { EventEmitter } from "node:events";
import { Connection } from "./connection.js";
import { Collection } from "./collection.js";
import { Events } from "./constants.js";
import { toCommandJSON } from "./builders.js";
import { ClientUser, Hub, Member, Message, MessageReaction, Poll, PollAnswer, Presence, User } from "./structures.js";
import { createInteraction } from "./interactions.js";
import { InteractionCollector, awaitOne } from "./collector.js";

/**
 * A Xive bot.
 *
 * ```js
 * const client = new Client();
 * client.on(Events.MessageCreate, async (message) => {
 *   if (message.author.bot) return;
 *   if (message.content === "!ping") await message.reply("Pong!");
 * });
 * client.login(process.env.XIVE_TOKEN);
 * ```
 *
 * `login(token)` takes the application secret, loads the hubs that installed the application,
 * connects to the gateway (an outbound websocket — no public URL needed) and emits `ready`.
 *
 * Prefer HTTP delivery? `login(token, { gateway: false })`, then serve `client.middleware()` or
 * `client.listen(port)` with `signingSecret` set. The listeners are the same.
 */
export class Client extends EventEmitter {
  /**
   * @param {{
   *   baseURL?: string,
   *   signingSecret?: string,
   *   WebSocket?: any,
   *   presence?: { status?: string, activity?: { name: string, type?: string } | null },
   * }} [options]  `WebSocket` only on Node < 22 (pass the `ws` package); `signingSecret` only for HTTP delivery.
   *   `presence` is set during `login()`, before `ready`.
   */
  constructor(options = {}) {
    super({ captureRejections: true });
    this.options = options;
    /** The REST, gateway and HTTP layer underneath. @type {Connection | null} */
    this.core = null;
    /** @type {ClientUser | null} */
    this.user = null;
    /** @type {{ id: string, commands: ApplicationCommandManager } | null} */
    this.application = null;
    this.readyAt = null;
    this.token = null;
    this.hubs = new HubManager(this);
    this.channels = { cache: /** @type {Collection<string, any>} */ (new Collection()), fetch: (/** @type {string} */ id) => this.#fetchChannel(id) };
    this.users = new UserManager(this);
  }

  isReady() {
    return this.readyAt !== null;
  }

  get readyTimestamp() {
    return this.readyAt?.getTime() ?? null;
  }

  /**
   * @param {string} [token] the application secret (`xive_as_…`); defaults to `XIVE_TOKEN`
   * @param {{ gateway?: boolean }} [options] `gateway: false` for HTTP delivery only
   */
  async login(token = process.env.XIVE_TOKEN, { gateway = true } = {}) {
    if (!token) throw new Error("xive.js: login() needs the application secret");
    this.token = token;
    this.core = new Connection({
      token,
      baseURL: this.options.baseURL,
      signingSecret: this.options.signingSecret,
      WebSocket: this.options.WebSocket,
    });

    const app = await this.core.login();
    this.user = new ClientUser(this, app);
    this.application = { id: app.id, commands: new ApplicationCommandManager(this) };

    await this.hubs.fetch();
    if (this.options.presence) await this.user.setPresence(this.options.presence);
    this.#wire(this.core);
    if (gateway) await this.core.connect();

    this.readyAt = new Date();
    this.emit(Events.ClientReady, this);
    return token;
  }

  /**
   * Collect interactions matching `predicate` (and `options.filter`). What message collectors and
   * `awaitModalSubmit()` are built on.
   *
   * @param {(i: any) => boolean} predicate
   * @param {{ filter?: (i: any) => boolean, time?: number, max?: number }} [options]
   */
  collect(predicate, options) {
    return new InteractionCollector(this, predicate, options);
  }

  /** The first interaction a collector gathers. @param {InteractionCollector} collector */
  awaitOne(collector) {
    return awaitOne(collector);
  }

  async destroy() {
    this.core?.disconnect();
    this.readyAt = null;
  }

  /** An HTTP handler for signed event deliveries (node:http or Express with `express.raw`). */
  middleware() {
    if (!this.core) throw new Error("xive.js: call login() before middleware()");
    return this.core.middleware();
  }

  /** Serve signed event deliveries on `port`. Put https in front of it. @param {number} port @param {{ path?: string }} [options] */
  listen(port, options) {
    if (!this.core) throw new Error("xive.js: call login() before listen()");
    return this.core.listen(port, options);
  }

  /** @param {string} id */
  async #fetchChannel(id) {
    const cached = this.channels.cache.get(id);
    if (cached) return cached;
    for (const hub of this.hubs.cache.values()) {
      const found = await hub.channels.fetch(id);
      if (found) return found;
    }
    return null;
  }

  /**
   * The hub for an event. A hub that installed the application after `ready` is fetched and
   * announced with `hubCreate`.
   *
   * @param {string} hubId
   */
  async #hub(hubId) {
    const cached = this.hubs.cache.get(hubId);
    if (cached) return cached;
    await this.hubs.fetch();
    const hub = this.hubs.cache.get(hubId);
    if (hub) this.emit(Events.HubCreate, hub);
    return hub ?? null;
  }

  /** @param {any} data message event data */
  async #channel(data) {
    const hub = await this.#hub(data.hub_id);
    if (!hub) return null;
    return hub.channels.cache.get(data.channel_id) ?? hub.channels.add({ id: data.channel_id, name: data.channel_id });
  }

  /** @param {Connection} core */
  #wire(core) {
    const guarded = (/** @type {(...a: any[]) => Promise<void>} */ fn) => (/** @type {any[]} */ ...args) =>
      fn(...args).catch((err) => this.#fail(err));

    core.on("gatewayDisconnect", (ctx) => this.emit(Events.Disconnect, ctx));
    core.on("gatewayConnect", () => this.emit(Events.Reconnect));
    core.on("debug", (info) => this.emit(Events.Debug, typeof info === "string" ? info : JSON.stringify(info)));
    core.on("error", (err) => this.#fail(err));

    core.on("event", guarded(async (event, envelope) => {
      const d = event.data ?? {};
      switch (event.type) {
        case "message.created": {
          const channel = await this.#channel(d);
          if (!channel) return;
          const message = channel.messages.add(d);
          this.emit(Events.MessageCreate, message);
          return;
        }
        case "message.updated": {
          const channel = await this.#channel(d);
          if (!channel) return;
          const old = channel.messages.cache.get(d.id) ?? new Message(this, channel, { id: d.id });
          const fresh = channel.messages.add(d);
          this.emit(Events.MessageUpdate, old, fresh);
          return;
        }
        case "message.deleted": {
          const channel = await this.#channel(d);
          if (!channel) return;
          const message = channel.messages.cache.get(d.id) ?? new Message(this, channel, { id: d.id });
          channel.messages.cache.delete(d.id);
          this.emit(Events.MessageDelete, message);
          return;
        }
        case "message.reaction_added":
        case "message.reaction_removed": {
          const channel = await this.#channel(d);
          if (!channel) return;
          const message = channel.messages.cache.get(d.message_id) ?? new Message(this, channel, { id: d.message_id });
          const reaction = new MessageReaction(this, message, { emoji: d.emoji });
          const u = d.user ?? {};
          const user = u.type === "member"
            ? this.users.add({ id: u.profile_id, username: u.username ?? null, name: u.name ?? null })
            : this.users.add({ id: u.application_id, username: u.name, name: u.name, bot: true });
          this.emit(event.type === "message.reaction_added" ? Events.MessageReactionAdd : Events.MessageReactionRemove, reaction, user);
          return;
        }
        case "message.poll_vote_added":
        case "message.poll_vote_removed": {
          // (pollAnswer, userId), as discord.js emits. A cached poll's count follows the vote.
          const channel = await this.#channel(d);
          if (!channel) return;
          const added = event.type === "message.poll_vote_added";
          const message = channel.messages.cache.get(d.message_id) ?? new Message(this, channel, { id: d.message_id });
          message.poll ??= new Poll(this, message, null);
          const id = Number(d.answer_id);
          let answer = message.poll.answers.get(id);
          if (!answer) {
            answer = new PollAnswer(this, message.poll, { answer_id: id });
            message.poll.answers.set(id, answer);
          }
          if (answer.voteCount !== null) answer.voteCount = Math.max(0, answer.voteCount + (added ? 1 : -1));
          const userId = d.user?.profile_id ?? d.user?.application_id ?? null;
          this.emit(added ? Events.MessagePollVoteAdd : Events.MessagePollVoteRemove, answer, userId);
          return;
        }
        case "presence.updated": {
          // Presence intent only. Sent when a member comes online or changes activity — going
          // offline is a timeout with no event, so read members when you need to know that.
          const hub = await this.#hub(d.hub_id ?? envelope.subscription?.hub_id);
          if (!hub) return;
          const old = hub.presences.cache.get(d.user_id) ?? null;
          const presence = new Presence(this, hub, d);
          hub.presences.cache.set(d.user_id, presence);
          this.emit(Events.PresenceUpdate, old, presence);
          return;
        }
        case "member.joined": {
          const hub = await this.#hub(d.hub_id ?? envelope.subscription?.hub_id);
          if (!hub) return;
          const member = await hub.members.fetch(d.member_id).catch(
            () => new Member(this, hub, { profile_id: d.member_id, member_name: d.member_name })
          );
          this.emit(Events.MemberAdd, member);
          return;
        }
        case "member.left":
        case "member.kicked":
        case "member.banned": {
          const hub = await this.#hub(d.hub_id ?? envelope.subscription?.hub_id);
          if (!hub) return;
          const member = hub.members.cache.get(d.member_id)
            ?? new Member(this, hub, { profile_id: d.member_id, member_name: d.member_name });
          hub.members.cache.delete(d.member_id);
          if (event.type === "member.banned") {
            this.emit(Events.BanAdd, { hub, user: member.user, reason: d.reason ?? null });
          }
          this.emit(Events.MemberRemove, member);
          return;
        }
        case "member.unbanned": {
          const hub = await this.#hub(d.hub_id ?? envelope.subscription?.hub_id);
          if (!hub) return;
          const user = this.users.add({ id: d.member_id, username: d.member_name, name: d.member_name });
          this.emit(Events.BanRemove, { hub, user, reason: null });
          return;
        }
        case "interaction.created": {
          const hub = await this.#hub(d.hub_id);
          if (!hub) return;
          this.emit(Events.InteractionCreate, createInteraction(this, hub, d));
          return;
        }
        case "role.assigned":
        case "role.removed": {
          const hub = await this.#hub(d.hub_id ?? envelope.subscription?.hub_id);
          if (!hub) return;
          const before = hub.members.cache.get(d.member_id)
            ?? new Member(this, hub, { profile_id: d.member_id, member_name: d.member_name });
          const after = await hub.members.fetch(d.member_id).catch(() => before);
          this.emit(Events.MemberUpdate, before, after);
          return;
        }
        default:
          return;
      }
    }));
  }

  /** @param {unknown} err */
  [Symbol.for("nodejs.rejection")](err) {
    this.#fail(err);
  }

  /** @param {unknown} err */
  #fail(err) {
    if (this.listenerCount(Events.Error) > 0) this.emit(Events.Error, err);
    else console.error(err);
  }
}

class HubManager {
  /** @param {Client} client */
  constructor(client) {
    this.client = client;
    /** @type {Collection<string, Hub>} */
    this.cache = new Collection();
  }

  /** Every hub that installed the application, with channels and roles loaded. @param {string} [id] */
  async fetch(id) {
    const core = /** @type {Connection} */ (this.client.core);
    for (const data of await core.hubs()) {
      const known = this.cache.get(data.id);
      if (known) {
        known.me._patch(data);   // roles and permissions may have changed since
        continue;
      }
      const hub = new Hub(this.client, data);
      this.cache.set(hub.id, hub);
      await hub.channels.fetch();
      // Best-effort: a hub whose roles cannot be read must not stop login.
      await hub.roles.fetch().catch(() => undefined);
    }
    return id ? this.cache.get(id) ?? null : this.cache;
  }
}

class UserManager {
  /** @param {Client} client */
  constructor(client) {
    this.client = client;
    /** @type {Collection<string, User>} */
    this.cache = new Collection();
  }

  /** Cache a user, keeping what an earlier, fuller sighting knew. @param {any} data */
  add(data) {
    const existing = this.cache.get(data.id);
    if (existing && (!data.username || data.username === existing.username)) return existing;
    const user = new User(this.client, data);
    this.cache.set(user.id, user);
    return user;
  }

  /** @param {string} id */
  async fetch(id) {
    const cached = this.cache.get(id);
    if (cached) return cached;
    for (const hub of this.client.hubs.cache.values()) {
      const member = await hub.members.fetch(id).catch(() => null);
      if (member) return member.user;
    }
    throw new Error(`Unknown user ${id}`);
  }
}

class ApplicationCommandManager {
  /** @param {Client} client */
  constructor(client) {
    this.client = client;
  }

  /** Replace the whole command set. Builders or their JSON. @param {any[]} commands */
  async set(commands) {
    const core = /** @type {Connection} */ (this.client.core);
    const { commands: saved } = await core.setCommands(commands.map(toCommandJSON));
    return new Collection((saved ?? []).map((/** @type {any} */ c) => [c.id ?? c.name, c]));
  }

  async fetch() {
    const core = /** @type {Connection} */ (this.client.core);
    const { commands } = await core.rest.get("/hubs/applications/@me/commands");
    return new Collection(commands.map((/** @type {any} */ c) => [c.id ?? c.name, c]));
  }
}
