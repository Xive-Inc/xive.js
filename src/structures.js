import { Collection } from "./collection.js";
import { ActivityType, ChannelKind, Permissions } from "./constants.js";
import { XiveUnsupportedError } from "./errors.js";
import { enc } from "./rest.js";

/** Where the app is served — the host a channel link must name for the app to recognise it. */
const APP_ORIGIN = "https://hub.thexive.com";

/** A channel kind → the app's `/hub/{slug}/{section}/{channel}` section. Threads have no address. */
const CHANNEL_SECTIONS = {
  [ChannelKind.Text]: "conversations",
  announcement: "conversations",
  [ChannelKind.LiveRoom]: "voice",
  [ChannelKind.RolePicker]: "roles",
};

/**
 * The objects a bot works with — Hub, Channel, Member, Role, User, Message — over the Xive app
 * API. Shaped like discord.js's so a bot written against one reads naturally against the other.
 *
 * Ids are uuid strings.
 *
 * @typedef {import("./client.js").Client} Client
 */

const noDMs = () => new XiveUnsupportedError("Direct messages from applications", "reply in a channel instead");

/* ── Permissions ────────────────────────────────────────────────────────────────────────────── */

/**
 * A set of permission keys, with `has()`. Takes Xive keys (`"mod_ban"`) or the friendly names in
 * `Permissions` (`"BanMembers"`) interchangeably.
 */
export class PermissionSet {
  /** @param {Iterable<string>} [keys] */
  constructor(keys = []) {
    this.keys = new Set(keys);
  }

  /** @param {string} p */
  static resolve(p) {
    return Permissions[/** @type {keyof typeof Permissions} */ (p)] ?? p;
  }

  /** @param {string | string[]} perm */
  has(perm) {
    return (Array.isArray(perm) ? perm : [perm]).every((p) => this.keys.has(PermissionSet.resolve(p)));
  }

  /** @param {string | string[]} perm */
  any(perm) {
    return (Array.isArray(perm) ? perm : [perm]).some((p) => this.keys.has(PermissionSet.resolve(p)));
  }

  toArray() {
    return [...this.keys];
  }
}

/* ── Users ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Xive ids are uuids. Anything else — the stand-in id a webhook author gets — cannot be a token,
 * so it stringifies to the plain form instead.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a mention of `target` looks like in a STORED message. The server rewrites `<user:id>`,
 * `<role:id>` and `<channel:id>` into this before storing, so this, not `toString()`, is what a
 * received message's content contains. @param {any} target
 */
function storedMention(target) {
  if (target instanceof Member) target = target.user;
  if (target instanceof User) return `@${target.username}`;
  if (target instanceof Role) return `@${target.name}`;
  if (target instanceof Channel) return target.url ?? `#${target.name}`;
  return `@${target}`;
}

export class User {
  /**
   * @param {Client} client
   * @param {{ id: string, username?: string | null, name?: string | null, avatar_url?: string | null, bot?: boolean }} data
   */
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.username = data.username ?? data.name ?? "unknown";
    this.globalName = data.name ?? data.username ?? null;
    this.avatar = data.avatar_url ?? null;
    this.bot = Boolean(data.bot);
    this.system = false;
    this.discriminator = "0";
  }

  get tag() { return this.username; }
  get displayName() { return this.globalName ?? this.username; }
  get partial() { return false; }

  displayAvatarURL() { return this.avatar ?? null; }
  avatarURL() { return this.avatar; }

  /** `<user:id>` — interpolating a user mentions them, and survives a rename. */
  toString() { return UUID.test(this.id) ? `<user:${this.id}>` : `@${this.username}`; }

  send() { return Promise.reject(noDMs()); }
  createDM() { return Promise.reject(noDMs()); }
}

/**
 * @typedef {{ name: string, type?: string }} ActivityData
 * @typedef {{ status: string, activity: { type: string, name: string } | null }} Presence
 */

export class ClientUser extends User {
  /** @param {Client} client @param {{ id: string, name: string, icon_url?: string | null }} app */
  constructor(client, app) {
    super(client, { id: app.id, username: app.name, name: app.name, avatar_url: app.icon_url ?? null, bot: true });
    /**
     * The presence last set from this process, or null before the first `setPresence`. It is
     * stored by Xive and kept across restarts, but it only shows while the bot is connected to the
     * gateway — an offline bot shows nothing.
     * @type {Presence | null}
     */
    this.presence = null;
  }

