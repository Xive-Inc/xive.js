import { Collection } from "./collection.js";
import { enc } from "./rest.js";
import { Member, PermissionSet, Role, toXiveMessage } from "./structures.js";

/**
 * A slash command a member ran — what `interactionCreate` hands you.
 *
 * Answer within fifteen minutes. Call `reply()` or `deferReply()` first, and do it quickly: the
 * member is shown "didn't respond" after about three seconds of silence. `deferReply()` shows
 * "thinking…" until `editReply()` sends the real answer.
 *
 * @typedef {import("./client.js").Client} Client
 * @typedef {import("./structures.js").Hub} Hub
 */
export class CommandInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data the `interaction.created` event data */
  constructor(client, hub, data) {
    this.client = client;
    this.id = data.id;
    this.hub = hub;
    this.hubId = hub.id;
    this.channelId = data.channel_id;
    this.channel = hub.channels.cache.get(data.channel_id) ?? hub.channels.add({ id: data.channel_id, name: data.channel_id });
    this.commandId = data.command.id;
    this.commandName = data.command.name;
    this.createdAt = new Date(data.created_at);
    this.createdTimestamp = this.createdAt.getTime();
    this.expiresAt = new Date(data.expires_at);

    const u = data.user;
    this.user = client.users.add({ id: u.profile_id, username: u.username, name: u.name });
    this.member = new Member(client, hub, {
      profile_id: u.profile_id, username: u.username, display_name: u.name, role_ids: u.role_ids ?? [],
    });
    /** The member's permissions in THIS channel, with overrides applied. */
    this.memberPermissions = new PermissionSet(u.permissions ?? []);
    this.options = new CommandOptions(this, data.options ?? []);

    this.deferred = false;
    this.replied = false;
    this.ephemeral = null;
  }

  isCommand() { return true; }
  isChatInputCommand() { return true; }
  isRepliable() { return true; }

  get #base() { return `/hubs/${enc(this.hubId)}/app/interactions/${enc(this.id)}`; }

  /** @param {any} options a string, or `{ content, embeds, ephemeral }` */
  #body(options) {
    const o = typeof options === "string" ? { content: options } : { ...options };
    return { ...toXiveMessage(this.client, this.hub, o), ephemeral: Boolean(o.ephemeral) };
  }

  /**
   * Answer. `ephemeral: true` shows it only to the member who ran the command.
   * @param {any} options
   */
  async reply(options) {
    const body = this.#body(options);
    const result = await this.client.core.rest.post(`${this.#base}/callback`, { type: "reply", ...body });
    this.replied = true;
    this.ephemeral = body.ephemeral;
    return result.message;
  }

  /**
   * Acknowledge now, answer later with `editReply()`. The member sees "thinking…". Privacy is
   * decided here: `{ ephemeral: true }` makes the eventual answer private.
   * @param {{ ephemeral?: boolean }} [options]
   */
  async deferReply(options = {}) {
    await this.client.core.rest.post(`${this.#base}/callback`, { type: "defer", ephemeral: Boolean(options.ephemeral) });
    this.deferred = true;
    this.ephemeral = Boolean(options.ephemeral);
  }

  /** Send the answer after `deferReply()`, or change the one already sent. @param {any} options */
  async editReply(options) {
    const { ephemeral: _ignored, ...body } = this.#body(options);
    const result = await this.client.core.rest.patch(`${this.#base}/original`, body);
    this.replied = true;
    return result.message;
  }

  /** Another message after the first. `ephemeral` per message. @param {any} options */
  async followUp(options) {
    const result = await this.client.core.rest.post(`${this.#base}/followups`, this.#body(options));
    return result.message;
  }
}

/** `interaction.options` — the values the member typed, by option name. */
class CommandOptions {
  /** @param {CommandInteraction} interaction @param {any[]} data */
  constructor(interaction, data) {
    this.interaction = interaction;
    /** @type {Collection<string, any>} */
    this.data = new Collection(data.map((o) => [o.name, o]));
  }

  /** @param {string} name @param {boolean} required @param {string} type */
  #get(name, required, type) {
    const option = this.data.get(name);
    if (!option) {
      if (required) throw new TypeError(`Required option "${name}" was not provided`);
      return null;
    }
    if (option.type !== type) throw new TypeError(`Option "${name}" is a ${option.type}, not a ${type}`);
    return option;
  }

  /** The raw `{ name, type, value, resolved? }`. @param {string} name @param {boolean} [required] */
  get(name, required = false) {
    const option = this.data.get(name) ?? null;
    if (!option && required) throw new TypeError(`Required option "${name}" was not provided`);
    return option;
  }

  /** @param {string} name @param {boolean} [required] @returns {string | null} */
  getString(name, required = false) { return this.#get(name, required, "string")?.value ?? null; }

  /** @param {string} name @param {boolean} [required] @returns {number | null} */
  getInteger(name, required = false) { return this.#get(name, required, "integer")?.value ?? null; }

  /** @param {string} name @param {boolean} [required] @returns {boolean | null} */
  getBoolean(name, required = false) { return this.#get(name, required, "boolean")?.value ?? null; }

  /** @param {string} name @param {boolean} [required] */
  getUser(name, required = false) {
    const o = this.#get(name, required, "user");
    if (!o) return null;
    return this.interaction.client.users.add({ id: o.value, username: o.resolved?.username, name: o.resolved?.name });
  }

  /** The user option as a hub member (partial; `await member.fetch()` for roles). @param {string} name @param {boolean} [required] */
  getMember(name, required = false) {
    const o = this.#get(name, required, "user");
    if (!o) return null;
    const hub = this.interaction.hub;
    return hub.members.cache.get(o.value)
      ?? new Member(this.interaction.client, hub, { profile_id: o.value, username: o.resolved?.username, display_name: o.resolved?.name });
  }

  /** @param {string} name @param {boolean} [required] */
  getChannel(name, required = false) {
    const o = this.#get(name, required, "channel");
    if (!o) return null;
    return this.interaction.hub.channels.cache.get(o.value)
      ?? this.interaction.hub.channels.add({ id: o.value, name: o.resolved?.name ?? o.value });
  }

  /** @param {string} name @param {boolean} [required] */
  getRole(name, required = false) {
    const o = this.#get(name, required, "role");
    if (!o) return null;
    const hub = this.interaction.hub;
    return hub.roles.cache.get(o.value) ?? new Role(this.interaction.client, hub, { id: o.value, name: o.resolved?.name ?? o.value });
  }
}
