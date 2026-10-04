import { Collection } from "./collection.js";
import { ComponentType } from "./constants.js";
import { enc } from "./rest.js";
import { pickFile, resolveFile } from "./files.js";
import { XiveUnsupportedError } from "./errors.js";
import { Member, Message, PermissionSet, Role, toXiveMessage } from "./structures.js";

/**
 * What `interactionCreate` hands you: a slash command, a button press or menu choice, or a submitted
 * form. Narrow it the discord.js way — `isChatInputCommand()`, `isButton()`,
 * `isStringSelectMenu()`, `isModalSubmit()`.
 *
 * Answer within fifteen minutes, and acknowledge quickly: the member sees "didn't respond" after
 * about three seconds of silence. `deferReply()` / `deferUpdate()` buy the time.
 *
 * @typedef {import("./client.js").Client} Client
 * @typedef {import("./structures.js").Hub} Hub
 */
export class BaseInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data the `interaction.created` event data */
  constructor(client, hub, data) {
    this.client = client;
    this.id = data.id;
    /** 'command' | 'component' | 'modal_submit' */
    this.kind = data.type ?? "command";
    this.hub = hub;
    this.hubId = hub.id;
    this.channelId = data.channel_id;
    this.channel = hub.channels.cache.get(data.channel_id) ?? hub.channels.add({ id: data.channel_id, name: data.channel_id });
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

    this.deferred = false;
    this.replied = false;
    this.ephemeral = null;
  }

  isCommand() { return this.kind === "command"; }
  isChatInputCommand() { return this.kind === "command"; }
  isMessageComponent() { return this.kind === "component"; }
  isButton() { return false; }
  isStringSelectMenu() { return false; }
  isUserSelectMenu() { return false; }
  isRoleSelectMenu() { return false; }
  isMentionableSelectMenu() { return false; }
  isChannelSelectMenu() { return false; }
  isAnySelectMenu() { return false; }
  isModalSubmit() { return this.kind === "modal_submit"; }
  isAutocomplete() { return this.kind === "autocomplete"; }
  isRepliable() { return this.kind !== "autocomplete"; }

  get base() { return `/hubs/${enc(this.hubId)}/app/interactions/${enc(this.id)}`; }

  /** @param {any} options a string, or `{ content, embeds, components, ephemeral }` */
  body(options) {
    const o = typeof options === "string" ? { content: options } : { ...options };
    return { ...toXiveMessage(this.client, this.hub, o), ephemeral: Boolean(o.ephemeral) };
  }

  /**
   * The Message an answer produced, as discord.js resolves `followUp()` and `editReply()`: built
   * through the channel's message manager, as `channel.send()` builds one. A private answer is not a
   * channel message, so it stays the raw `{ id }` the API returned; no message at all is null.
   *
   * @param {any} result the route's JSON @param {Record<string, any>} body what was sent
   * @param {boolean} edit whether the answer edited a message rather than sending one
   */
  _messageFrom(result, body, edit) {
    const data = result?.message;
    if (!data || typeof data !== "object" || !data.id) return null;
    if (result.ephemeral) return data;
    const channel = (data.channel_id && this.hub.channels.cache.get(data.channel_id)) || this.channel;
    const cached = channel.messages.cache.get(data.id);
    if (edit && cached) {
      // An edit answers with `{ id, content }`; keep what the cache already knew.
      if (data.content !== undefined) cached.content = data.content;
      if (body.components !== undefined) cached.components = body.components;
      cached.editedAt = new Date();
      cached.editedTimestamp = cached.editedAt.getTime();
      return cached;
    }
    const app = this.client.user;
    return channel.messages.add({
      author: app ? { type: "application", application_id: app.id, name: app.username } : undefined,
      created_at: edit ? undefined : new Date().toISOString(),
      edited_at: edit ? new Date().toISOString() : null,
      components: body.components,
      ...data,
    });
  }

  /**
   * Answer with a new message. `ephemeral: true` shows it only to the member.
   *
   * Resolves to what the API answered — the message's JSON, or `{ id }` for a private reply — as
   * discord.js resolves to an InteractionResponse. With `fetchReply: true` a public reply resolves
   * to the Message instead, as in discord.js.
   * @param {any} options
   */
  async reply(options) {
    const body = this.body(options);
    const file = await this.#file(options, body.ephemeral);
    const result = await this.client.core.rest.post(`${this.base}/callback`, { type: "reply", ...body }, file);
    this.replied = true;
    this.ephemeral = body.ephemeral;
    if (typeof options === "object" && options?.fetchReply) return this._messageFrom(result, body, false);
    return result?.message ?? null;
  }

  /**
   * Acknowledge now, answer later with `editReply()`. The member sees "thinking…". Privacy is
   * decided here: `{ ephemeral: true }` makes the eventual answer private.
   * @param {{ ephemeral?: boolean }} [options]
   */
  async deferReply(options = {}) {
    await this.client.core.rest.post(`${this.base}/callback`, { type: "defer", ephemeral: Boolean(options.ephemeral) });
    this.deferred = true;
    this.ephemeral = Boolean(options.ephemeral);
  }

  /**
   * Send the answer after a defer, or change the one already sent. Resolves to the Message, or to
   * the raw `{ id }` when the answer is private. @param {any} options
   */
  async editReply(options) {
    if (pickFile(options)) throw new XiveUnsupportedError("Files on editReply()", "use reply() or followUp() with the file");
    const { ephemeral: _ignored, ...body } = this.body(options);
    const result = await this.client.core.rest.patch(`${this.base}/original`, body);
    this.replied = true;
    // After deferReply() this SENDS the answer (a whole message, with its author); otherwise it
    // edits one, and the API answers `{ id, content }`.
    return this._messageFrom(result, body, !result?.message?.author);
  }

  /**
   * Another message after the first. `ephemeral` per message. Resolves to the Message, or to the
   * raw `{ id }` for a private one. @param {any} options
   */
  async followUp(options) {
    const body = this.body(options);
    const file = await this.#file(options, body.ephemeral);
    const result = await this.client.core.rest.post(`${this.base}/followups`, body, file);
    return this._messageFrom(result, body, false);
  }

  /** The one file in `options.files`, resolved — not on a private reply, which cannot carry one. */
  async #file(/** @type {any} */ options, /** @type {boolean} */ ephemeral) {
    const picked = pickFile(options);
    if (!picked) return null;
    if (ephemeral) throw new XiveUnsupportedError("Files on ephemeral replies", "send the file in a public reply or follow-up");
    return resolveFile(picked);
  }
}