  /**
   * Set the bot's status and/or activity. A key left out is unchanged; `activity: null` clears it.
   *
   * ```js
   * await client.user.setPresence({ status: "away", activity: { name: "40 hubs", type: ActivityType.Watching } });
   * ```
   *
   * @param {{ status?: string, activity?: ActivityData | null }} data
   *   status: `online`, `away`, `busy` or `invisible`. Activity type defaults to `playing`.
   * @returns {Promise<Presence>}
   */
  async setPresence(data) {
    /** @type {Record<string, unknown>} */
    const body = {};
    if (data?.status !== undefined) body.status = data.status;
    if (data?.activity !== undefined) {
      body.activity = data.activity === null
        ? null
        : { name: data.activity.name, type: data.activity.type ?? ActivityType.Playing };
    }
    const res = await this.client.core.rest.patch("/hubs/applications/@me/presence", body);
    this.presence = res.presence;
    return res.presence;
  }

  /**
   * Set (or, with no name, clear) the activity line under the bot's name.
   *
   * ```js
   * await client.user.setActivity("/help", { type: ActivityType.Listening });
   * ```
   *
   * @param {string | ActivityData | null} [name]
   * @param {{ type?: string }} [options]
   */
  setActivity(name, options = {}) {
    if (name === undefined || name === null || name === "") return this.setPresence({ activity: null });
    const activity = typeof name === "object" ? name : { name, type: options.type };
    return this.setPresence({ activity });
  }

  /** @param {string} status `online`, `away`, `busy` or `invisible` */
  setStatus(status) {
    return this.setPresence({ status });
  }
}

/* ── Roles ──────────────────────────────────────────────────────────────────────────────────── */

export class Role {
  /** @param {Client} client @param  {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    this.client = client;
    this.hub = hub;
    this.id = data.id;
    this.name = data.name;
    this.hexColor = data.color || "#000000";
    this.color = parseInt(String(this.hexColor).replace(/^#/, ""), 16) || 0;
    this.position = data.rank ?? 0;
    this.managed = Boolean(data.managed);
    this.permissions = new PermissionSet(data.permissions ?? []);
  }
  /** `<role:id>` — interpolating a role mentions it. */
  toString() { return UUID.test(this.id) ? `<role:${this.id}>` : `@${this.name}`; }
  edit(/** @type {{ name?: string, color?: string }} */ data) {
    return this.client.core.rest.patch(`/hubs/${enc(this.hub.id)}/app/roles/${enc(this.id)}`, data);
  }
  delete() {
    return this.client.core.rest.delete(`/hubs/${enc(this.hub.id)}/app/roles/${enc(this.id)}`);
  }
}

/* ── Members ────────────────────────────────────────────────────────────────────────────────── */

/** `member.roles` — the member's explicit roles, plus add/remove. */
class MemberRoleManager {
  /** @param {Member} member @param {string[]} roleIds */
  constructor(member, roleIds) {
    this.member = member;
    this.roleIds = roleIds;
  }

  get cache() {
    const out = new Collection();
    for (const id of this.roleIds) {
      out.set(id, this.member.hub.roles.cache.get(id) ?? { id, name: id, position: 0, toString: () => id });
    }
    return out;
  }

  get highest() {
    return this.cache.reduce((best, r) => (!best || r.position > best.position ? r : best), /** @type {any} */ (null));
  }

  /** @param {any} roles @returns {string[]} */
  static ids(roles) {
    const list = roles instanceof Map ? [...roles.values()] : Array.isArray(roles) ? roles : [roles];
    return list.map((r) => (typeof r === "string" ? r : r.id));
  }

  /** @param {string | Role | (string | Role)[] | Collection<string, Role>} roles */
  async add(roles) {
    const ids = MemberRoleManager.ids(roles);
    await this.member.client.core.rest.post(`${this.member.path}/roles`, { role_ids: ids });
    this.roleIds = [...new Set([...this.roleIds, ...ids])];
    return this.member;
  }

  /** @param {string | Role | (string | Role)[] | Collection<string, Role>} roles */
  async remove(roles) {
    for (const id of MemberRoleManager.ids(roles)) {
      await this.member.client.core.rest.delete(`${this.member.path}/roles/${enc(id)}`);
      this.roleIds = this.roleIds.filter((r) => r !== id);
    }
    return this.member;
  }
}

export class Member {
  /** @param {Client} client @param  {Hub} hub @param {any} data a Xive member, or `{ profile_id, username? }` */
  constructor(client, hub, data) {
    this.client = client;
    this.hub = hub;
    this.id = data.profile_id;
    this.user = client.users.add({
      id: data.profile_id,
      username: data.username ?? data.member_name ?? null,
      name: data.display_name ?? data.member_name ?? null,
      avatar_url: data.avatar_url ?? null,
    });
    this.nickname = data.nickname ?? null;
    this.joinedAt = data.joined_at ? new Date(data.joined_at) : null;
    this.joinedTimestamp = this.joinedAt?.getTime() ?? null;
    this.communicationDisabledUntil = data.timed_out_until ? new Date(data.timed_out_until) : null;
    this.roles = new MemberRoleManager(this, data.role_ids ?? []);
    /** True when built from an event that did not carry the whole member. */
    this.partial = !data.joined_at;
  }

