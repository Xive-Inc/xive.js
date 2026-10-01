import { enc } from "./rest.js";

/**
 * @typedef {import("./client.js").Client} Client
 *
 * @typedef {{ type: "member", profile_id: string, username: string | null, name: string | null }
 *   | { type: "application" | "webhook", application_id: string | null, name: string }} RawAuthor
 *
 * @typedef {string | {
 *   content?: string,
 *   embeds?: unknown[],
 *   media_url?: string,
 *   media_type?: string,
 *   reply_to_id?: string,
 * }} MessageOptions
 */

/** @param {MessageOptions} options */
function messageBody(options) {
  return typeof options === "string" ? { content: options } : { ...options };
}

/** A message, from an event or from a channel read. */
export class Message {
  /**
   * @param {Client} client
   * @param {any} data  the API's message shape (event `data`, or an item of Get Channel Messages)
   * @param {string} hubId
   */
  constructor(client, data, hubId) {
    /** @readonly */ this.client = client;
    /** @type {string} */ this.id = data.id;
    /** @type {string} */ this.hubId = data.hub_id ?? hubId;
    /** @type {string} */ this.channelId = data.channel_id;
    /** Set when the message is in a thread: the channel the thread hangs off. @type {string | null} */
    this.parentChannelId = data.parent_channel_id ?? null;
    /** @type {string} */ this.content = data.content ?? "";
    /** @type {Date | null} */ this.createdAt = data.created_at ? new Date(data.created_at) : null;
    /** @type {boolean} */ this.edited = Boolean(data.edited);
    /** @type {Date | null} */ this.editedAt = data.edited_at ? new Date(data.edited_at) : null;
    /** @type {string | null} */ this.replyToId = data.reply_to_id ?? null;
    /** @type {{ url: string, type: string | null } | null} */ this.attachment = data.attachment ?? null;
    /** @type {RawAuthor} */ this.author = data.author;
  }

  /** True when an application or a webhook wrote it — the check every bot makes first. */
  get isAutomated() {
    return this.author?.type !== "member";
  }

  /** True when THIS application wrote it. */
  get isOwn() {
    return this.author?.type === "application" && this.author.application_id === this.client.application?.id;
  }

  get hub() {
    return this.client.hub(this.hubId);
  }

  get channel() {
    return this.hub.channel(this.channelId);
  }

  /** Post in the same channel, as a reply to this message. @param {MessageOptions} options */
  reply(options) {
    return this.channel.send({ ...messageBody(options), reply_to_id: this.id });
  }

  /** Edit — only messages this application wrote. @param {MessageOptions} options */
  edit(options) {
    return this.client.rest.patch(`/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}`, messageBody(options));
  }

  /** Delete. Another author's message needs `conv_delete_messages`. */
  delete() {
    return this.client.rest.delete(`/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}`);
  }

  /** @param {boolean} [pinned] */
  pin(pinned = true) {
    return this.client.rest.put(`/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}/pin`, { pinned });
  }

  /** React as this application. A unicode emoji, or `custom:<id>` for one of this hub's. @param {string} emoji */
  react(emoji) {
    return this.client.rest.put(`/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}/reactions/${enc(emoji)}`);
  }

  /** Take back this application's own reaction. @param {string} emoji */
  unreact(emoji) {
    return this.client.rest.delete(`/hubs/${enc(this.hubId)}/app/messages/${enc(this.id)}/reactions/${enc(emoji)}`);
  }
}

/** A channel in an installed hub. Cheap to create: nothing is fetched until you ask. */
export class Channel {
  /** @param {Client} client @param {string} hubId @param {string} id */
  constructor(client, hubId, id) {
    /** @readonly */ this.client = client;
    this.hubId = hubId;
    this.id = id;
  }