/** A slash command. */
export class CommandInteraction extends BaseInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    super(client, hub, data);
    this.commandId = data.command.id;
    this.commandName = data.command.name;
    this.options = new CommandOptions(this, data.options ?? [], data.subcommand ?? null, data.subcommand_group ?? null);
  }

  /**
   * Open a form. The member's answers arrive as a ModalSubmitInteraction — wait for it with
   * `awaitModalSubmit()`, or handle it in `interactionCreate`.
   * @param {any} modal a ModalBuilder or its JSON
   */
  async showModal(modal) {
    await this.client.core.rest.post(`${this.base}/callback`, {
      type: "modal", modal: typeof modal?.toJSON === "function" ? modal.toJSON() : modal,
    });
  }

  /**
   * The member's submission of the form this interaction opened.
   * @param {{ filter?: (i: any) => boolean, time?: number }} [options]
   */
  awaitModalSubmit(options = {}) {
    return awaitModalFrom(this, options);
  }
}

/**
 * A press or a choice on a message's controls, and a form submitted from one: the shared
 * `update()` / `deferUpdate()`, which change the message the control is on instead of answering
 * with a new one.
 */
class MessageBoundInteraction extends BaseInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    super(client, hub, data);
    this.customId = data.custom_id;
    /**
     * The message the control is on, with its current content and components. A private message
     * is a plain `{ id, ephemeral: true, content, components }`.
     */
    this.message = null;
    if (data.message?.private) {
      // A private reply: not a channel message, so a plain object with what the event carried.
      this.message = { id: data.message.id, ephemeral: true, content: data.message.content ?? null, components: data.message.components ?? [] };
    } else if (data.message) {
      // A button press carries the message as it is now (content and components), as on Discord.
      const cached = this.channel.messages.cache.get(data.message.id);
      this.message = cached ?? new Message(client, this.channel, { id: data.message.id, content: data.message.content, components: data.message.components });
      if (cached && data.message.components) {
        cached.components = data.message.components;
        if (data.message.content !== undefined) cached.content = data.message.content;
      }
    }
  }

  /**
   * Rewrite the message the control is on — e.g. disable the buttons, show the result. Resolves to
   * what the API answered (`{ id, content }`, or `{ id }` for a private message); with
   * `fetchReply: true`, to the updated Message, as in discord.js. @param {any} options
   */
  async update(options) {
    const { ephemeral: _ignored, ...body } = this.body(options);
    const result = await this.client.core.rest.post(`${this.base}/callback`, { type: "update", ...body });
    this.replied = true;
    if (typeof options === "object" && options?.fetchReply) return this._messageFrom(result, body, true);
    return result?.message ?? null;
  }

  /** Acknowledge without changing anything yet; `editReply()` then edits the message. */
  async deferUpdate() {
    await this.client.core.rest.post(`${this.base}/callback`, { type: "defer_update" });
    this.deferred = true;
  }
}