  get path() { return `/hubs/${enc(this.hub.id)}/app/members/${enc(this.id)}`; }
  get displayName() { return this.nickname ?? this.user.displayName; }
  get communicationDisabledTimestamp() { return this.communicationDisabledUntil?.getTime() ?? null; }
  /** The union of the member's roles' permissions, as far as the roles list reports them. */
  get permissions() {
    const keys = new Set();
    for (const role of this.roles.cache.values()) for (const k of role.permissions?.keys ?? []) keys.add(k);
    return new PermissionSet(keys);
  }

  isCommunicationDisabled() {
    return Boolean(this.communicationDisabledUntil && this.communicationDisabledUntil > new Date());
  }

  toString() { return this.user.toString(); }

  fetch() { return this.hub.members.fetch(this.id); }

  /** @param {string} [reason] */
  async kick(reason) { await this.client.core.rest.post(`${this.path}/kick`, { reason }); return this; }

  /** @param {{ reason?: string, deleteMessageSeconds?: number }} [options] */
  async ban(options = {}) { await this.client.core.rest.post(`${this.path}/ban`, { reason: options.reason }); return this; }

  /** @param {number | null} ms how long, or null to lift @param {string} [_reason] */
  async timeout(ms, _reason) {
    const minutes = ms ? Math.max(1, Math.ceil(ms / 60000)) : 0;
    await this.client.core.rest.patch(this.path, { muted_until_minutes: minutes });
    this.communicationDisabledUntil = minutes ? new Date(Date.now() + minutes * 60000) : null;
    return this;
  }

  /** @param {Date | number | null} until @param {string} [reason] */
  disableCommunicationUntil(until, reason) {
    return this.timeout(until ? new Date(until).getTime() - Date.now() : null, reason);
  }

  /** @param {string | null} nick */
  async setNickname(nick) {
    await this.client.core.rest.patch(this.path, { nickname: nick });
    this.nickname = nick;
    return this;
  }

  /** @param {{ nick?: string | null, roles?: any, communicationDisabledUntil?: Date | number | null }} data */
  async edit(data) {
    if ("nick" in data) await this.setNickname(data.nick ?? null);
    if ("communicationDisabledUntil" in data) await this.disableCommunicationUntil(data.communicationDisabledUntil ?? null);
    if ("roles" in data) {
      const want = MemberRoleManager.ids(data.roles);
      const drop = this.roles.roleIds.filter((r) => !want.includes(r));
      const add = want.filter((r) => !this.roles.roleIds.includes(r));
      if (add.length) await this.roles.add(add);
      if (drop.length) await this.roles.remove(drop);
    }
    return this;
  }

  send() { return Promise.reject(noDMs()); }
}

/* ── Messages ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Send options (a string, or `{ content, embeds, components, reply }`) → the Xive message body. Refuses what
 * has no Xive equivalent, by name.
 *
 * @param {Client} client
 * @param {Hub | null} hub
 * @param {any} options
 */
export function toXiveMessage(client, hub, options) {
  const o = typeof options === "string" ? { content: options } : options instanceof Object ? options : { content: String(options) };
  if (o.files?.length || o.attachments?.length) {
    throw new XiveUnsupportedError("File uploads from applications", "link the file, or show an image URL in an embed or a Media Gallery");
  }
  if (o.poll) throw new XiveUnsupportedError("Polls");
  if (o.stickers?.length) throw new XiveUnsupportedError("Stickers from applications");

  /** @type {Record<string, unknown>} */
  const body = {};
  const translate = (/** @type {string} */ text) => translateMentions(client, hub, text);
  if (o.content !== undefined && o.content !== null) body.content = translate(String(o.content));
  // Rows of buttons / a select menu, or a components tree. `[]` on an edit removes them; absent
  // leaves them as they are.
  if (Array.isArray(o.components)) {
    body.components = o.components.map((/** @type {any} */ r) => (typeof r?.toJSON === "function" ? r.toJSON() : r));
  }

  /*
   * Xive takes no embeds from an application, and no content beside components — the API answers
   * both with a 400. A bot written for Discord does both constantly, so the shapes are rebuilt here
   * rather than refused: each embed becomes a Container, and content becomes the Text Display
   * above it. What the reader sees is the same card.
   */
  const embeds = (o.embeds ?? []).map((/** @type {any} */ e) => (typeof e?.toJSON === "function" ? e.toJSON() : e));
  const cards = embeds.map((/** @type {any} */ e) => embedToContainer(e, translate)).filter(Boolean);
  if (cards.length) body.components = [...cards, .../** @type {any[]} */ (body.components ?? [])];
  const components = /** @type {any[] | undefined} */ (body.components);
  if (components?.length && typeof body.content === "string") {
    if (body.content.trim() !== "") body.components = [{ type: 10, content: body.content }, ...components];
    delete body.content;
  }
  const replyTo = o.reply?.messageReference ?? o.messageReference;
  if (replyTo) body.reply_to_id = typeof replyTo === "string" ? replyTo : replyTo.messageId ?? replyTo.id;
  return body;
}