  get #base() {
    return `/hubs/${enc(this.hubId)}/app/channels/${enc(this.id)}`;
  }

  /** @param {MessageOptions} options @returns {Promise<{ message: any, warnings?: string[] }>} */
  send(options) {
    return this.client.rest.post(`${this.#base}/messages`, messageBody(options));
  }

  /**
   * Up to 100 messages, oldest first: the newest, or the page `before` / `after` a message id.
   * @param {{ limit?: number, before?: string, after?: string }} [options]
   * @returns {Promise<Message[]>}
   */
  async messages({ limit, before, after } = {}) {
    const { messages } = await this.client.rest.get(`${this.#base}/messages`, { limit, before, after });
    return messages.map((/** @type {any} */ m) => new Message(this.client, m, this.hubId));
  }

  /** @param {boolean} [locked] */
  lock(locked = true) {
    return this.client.rest.put(`${this.#base}/lock`, { locked });
  }

  /** @param {string} name @param {{ originMessageId?: string }} [options] */
  createThread(name, { originMessageId } = {}) {
    return this.client.rest.post(`${this.#base}/threads`, { name, origin_message_id: originMessageId });
  }
}

/** A member of an installed hub, addressed by profile id. */
export class Member {
  /** @param {Client} client @param {string} hubId @param {string} profileId */
  constructor(client, hubId, profileId) {
    /** @readonly */ this.client = client;
    this.hubId = hubId;
    this.profileId = profileId;
  }

  get #base() {
    return `/hubs/${enc(this.hubId)}/app/members/${enc(this.profileId)}`;
  }

  /** @param {string} [reason] */
  kick(reason) {
    return this.client.rest.post(`${this.#base}/kick`, { reason });
  }

  /** @param {string} [reason] */
  ban(reason) {
    return this.client.rest.post(`${this.#base}/ban`, { reason });
  }

  /** @param {string} reason */
  warn(reason) {
    return this.client.rest.post(`${this.#base}/warnings`, { reason });
  }

  /** Time out for `minutes` (0 lifts it; at most 40320, four weeks). @param {number} minutes */
  timeout(minutes) {
    return this.client.rest.patch(this.#base, { muted_until_minutes: minutes });
  }

  /** @param {string | null} nickname */
  setNickname(nickname) {
    return this.client.rest.patch(this.#base, { nickname });
  }

  /** @param {string[]} roleIds */
  addRoles(roleIds) {
    return this.client.rest.post(`${this.#base}/roles`, { role_ids: roleIds });
  }

  /** @param {string} roleId */
  removeRole(roleId) {
    return this.client.rest.delete(`${this.#base}/roles/${enc(roleId)}`);
  }
}

/** A hub that has installed this application. `key` is its slug or id. */
export class Hub {
  /** @param {Client} client @param {string} key */
  constructor(client, key) {
    /** @readonly */ this.client = client;
    this.key = key;
  }

  get #base() {
    return `/hubs/${enc(this.key)}/app`;
  }

  /** @returns {Promise<any>} */
  async fetch() {
    return (await this.client.rest.get(`${this.#base}/hub`)).hub;
  }

  /** The channels this application can see. @returns {Promise<any[]>} */
  async channels() {
    return (await this.client.rest.get(`${this.#base}/channels`)).channels;
  }

  /** @param {string} channelId */
  channel(channelId) {
    return new Channel(this.client, this.key, channelId);
  }

  /** @param {{ limit?: number, offset?: number }} [options] @returns {Promise<any[]>} */
  async members({ limit, offset } = {}) {
    return (await this.client.rest.get(`${this.#base}/members`, { limit, offset })).members;
  }

  /** @param {string} profileId */
  member(profileId) {
    return new Member(this.client, this.key, profileId);
  }

  /** One member, with `role_ids`. @param {string} profileId @returns {Promise<any>} */
  async fetchMember(profileId) {
    return (await this.client.rest.get(`${this.#base}/members/${enc(profileId)}`)).member;
  }

  /** One message, by id. @param {string} messageId */
  async fetchMessage(messageId) {
    const { message } = await this.client.rest.get(`${this.#base}/messages/${enc(messageId)}`);
    return new Message(this.client, message, this.key);
  }

  /** @returns {Promise<any[]>} */
  async roles() {
    return (await this.client.rest.get(`${this.#base}/roles`)).roles;
  }
}