/** A button press or a select-menu choice. */
export class MessageComponentInteraction extends MessageBoundInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    super(client, hub, data);
    this.componentType = data.component_type;
    /** The chosen values, for a select menu. Empty for a button. @type {string[]} */
    this.values = data.values ?? [];
    const r = data.resolved ?? {};
    /**
     * For a user, role, mentionable or channel select: what was picked, by id — discord.js's
     * `interaction.users`, `.members`, `.roles` and `.channels`. Empty for anything else.
     */
    this.users = new Collection(Object.entries(r.users ?? {}).map(([id, u]) =>
      [id, client.users.add({ id, username: u.username ?? null, name: u.display_name ?? null })]));
    /** @type {Collection<string, { nick: string | null }>} */
    this.members = new Collection(Object.entries(r.members ?? {}).map(([id, m]) => [id, { nick: m?.nick ?? null }]));
    /** @type {Collection<string, { id: string, name: string, color: string | null }>} */
    this.roles = new Collection(Object.entries(r.roles ?? {}));
    /** @type {Collection<string, { id: string, name: string, kind: string }>} */
    this.channels = new Collection(Object.entries(r.channels ?? {}));
  }

  isButton() { return this.componentType === ComponentType.Button; }
  isStringSelectMenu() { return this.componentType === ComponentType.StringSelect; }
  isUserSelectMenu() { return this.componentType === ComponentType.UserSelect; }
  isRoleSelectMenu() { return this.componentType === ComponentType.RoleSelect; }
  isMentionableSelectMenu() { return this.componentType === ComponentType.MentionableSelect; }
  isChannelSelectMenu() { return this.componentType === ComponentType.ChannelSelect; }
  /** Any select menu. */
  isAnySelectMenu() { return this.componentType >= ComponentType.StringSelect && this.componentType !== ComponentType.TextInput; }

  /** @param {any} modal a ModalBuilder or its JSON */
  async showModal(modal) {
    await this.client.core.rest.post(`${this.base}/callback`, {
      type: "modal", modal: typeof modal?.toJSON === "function" ? modal.toJSON() : modal,
    });
  }

  /** @param {{ filter?: (i: any) => boolean, time?: number }} [options] */
  awaitModalSubmit(options = {}) {
    return awaitModalFrom(this, options);
  }
}

/** A form the member filled in and sent. */
export class ModalSubmitInteraction extends MessageBoundInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    super(client, hub, data);
    this.fields = new ModalFields(data.fields ?? []);
  }

  /** True when the form was opened from a button or menu, so `update()` has a message to change. */
  isFromMessage() { return this.message !== null; }
}

/** `interaction.fields` on a submitted form. */
class ModalFields {
  /** @param {{ custom_id: string, value: string }[]} fields */
  constructor(fields) {
    /** @type {Collection<string, { customId: string, value: string }>} */
    this.fields = new Collection(fields.map((f) => [f.custom_id, { customId: f.custom_id, value: f.value }]));
  }

  /** @param {string} customId */
  getTextInputValue(customId) {
    const field = this.fields.get(customId);
    if (!field) throw new TypeError(`No field with custom id "${customId}"`);
    return field.value;
  }