/**
 * One embed (EmbedBuilder JSON) → a Container (type 17) that draws the same card.
 *
 * Author, title and description are one Text Display — beside the thumbnail in a Section when
 * there is one — each field is a Text Display of its own, the image is a Media Gallery, and the
 * footer and timestamp are the last line. `color` is the accent bar. Author and footer icons have
 * no place in a Container and are dropped. Null for an embed with nothing to draw.
 *
 * @param {any} e @param {(text: string) => string} translate
 */
export function embedToContainer(e, translate) {
  if (!e || typeof e !== "object") return null;
  const str = (/** @type {unknown} */ v) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const link = (/** @type {string} */ text, /** @type {unknown} */ url) => (str(url) ? `[${text}](${url})` : text);

  const head = [];
  if (str(e.author?.name)) head.push(`**${link(e.author.name, e.author.url)}**`);
  if (str(e.title)) head.push(`## ${link(e.title, e.url)}`);
  if (str(e.description)) head.push(translate(e.description));

  /** @type {any[]} */
  const parts = [];
  const thumb = str(e.thumbnail?.url);
  if (head.length && thumb) {
    parts.push({ type: 9, components: [{ type: 10, content: head.join("\n") }], accessory: { type: 11, media: { url: thumb } } });
  } else if (head.length) {
    parts.push({ type: 10, content: head.join("\n") });
  }
  for (const f of Array.isArray(e.fields) ? e.fields : []) {
    if (str(f?.name) && str(f?.value)) parts.push({ type: 10, content: `**${f.name}**\n${translate(f.value)}` });
  }
  const images = [str(e.image?.url), head.length ? null : thumb].filter(Boolean);
  if (images.length) parts.push({ type: 12, items: images.map((url) => ({ media: { url } })) });

  const stamp = e.timestamp ? new Date(e.timestamp) : null;
  const foot = [str(e.footer?.text), stamp && !Number.isNaN(stamp.valueOf()) ? stamp.toUTCString() : null].filter(Boolean);
  if (foot.length) parts.push({ type: 10, content: `*${foot.join(" · ")}*` });

  if (parts.length === 0) return null;
  /** @type {any} */
  const container = { type: 17, components: parts };
  if (Number.isInteger(e.color)) container.accent_color = e.color;
  return container;
}

/**
 * Discord's `<@id>`, `<@!id>`, `<@&id>` and `<#id>` → Xive's `<user:id>`, `<role:id>` and
 * `<channel:id>`, which the server resolves (HubMentions::expandTokens). Accepted because bots
 * written for other platforms build them everywhere; no cache is needed, since the id is all a
 * token carries. `client` and `hub` are unused and kept so existing callers do not break.
 *
 * @param {Client} _client @param {Hub | null} _hub @param {string} content
 */
export function translateMentions(_client, _hub, content) {
  return content.replace(/<(@!?|@&|#)([0-9a-fA-F-]{8,})>/g, (_whole, kind, id) => {
    if (kind === "#") return `<channel:${id}>`;
    if (kind === "@&") return `<role:${id}>`;
    return `<user:${id}>`;
  });
}

export class Message {
  /** @param {Client} client @param {Channel} channel @param {any} data Xive message data, possibly partial */
  constructor(client, channel, data) {
    this.client = client;
    this.channel = channel;
    this.channelId = channel.id;
    this.hub = channel.hub;
    this.hubId = channel.hub.id;
    this.id = data.id;
    this.partial = data.content === undefined;
    this.content = data.content ?? null;
    this.createdAt = data.created_at ? new Date(data.created_at) : null;
    this.createdTimestamp = this.createdAt?.getTime() ?? null;
    this.editedAt = data.edited_at ? new Date(data.edited_at) : null;
    this.editedTimestamp = this.editedAt?.getTime() ?? null;
    this.reference = data.reply_to_id
      ? { messageId: data.reply_to_id, channelId: channel.id, hubId: channel.hub.id }
      : null;
    this.attachments = new Collection();
    if (data.attachment?.url) {
      this.attachments.set(data.attachment.url, {
        id: data.attachment.url, url: data.attachment.url, proxyURL: data.attachment.url,
        contentType: data.attachment.type ?? null, name: data.attachment.url.split("/").pop(),
      });
    }
    this.embeds = data.embeds ?? [];
    /** Action rows of buttons / select menus, as JSON. */
    this.components = data.components ?? [];
    this.pinned = Boolean(data.pinned);
    this.system = false;
    this.tts = false;

    const a = data.author;
    /** @type {User | null} */
    this.author = null;
    /** @type {Member | null} */
    this.member = null;
    this.webhookId = null;
    if (a?.type === "member") {
      this.author = client.users.add({ id: a.profile_id, username: a.username, name: a.name });
      this.member = channel.hub.members.cache.get(a.profile_id)
        ?? new Member(client, channel.hub, { profile_id: a.profile_id, username: a.username, display_name: a.name });
    } else if (a) {
      this.author = client.users.add({ id: a.application_id ?? `webhook:${a.name}`, username: a.name, name: a.name, bot: true });
      if (a.type === "webhook") this.webhookId = a.application_id ?? a.name;
    }

    const content = this.content ?? "";
    this.mentions = {
      everyone: /(^|\s)@(everyone|here)\b/.test(content),
      users: new Collection(),
      roles: new Collection(),
      channels: new Collection(),
      /**
       * Reads the text for the STORED form (`@username`, `@Role`, the channel's link) — not
       * `toString()`, which is the `<user:id>` token the server rewrites on the way in.
       * @param {any} target
       */
      has: (target) => {
        if (!target) return false;
        const label = storedMention(target);
        return label.length > 1 && content.includes(label);
      },
    };
  }

  /** Opens the channel at this message (`?m=`, which the app reads), or null when the channel has no url. */
  get url() { return this.channel.url ? `${this.channel.url}?m=${encodeURIComponent(this.id)}` : null; }
  get editable() { return this.author?.id === this.client.user?.id; }
  get deletable() { return true; }
  get pinnable() { return true; }
  toString() { return this.content ?? ""; }

  get #path() { return `/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}`; }

  async fetch() {
    const fresh = await this.channel.messages.fetch(this.id);
    Object.assign(this, fresh);
    return this;
  }

  /** @param {any} options */
  reply(options) {
    const o = typeof options === "string" ? { content: options } : { ...options };
    return this.channel.send({ ...o, reply: { messageReference: this.id } });
  }