  /** @param {string} customId */
  getField(customId) {
    const field = this.fields.get(customId);
    if (!field) throw new TypeError(`No field with custom id "${customId}"`);
    return field;
  }
}

/**
 * Wait for the form an interaction opened. A submission does not say which interaction opened its
 * form, so it is matched by member and channel — and by the caller's `filter`, which is where a bot
 * checks the form's customId, exactly as discord.js bots do.
 *
 * @param {BaseInteraction} origin @param {{ filter?: (i: any) => boolean, time?: number }} options
 */
function awaitModalFrom(origin, options) {
  return origin.client.awaitOne(origin.client.collect(
    (/** @type {any} */ i) => i.isModalSubmit() && i.user.id === origin.user.id && i.channelId === origin.channelId,
    { ...options, max: 1 }
  ));
}

/** Build the right class for an `interaction.created` event. @param {Client} client @param {Hub} hub @param {any} data */
export function createInteraction(client, hub, data) {
  if (data.type === "autocomplete") return new AutocompleteInteraction(client, hub, data);
  if (data.type === "component") return new MessageComponentInteraction(client, hub, data);
  if (data.type === "modal_submit") return new ModalSubmitInteraction(client, hub, data);
  return new CommandInteraction(client, hub, data);
}

/**
 * A member is typing into an option you marked `setAutocomplete(true)` — answer with suggestions.
 * Exactly discord.js's shape: `interaction.options.getFocused()`, then `respond(choices)`.
 *
 * ```js
 * if (interaction.isAutocomplete()) {
 *   const typed = interaction.options.getFocused();
 *   await interaction.respond(fruits.filter((f) => f.startsWith(typed)).slice(0, 25).map((f) => ({ name: f, value: f })));
 * }
 * ```
 *
 * Values are what has been TYPED so far — strings, even for an integer option. Answer within a
 * few seconds or the suggestions are dropped; there is nothing else to send.
 */
export class AutocompleteInteraction extends BaseInteraction {
  /** @param {Client} client @param {Hub} hub @param {any} data */
  constructor(client, hub, data) {
    super(client, hub, data);
    this.commandId = data.command.id;
    this.commandName = data.command.name;
    this.options = new CommandOptions(this, data.options ?? [], data.subcommand ?? null, data.subcommand_group ?? null);
    this.responded = false;
  }

  /** @param {{ name: string, value: string | number }[]} choices up to 25 */
  async respond(choices) {
    await this.client.core.rest.post(`${this.base}/callback`, {
      type: "autocomplete",
      choices: choices.map((c) => ({ name: c.name, value: c.value })),
    });
    this.responded = true;
  }
}

/** `interaction.options` — the values the member typed, by option name. */
class CommandOptions {
  /**
   * @param {CommandInteraction} interaction @param {any[]} data
   * @param {string | null} [subcommand] @param {string | null} [group]
   */
  constructor(interaction, data, subcommand = null, group = null) {
    this.interaction = interaction;
    this.subcommand = subcommand;
    this.subcommandGroup = group;
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

  /**
   * Autocomplete only: what the member is typing into the focused option — or, with `getFull`,
   * `{ name, type, value }`.
   * @param {boolean} [getFull]
   */
  getFocused(getFull = false) {
    const focused = this.data.find((o) => o.focused) ?? null;
    if (getFull) return focused;
    return focused?.value ?? "";
  }

  /** The raw `{ name, type, value, resolved? }`. @param {string} name @param {boolean} [required] */
  get(name, required = false) {
    const option = this.data.get(name) ?? null;
    if (!option && required) throw new TypeError(`Required option "${name}" was not provided`);
    return option;
  }

  /**
   * The subcommand the member ran — `"ban"` for `/mod ban`. Throws when there is none, unless
   * `required` is false, as in discord.js.
   * @param {boolean} [required] @returns {string | null}
   */
  getSubcommand(required = true) {
    if (!this.subcommand && required) throw new TypeError("This command was run without a subcommand");
    return this.subcommand;
  }

  /** The subcommand group — `"role"` for `/mod role add` — or null. @param {boolean} [required] @returns {string | null} */
  getSubcommandGroup(required = false) {
    if (!this.subcommandGroup && required) throw new TypeError("This command was run without a subcommand group");
    return this.subcommandGroup;
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