  /** @param {any} options */
  async edit(options) {
    const body = toXiveMessage(this.client, this.hub, options);
    const { message } = await this.client.core.rest.patch(this.#path, body);
    if (message?.content !== undefined) this.content = message.content;
    this.editedAt = new Date();
    this.editedTimestamp = this.editedAt.getTime();
    return this;
  }

  async delete() {
    await this.client.core.rest.delete(this.#path);
    return this;
  }

  /** @param {string | { id?: string | null, name?: string | null }} emoji */
  async react(emoji) {
    const value = typeof emoji === "string" ? emoji : emoji.id ? `custom:${emoji.id}` : String(emoji.name);
    await this.client.core.rest.put(`${this.#path}/reactions/${enc(value)}`);
    return new MessageReaction(this.client, this, { emoji: value });
  }

  async pin() { await this.client.core.rest.put(`${this.#path}/pin`, { pinned: true }); this.pinned = true; return this; }
  async unpin() { await this.client.core.rest.put(`${this.#path}/pin`, { pinned: false }); this.pinned = false; return this; }

  /** @param {{ name: string }} options */
  async startThread(options) {
    const { thread } = await this.client.core.rest.post(
      `/hubs/${enc(this.hubId)}/app/channels/${enc(this.channelId)}/threads`,
      { name: options.name, origin_message_id: this.id }
    );
    return this.hub.channels.add({ id: thread.id, name: thread.name, kind: "thread" });
  }

  /**
   * Collect presses and choices on this message's controls, discord.js-style:
   * `collector.on("collect", (i) => …)`, `collector.on("end", (collected, reason) => …)`.
   *
   * @param {{ filter?: (i: any) => boolean, time?: number, max?: number, componentType?: number }} [options]
   */
  createMessageComponentCollector(options = {}) {
    return this.client.collect(
      (/** @type {any} */ i) => i.isMessageComponent?.() && i.message?.id === this.id
        && (options.componentType === undefined || i.componentType === options.componentType),
      options
    );
  }

  /**
   * The next press or choice on this message, or a rejection after `time` ms.
   * @param {{ filter?: (i: any) => boolean, time?: number, componentType?: number }} [options]
   */
  awaitMessageComponent(options = {}) {
    return this.client.awaitOne(this.createMessageComponentCollector({ ...options, max: 1 }));
  }

  async fetchReference() {
    if (!this.reference) throw new Error("This message is not a reply");
    return this.channel.messages.fetch(this.reference.messageId);
  }
}

export class MessageReaction {
  /** @param {Client} client @param {Message} message @param {{ emoji: string }} data */
  constructor(client, message, data) {
    this.client = client;
    this.message = message;
    const custom = data.emoji.startsWith("custom:") ? data.emoji.slice(7) : null;
    this.emoji = {
      id: custom,
      name: custom ? null : data.emoji,
      identifier: data.emoji,
      toString: () => (custom ? `:custom:` : data.emoji),
    };
    this.count = null;
    this.me = false;
    this.partial = true;
  }
  async remove() {
    await this.client.core.rest.delete(`/hubs/${enc(this.message.hubId)}/app/messages/${enc(this.message.id)}/reactions/${enc(this.emoji.identifier)}`);
    return this;
  }
  fetch() { return Promise.resolve(this); }
}

/* ── Channels ───────────────────────────────────────────────────────────────────────────────── */

class MessageManager {
  /** @param {Channel} channel */
  constructor(channel) {
    this.channel = channel;
    /** @type {Collection<string, Message>} */
    this.cache = new Collection();
  }

  /** @param {any} data */
  add(data) {
    const message = new Message(this.channel.client, this.channel, data);
    this.cache.set(message.id, message);
    if (this.cache.size > 200) this.cache.delete(/** @type {string} */ (this.cache.firstKey()));
    return message;
  }

  /**
   * `fetch(id)` → one Message. `fetch({ limit, before, after })` → a Collection, newest first as
   * discord.js does.
   *
   * @param {string | { limit?: number, before?: string, after?: string, cache?: boolean }} [query]
   */
  async fetch(query) {
    const rest = this.channel.client.core.rest;
    const hub = enc(this.channel.hub.id);
    if (typeof query === "string") {
      const { message } = await rest.get(`/hubs/${hub}/app/messages/${enc(query)}`);
      return this.add(message);
    }
    const { messages } = await rest.get(`/hubs/${hub}/app/channels/${enc(this.channel.id)}/messages`, {
      limit: query?.limit, before: query?.before, after: query?.after,
    });
    const out = new Collection();
    for (const m of [...messages].reverse()) out.set(m.id, this.add(m));
    return out;
  }

  /** @param {string | Message} message */
  async delete(message) {
    const id = typeof message === "string" ? message : message.id;
    await this.channel.client.core.rest.delete(`/hubs/${enc(this.channel.hub.id)}/app/messages/${enc(id)}`);
  }
}

export class Channel {
  /** @param {Client} client @param  {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    this.client = client;
    this.hub = hub;
    this.hubId = hub.id;
    this.id = data.id;
    this.name = data.name ?? data.id;
    this.slug = data.slug ?? null;
    this.topic = data.topic ?? null;
    this.parentId = data.category_id ?? null;
    /** One of ChannelKind. */
    this.kind = data.kind ?? ChannelKind.Text;
    this.messages = new MessageManager(this);
    this.threads = {
      /** @param {{ name: string, startMessage?: string | Message }} options */
      create: async (options) => {
        const origin = options.startMessage;
        const { thread } = await client.core.rest.post(`/hubs/${enc(hub.id)}/app/channels/${enc(this.id)}/threads`, {
          name: options.name,
          origin_message_id: origin ? (typeof origin === "string" ? origin : origin.id) : undefined,
        });
        return hub.channels.add({ id: thread.id, name: thread.name, kind: "thread" });
      },
    };
  }

  isTextBased() { return this.kind !== ChannelKind.RolePicker; }
  isThread() { return this.kind === ChannelKind.Thread; }
  isVoiceBased() { return this.kind === ChannelKind.LiveRoom; }
  /**
   * The channel's address in the app, or null for one that has none (a thread, or a hub or
   * channel the cache knows only by id). Posted in a message, a reader who can see the channel
   * gets it drawn as a #channel pill — the way a member's pasted channel link is.
   */
  get url() {
    const section = CHANNEL_SECTIONS[this.kind];
    if (!section || !this.slug || !this.hub.slug) return null;
    return `${APP_ORIGIN}/hub/${encodeURIComponent(this.hub.slug)}/${section}/${encodeURIComponent(this.slug)}`;
  }

  /**
   * `<channel:id>` — the server stores it as the channel's link, which readers who can see the
   * channel get as a #channel pill (`#name` for a thread, which has no link).
   */
  toString() { return UUID.test(this.id) ? `<channel:${this.id}>` : (this.url ?? `#${this.name}`); }

  /** @param {any} options */
  async send(options) {
    const body = toXiveMessage(this.client, this.hub, options);
    const { message } = await this.client.core.rest.post(
      `/hubs/${enc(this.hub.id)}/app/channels/${enc(this.id)}/messages`, body
    );
    return this.messages.add({
      created_at: new Date().toISOString(), reply_to_id: body.reply_to_id ?? null, components: body.components, ...message,
    });
  }

  /**
   * Delete several messages. Xive has no bulk route, so this deletes one by one — fine for the
   * dozens a purge command removes, not for thousands.
   *
   * @param {number | string[] | Collection<string, Message>} messages
   */
  async bulkDelete(messages) {
    /** @type {string[]} */
    let ids;
    if (typeof messages === "number") {
      const page = /** @type {Collection<string, Message>} */ (await this.messages.fetch({ limit: Math.min(messages, 100) }));
      ids = [...page.keys()];
    } else if (messages instanceof Map) {
      ids = [...messages.keys()];
    } else {
      ids = messages.map((/** @type {any} */ m) => (typeof m === "string" ? m : m.id));
    }
    const out = new Collection();
    for (const id of ids) {
      await this.messages.delete(id);
      out.set(id, { id });
    }
    return out;
  }

  sendTyping() { return Promise.resolve(); }

  /** @param {boolean} [locked] */
  async setLocked(locked = true) {
    await this.client.core.rest.put(`/hubs/${enc(this.hub.id)}/app/channels/${enc(this.id)}/lock`, { locked });
    return this;
  }
}

/* ── Hubs ───────────────────────────────────────────────────────────────────────────────────── */

class ChannelManager {
  /** @param  {Hub} hub */
  constructor(hub) {
    this.hub = hub;
    /** @type {Collection<string, Channel>} */
    this.cache = new Collection();
  }

  /** @param {any} data */
  add(data) {
    const existing = this.cache.get(data.id);
    if (existing) {
      // An event caches a channel by id alone; the full row from fetch() fills in what it lacked,
      // or `${channel}` would stay a bare id with no link for the life of the process.
      if (data.slug && !existing.slug) existing.slug = data.slug;
      if (data.name && existing.name === existing.id) existing.name = data.name;
      if (data.kind) existing.kind = data.kind;
      return existing;
    }
    const channel = new Channel(this.hub.client, this.hub, data);
    this.cache.set(channel.id, channel);
    this.hub.client.channels.cache.set(channel.id, channel);
    return channel;
  }

  /** @param {string} [id] */
  async fetch(id) {
    const { channels } = await this.hub.client.core.rest.get(`/hubs/${enc(this.hub.id)}/app/channels`);
    for (const c of channels) this.add(c);
    if (id) return this.cache.get(id) ?? null;
    return this.cache;
  }

  /** @param {{ name: string, kind?: string, topic?: string, parent?: string }} options */
  async create(options) {
    const { channel } = await this.hub.client.core.rest.post(`/hubs/${enc(this.hub.id)}/app/channels`, {
      name: options.name, kind: options.kind ?? ChannelKind.Text, topic: options.topic, category_id: options.parent,
    });
    return this.add(channel);
  }
}

class MemberManager {
  /** @param  {Hub} hub */
  constructor(hub) {
    this.hub = hub;
    /** @type {Collection<string, Member>} */
    this.cache = new Collection();
  }

  /** @param {any} data */
  add(data) {
    const member = new Member(this.hub.client, this.hub, data);
    if (!member.partial) this.cache.set(member.id, member);
    return member;
  }

  /**
   * `fetch(id)` → one Member. `fetch()` → every member, paging through the roster.
   * @param {string | { user?: string, limit?: number }} [query]
   */
  async fetch(query) {
    const rest = this.hub.client.core.rest;
    const id = typeof query === "string" ? query : query?.user;
    if (id) {
      const { member } = await rest.get(`/hubs/${enc(this.hub.id)}/app/members/${enc(id)}`);
      return this.add(member);
    }
    const max = typeof query === "object" && query?.limit ? query.limit : Infinity;
    const out = new Collection();
    for (let offset = 0; out.size < max; offset += 200) {
      const { members } = await rest.get(`/hubs/${enc(this.hub.id)}/app/members`, { limit: 200, offset });
      for (const m of members) {
        if (out.size >= max) break;
        out.set(m.profile_id, this.add(m));
      }
      if (members.length < 200) break;
    }
    return out;
  }

  /** @param {string | Member | User} user @param {string} [reason] */
  async kick(user, reason) {
    await this.hub.client.core.rest.post(`/hubs/${enc(this.hub.id)}/app/members/${enc(user instanceof Object ? user.id : user)}/kick`, { reason });
  }

  /** @param {string | Member | User} user @param {{ reason?: string }} [options] */
  async ban(user, options = {}) {
    await this.hub.client.core.rest.post(`/hubs/${enc(this.hub.id)}/app/members/${enc(user instanceof Object ? user.id : user)}/ban`, { reason: options.reason });
  }

  /**
   * Lift a ban. Needs `Permissions.BanMembers`. The person can rejoin; they are not put back.
   * @param {string | Member | User} user @param {string} [reason]
   */
  async unban(user, reason) {
    const id = user instanceof Object ? user.id : user;
    await this.hub.client.core.rest.post(`/hubs/${enc(this.hub.id)}/app/members/${enc(id)}/unban`, { reason });
    return this.hub.client.users.cache.get(id) ?? null;
  }
}

class RoleManager {
  /** @param  {Hub} hub */
  constructor(hub) {
    this.hub = hub;
    /** @type {Collection<string, Role>} */
    this.cache = new Collection();
    /** @type {Role | null} */
    this.everyone = null;
  }

  /** @param {string} [id] */
  async fetch(id) {
    const { roles } = await this.hub.client.core.rest.get(`/hubs/${enc(this.hub.id)}/app/roles`);
    this.cache.clear();
    for (const r of roles) {
      const role = new Role(this.hub.client, this.hub, r);
      this.cache.set(role.id, role);
      if (r.is_default) this.everyone = role;
    }
    return id ? this.cache.get(id) ?? null : this.cache;
  }

  /** @param {{ name: string, color?: string }} options */
  async create(options) {
    const { role } = await this.hub.client.core.rest.post(`/hubs/${enc(this.hub.id)}/app/roles`, options);
    const created = new Role(this.hub.client, this.hub, role);
    this.cache.set(created.id, created);
    return created;
  }

  get highest() {
    return this.cache.reduce((best, r) => (!best || r.position > best.position ? r : best), /** @type {Role | null} */ (null));
  }
}

/**
 * `hub.me` — the application itself in this hub: the roles it holds and what they let it do.
 * discord.js's `guild.members.me`, without the member: an application is not one.
 *
 * `role` is the role made when the hub installed the app; `roles` adds any others the hub gave it.
 * `permissions` is the app's hub-wide permissions from all of them (and @everyone) — exactly what
 * the API checks. Channel overwrites can narrow it; answering an interaction ignores them.
 * Loaded at login; call `fetch()` after the hub changes the app's roles.
 */
export class HubMe {
  /** @param {Hub} hub @param {any} data an entry of GET /hubs/applications/@me/hubs */
  constructor(hub, data) {
    this.hub = hub;
    this._patch(data);
  }

  /** @param {any} data */
  _patch(data) {
    /** @type {any} */
    this._role = data.role ?? null;
    /** @type {any[]} */
    this._extra = Array.isArray(data.roles) ? data.roles : [];
    // Older servers did not send `permissions`; the install role's own keys are the best guess.
    this.permissions = new PermissionSet(data.permissions ?? data.role?.permissions ?? []);
  }

  /** @param {any} r */
  #resolve(r) {
    return this.hub.roles.cache.get(r.id) ?? new Role(this.hub.client, this.hub, r);
  }

  /** The role made when the hub installed the app. */
  get role() {
    return this._role ? this.#resolve({ ...this._role, managed: true }) : null;
  }

  /** Every role the app holds — its install role and any others — highest first. */
  get roles() {
    const all = new Collection();
    for (const r of [...(this._role ? [{ ...this._role, managed: true }] : []), ...this._extra]) {
      const role = this.#resolve(r);
      all.set(role.id, role);
    }
    return all.sort((a, b) => b.position - a.position);
  }

  /** The app's highest role — what decides which roles and members it can manage. */
  get highest() {
    return this.roles.first() ?? null;
  }

  /** Re-read the app's roles and permissions in this hub. */
  async fetch() {
    const core = /** @type {any} */ (this.hub.client.core);
    const data = (await core.hubs()).find((/** @type {any} */ h) => h.id === this.hub.id);
    if (data) this._patch(data);
    return this;
  }
}

export class Hub {
  /** @param {Client} client @param {any} data an entry of GET /hubs/applications/@me/hubs */
  constructor(client, data) {
    this.client = client;
    this.id = data.id;
    this.name = data.name;
    this.description = data.description ?? null;
    this.slug = data.slug ?? null;
    /** When this hub installed the application. */
    this.joinedAt = data.installed_at ? new Date(data.installed_at) : null;
    this.channels = new ChannelManager(this);
    this.members = new MemberManager(this);
    this.roles = new RoleManager(this);
    /** The application in this hub — its roles and permissions. */
    this.me = new HubMe(this, data);
  }

  toString() { return this.name; }
}
