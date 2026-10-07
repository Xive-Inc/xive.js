// Type definitions for xive.js. Hand-written; keep in step with src/.
/// <reference types="node" />

import { EventEmitter } from "node:events";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

/* ── Constants ─────────────────────────────────────────────────────────────────────────────── */

export declare const Events: {
  readonly ClientReady: "ready";
  readonly MessageCreate: "messageCreate";
  readonly MessageUpdate: "messageUpdate";
  readonly MessageDelete: "messageDelete";
  readonly MessageReactionAdd: "messageReactionAdd";
  readonly MessageReactionRemove: "messageReactionRemove";
  readonly MessagePollVoteAdd: "messagePollVoteAdd";
  readonly MessagePollVoteRemove: "messagePollVoteRemove";
  readonly MemberAdd: "memberAdd";
  readonly MemberRemove: "memberRemove";
  readonly MemberUpdate: "memberUpdate";
  readonly BanAdd: "banAdd";
  readonly BanRemove: "banRemove";
  readonly HubCreate: "hubCreate";
  readonly InteractionCreate: "interactionCreate";
  readonly PresenceUpdate: "presenceUpdate";
  readonly ForumPostCreate: "forumPostCreate";
  readonly ForumPostUpdate: "forumPostUpdate";
  readonly Disconnect: "disconnect";
  readonly Reconnect: "reconnect";
  readonly Error: "error";
  readonly Debug: "debug";
};
/** An event name the Client emits. */
export type Events = (typeof Events)[keyof typeof Events];

/**
 * Xive's permission keys under discord.js's names. The values are the keys the API speaks.
 */
export declare const Permissions: {
  readonly CreateInstantInvite: "hub_manage_invites";
  readonly KickMembers: "mod_kick";
  readonly BanMembers: "mod_ban";
  readonly ModerateMembers: "mod_timeout";
  readonly WarnMembers: "mod_warn";
  readonly ManageChannels: "conv_manage_channels";
  readonly ManageHub: "hub_customize";
  readonly Administrator: "hub_administrator";
  readonly ManageRoles: "hub_manage_roles";
  readonly AssignRoles: "hub_assign_roles";
  readonly ManageNicknames: "hub_manage_nicknames";
  readonly ManageWebhooks: "conv_manage_webhooks";
  readonly ManageMessages: "conv_delete_messages";
  readonly PinMessages: "conv_pin_messages";
  readonly ManageThreads: "conv_manage_threads";
  readonly ManageEvents: "event_manager";
  readonly ViewAuditLog: "hub_view_audit";
  readonly ViewChannel: "conv_view";
  readonly SendMessages: "conv_post";
  readonly SendMessagesInThreads: "conv_send_in_threads";
  readonly CreateThreads: "conv_create_threads";
  readonly AddReactions: "conv_react";
  readonly SendPolls: "conv_create_polls";
  readonly EmbedLinks: "conv_embed_links";
  readonly AttachFiles: "conv_attach_files";
  readonly MentionEveryone: "conv_mention_everyone";
  readonly MentionRoles: "conv_mention_roles";
  readonly UseExternalEmojis: "conv_use_external_emoji";
  readonly UseExternalStickers: "conv_use_external_stickers";
  readonly LockChannels: "conv_lock";
  readonly Connect: "room_connect";
  readonly MuteMembers: "room_mute";
  readonly DeafenMembers: "room_deafen";
  readonly MoveMembers: "room_move";
};
/** A permission key as the API speaks it (`"mod_ban"`). */
export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];
/** A friendly permission name (`"BanMembers"`). */
export type PermissionName = keyof typeof Permissions;
/** Either form; `has()`, `any()` and `setDefaultMemberPermissions()` take both. */
export type PermissionResolvable = PermissionKey | PermissionName;

export declare const ActivityType: {
  readonly Playing: "playing";
  readonly Watching: "watching";
  readonly Listening: "listening";
  readonly Competing: "competing";
  readonly Custom: "custom";
};
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export declare const ChannelKind: {
  readonly Text: "conversation";
  readonly Thread: "thread";
  readonly LiveRoom: "live_room";
  readonly RolePicker: "role_picker";
  /** Holds posts, not messages — see `channel.posts`. */
  readonly Forum: "forum";
};
export type ChannelKind = (typeof ChannelKind)[keyof typeof ChannelKind];

export declare const ComponentType: {
  readonly ActionRow: 1;
  readonly Button: 2;
  readonly StringSelect: 3;
  readonly TextInput: 4;
  readonly UserSelect: 5;
  readonly RoleSelect: 6;
  readonly MentionableSelect: 7;
  readonly ChannelSelect: 8;
};
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType];

export declare const ButtonStyle: {
  readonly Primary: 1;
  readonly Secondary: 2;
  readonly Success: 3;
  readonly Danger: 4;
  readonly Link: 5;
};
export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle];

export declare const TextInputStyle: {
  readonly Short: 1;
  readonly Paragraph: 2;
};
export type TextInputStyle = (typeof TextInputStyle)[keyof typeof TextInputStyle];

export declare const OptionType: {
  readonly String: "string";
  readonly Integer: "integer";
  readonly Boolean: "boolean";
  readonly User: "user";
  readonly Channel: "channel";
  readonly Role: "role";
  readonly Subcommand: "subcommand";
  readonly SubcommandGroup: "subcommand_group";
};
export type OptionType = (typeof OptionType)[keyof typeof OptionType];

export declare const Colors: {
  readonly Default: number; readonly White: number; readonly Aqua: number; readonly Green: number;
  readonly Blue: number; readonly Yellow: number; readonly Purple: number; readonly LuminousVividPink: number;
  readonly Fuchsia: number; readonly Gold: number; readonly Orange: number; readonly Red: number;
  readonly Grey: number; readonly Navy: number; readonly DarkAqua: number; readonly DarkGreen: number;
  readonly DarkBlue: number; readonly DarkPurple: number; readonly DarkGold: number; readonly DarkOrange: number;
  readonly DarkRed: number; readonly Blurple: number; readonly Greyple: number; readonly NotQuiteBlack: number;
};

/* ── Collection ────────────────────────────────────────────────────────────────────────────── */

/** discord.js's `Collection`: a Map with array helpers. */
export declare class Collection<K, V> extends Map<K, V> {
  constructor(entries?: Iterable<readonly [K, V]> | null);
  find<V2 extends V>(fn: (value: V, key: K, collection: this) => value is V2): V2 | undefined;
  find(fn: (value: V, key: K, collection: this) => unknown): V | undefined;
  findKey(fn: (value: V, key: K, collection: this) => unknown): K | undefined;
  filter<V2 extends V>(fn: (value: V, key: K, collection: this) => value is V2): Collection<K, V2>;
  filter(fn: (value: V, key: K, collection: this) => unknown): Collection<K, V>;
  map<T>(fn: (value: V, key: K, collection: this) => T): T[];
  some(fn: (value: V, key: K, collection: this) => unknown): boolean;
  every(fn: (value: V, key: K, collection: this) => unknown): boolean;
  /** Unlike Array#reduce, the initial value is required. */
  reduce<T>(fn: (accumulator: T, value: V, key: K) => T, initial: T): T;
  first(): V | undefined;
  first(n: number): V[];
  last(): V | undefined;
  last(n: number): V[];
  firstKey(): K | undefined;
  lastKey(): K | undefined;
  random(): V | undefined;
  each(fn: (value: V, key: K) => void): this;
  /** Sorts in place. */
  sort(compare?: (a: V, b: V) => number): this;
  clone(): Collection<K, V>;
  toJSON(): V[];
}

/* ── Errors ────────────────────────────────────────────────────────────────────────────────── */

/** A refusal from the Xive API. Branch on `type` and `code`, not `status`. */
export declare class XiveAPIError extends Error {
  constructor(
    error: { type?: string; code?: string; message?: string; requestId?: string },
    status: number,
    method: string,
    path: string,
  );
  name: "XiveAPIError";
  type: string;
  code: string | null;
  status: number;
  requestId: string | null;
  method: string;
  path: string;
}

/** Something Xive does not do, thrown at the call. */
export declare class XiveUnsupportedError extends Error {
  constructor(feature: string, hint?: string);
  name: "XiveUnsupportedError";
  feature: string;
}

/* ── Raw API shapes ────────────────────────────────────────────────────────────────────────── */

/** A component as JSON (Discord's component shape). */
export interface APIComponent {
  type: number;
  [key: string]: any;
}
/** An action row as JSON. */
export interface APIActionRow {
  type: 1;
  components: APIComponent[];
}
/** An embed as JSON. */
export interface APIEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; icon_url?: string; url?: string };
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: EmbedField[];
  [key: string]: any;
}
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
/** A form as JSON. */
export interface APIModal {
  custom_id: string;
  title: string;
  components: (APIActionRow | APIComponent)[];
  [key: string]: any;
}
/**
 * A message as the API returns it — what `reply()` and `update()` resolve to without
 * `fetchReply`. A public reply's is the message's JSON; an edit's is `{ id, content }`; a private
 * one's is `{ id }`.
 */
export interface APIMessage {
  id: string;
  [key: string]: any;
}
/** A private (ephemeral) answer: only its id. It is not a channel message, so never a Message. */
export interface APIEphemeralMessage {
  id: string;
}
/** A slash command as the API stores it. */
export interface APIApplicationCommand {
  id?: string;
  name: string;
  description: string;
  invoker_permission?: string | null;
  options?: APICommandOption[];
  [key: string]: any;
}
export interface APICommandChoice {
  name: string;
  value: string | number;
}
export interface APICommandOption {
  type: OptionType;
  name: string;
  description: string;
  required?: boolean;
  choices?: APICommandChoice[];
  autocomplete?: boolean;
  options?: APICommandOption[];
}

/* ── Files ─────────────────────────────────────────────────────────────────────────────────── */

/** A file to send. Xive takes up to 10 files per message. */
export declare class AttachmentBuilder {
  /** @param attachment bytes, a file path, or an http(s) URL */
  constructor(attachment: Uint8Array | string, data?: { name?: string; description?: string });
  attachment: Uint8Array | string;
  name: string | null;
  description: string | null;
  setFile(attachment: Uint8Array | string): this;
  setName(name: string): this;
  setDescription(description: string): this;
}

/** Anything `files` takes: a Buffer, a path, an http(s) URL, `{ attachment, name }`, or an AttachmentBuilder. */
export type AttachmentResolvable =
  | AttachmentBuilder
  | Uint8Array
  | string
  | { attachment: Uint8Array | string; name?: string; description?: string };

/* ── Builders ──────────────────────────────────────────────────────────────────────────────── */

/**
 * A number, `"#rrggbb"` or `"rrggbb"`, `[r, g, b]`, a name from `Colors` (`"Red"`), or `"Random"` —
 * what discord.js's `setColor` takes. Anything else throws a TypeError.
 */
export type ColorResolvable =
  | number
  | `#${string}`
  | readonly [red: number, green: number, blue: number]
  | `${HexDigit}${HexDigit}${string}`
  | keyof typeof Colors
  | "Random";
/** One hex digit — enough of the type to tell bare `"ff0000"` from a misspelt colour name. */
type HexDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "a" | "b" | "c" | "d" | "e" | "f" | "A" | "B" | "C" | "D" | "E" | "F";

export declare class EmbedBuilder {
  constructor(data?: APIEmbed);
  data: APIEmbed;
  setTitle(title: string | null): this;
  setDescription(text: string | null): this;
  setURL(url: string | null): this;
  setColor(color: ColorResolvable | null): this;
  setTimestamp(timestamp?: Date | number | null): this;
  setAuthor(author: { name: string; iconURL?: string; url?: string } | null): this;
  setFooter(footer: { text: string; iconURL?: string } | null): this;
  setImage(url: string | null): this;
  setThumbnail(url: string | null): this;
  addFields(...fields: (EmbedField | readonly EmbedField[])[]): this;
  setFields(...fields: (EmbedField | readonly EmbedField[])[]): this;
  spliceFields(index: number, deleteCount: number, ...fields: EmbedField[]): this;
  toJSON(): APIEmbed;
  static from(other: EmbedBuilder | APIEmbed): EmbedBuilder;
}

/** One slash-command option, as built in `addStringOption((o) => …)` and friends. */
export interface SlashCommandOptionBuilder {
  type: OptionType;
  name: string;
  description: string;
  required: boolean;
  choices: APICommandChoice[] | undefined;
  autocomplete: boolean;
  setName(name: string): this;
  setDescription(description: string): this;
  setRequired(required?: boolean): this;
  /** String and integer options only, and not with `addChoices`. */
  setAutocomplete(autocomplete?: boolean): this;
  addChoices(...choices: (APICommandChoice | readonly APICommandChoice[])[]): this;
  setChoices(...choices: (APICommandChoice | readonly APICommandChoice[])[]): this;
  toJSON(): APICommandOption;
}

type OptionCallback = (option: SlashCommandOptionBuilder) => SlashCommandOptionBuilder;

/** The `add…Option` methods shared by a command and a subcommand. */
interface SharedOptionAdders {
  addStringOption(fn: OptionCallback): this;
  addIntegerOption(fn: OptionCallback): this;
  addBooleanOption(fn: OptionCallback): this;
  addUserOption(fn: OptionCallback): this;
  addChannelOption(fn: OptionCallback): this;
  addRoleOption(fn: OptionCallback): this;
}

export interface SlashCommandSubcommandBuilder extends SharedOptionAdders {}
/** One subcommand: `/mod ban`. */
export declare class SlashCommandSubcommandBuilder {
  constructor();
  type: "subcommand";
  name: string;
  description: string;
  options: SlashCommandOptionBuilder[];
  setName(name: string): this;
  setDescription(description: string): this;
  toJSON(): { type: "subcommand"; name: string; description: string; options: APICommandOption[] };
}

/** A group of subcommands: the `role` in `/mod role add`. */
export declare class SlashCommandSubcommandGroupBuilder {
  constructor();
  type: "subcommand_group";
  name: string;
  description: string;
  options: SlashCommandSubcommandBuilder[];
  setName(name: string): this;
  setDescription(description: string): this;
  addSubcommand(fn: (subcommand: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder): this;
  toJSON(): { type: "subcommand_group"; name: string; description: string; options: APICommandOption[] };
}

export interface SlashCommandBuilder extends SharedOptionAdders {}
/** A slash command: options, or subcommands and groups — not both. */
export declare class SlashCommandBuilder {
  constructor();
  name: string;
  description: string;
  options: (SlashCommandOptionBuilder | SlashCommandSubcommandBuilder | SlashCommandSubcommandGroupBuilder)[];
  invoker_permission: string | null;
  setName(name: string): this;
  setDescription(description: string): this;
  /** Who may run it: a permission the member must hold in the channel. */
  setDefaultMemberPermissions(permission: PermissionKey | null): this;
  addSubcommand(fn: (subcommand: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder): this;
  addSubcommandGroup(fn: (group: SlashCommandSubcommandGroupBuilder) => SlashCommandSubcommandGroupBuilder): this;
  toJSON(): { name: string; description: string; options: APICommandOption[]; invoker_permission: string | null };
}

/** A partial emoji for a button or select option: a unicode string, or `{ id }` / `{ name }`. */
export type ComponentEmojiResolvable = string | { name?: string; id?: string };

export declare class ButtonBuilder {
  constructor(data?: Partial<APIComponent>);
  data: APIComponent;
  setCustomId(customId: string): this;
  setLabel(label: string): this;
  setStyle(style: ButtonStyle): this;
  setEmoji(emoji: ComponentEmojiResolvable): this;
  /** For `ButtonStyle.Link`. */
  setURL(url: string): this;
  setDisabled(disabled?: boolean): this;
  toJSON(): APIComponent;
}

export interface SelectMenuOptionData {
  label: string;
  value: string;
  description?: string;
  emoji?: ComponentEmojiResolvable;
  default?: boolean;
}

export declare class StringSelectMenuOptionBuilder {
  constructor(data?: Partial<SelectMenuOptionData>);
  data: Partial<SelectMenuOptionData>;
  setLabel(label: string): this;
  setValue(value: string): this;
  setDescription(description: string): this;
  setEmoji(emoji: ComponentEmojiResolvable): this;
  setDefault(isDefault?: boolean): this;
  toJSON(): SelectMenuOptionData;
}

type SelectMenuOptionResolvable = StringSelectMenuOptionBuilder | SelectMenuOptionData;

export declare class StringSelectMenuBuilder {
  constructor(data?: Partial<APIComponent>);
  data: APIComponent;
  setCustomId(customId: string): this;
  setPlaceholder(placeholder: string): this;
  setMinValues(n: number): this;
  setMaxValues(n: number): this;
  setDisabled(disabled?: boolean): this;
  addOptions(...options: (SelectMenuOptionResolvable | readonly SelectMenuOptionResolvable[])[]): this;
  setOptions(...options: (SelectMenuOptionResolvable | readonly SelectMenuOptionResolvable[])[]): this;
  toJSON(): APIComponent;
}

export interface SelectMenuDefaultValue {
  id: string;
  type: "user" | "role" | "channel";
}

/** The selects Xive fills itself (members, roles, both, channels). */
declare class AutoSelectMenuBuilder {
  protected constructor(type: number, data?: Partial<APIComponent>);
  data: APIComponent;
  setCustomId(customId: string): this;
  setPlaceholder(placeholder: string): this;
  setMinValues(n: number): this;
  setMaxValues(n: number): this;
  setDisabled(disabled?: boolean): this;
  setDefaultValues(...values: (SelectMenuDefaultValue | readonly SelectMenuDefaultValue[])[]): this;
  toJSON(): APIComponent;
}

export declare class UserSelectMenuBuilder extends AutoSelectMenuBuilder {
  constructor(data?: Partial<APIComponent>);
  setDefaultUsers(...ids: string[]): this;
}
export declare class RoleSelectMenuBuilder extends AutoSelectMenuBuilder {
  constructor(data?: Partial<APIComponent>);
  setDefaultRoles(...ids: string[]): this;
}
export declare class MentionableSelectMenuBuilder extends AutoSelectMenuBuilder {
  constructor(data?: Partial<APIComponent>);
}
export declare class ChannelSelectMenuBuilder extends AutoSelectMenuBuilder {
  constructor(data?: Partial<APIComponent>);
  setDefaultChannels(...ids: string[]): this;
  /** Discord's numbers: 0 text, 2 voice, 13 stage (live rooms). */
  setChannelTypes(...types: number[]): this;
}

export declare class TextInputBuilder {
  constructor(data?: Partial<APIComponent>);
  data: APIComponent;
  setCustomId(customId: string): this;
  setLabel(label: string): this;
  setStyle(style: TextInputStyle): this;
  setMinLength(n: number): this;
  setMaxLength(n: number): this;
  setRequired(required?: boolean): this;
  setValue(value: string): this;
  setPlaceholder(placeholder: string): this;
  toJSON(): APIComponent;
}

/** Anything that can sit in an action row. */
export type ActionRowComponentBuilder =
  | ButtonBuilder
  | StringSelectMenuBuilder
  | UserSelectMenuBuilder
  | RoleSelectMenuBuilder
  | MentionableSelectMenuBuilder
  | ChannelSelectMenuBuilder
  | TextInputBuilder;

/**
 * A row of up to five buttons, or one select menu, or (in a form) one text input. The type
 * parameter is for code ported from discord.js (`new ActionRowBuilder<ButtonBuilder>()`).
 */
export declare class ActionRowBuilder<T extends ActionRowComponentBuilder = ActionRowComponentBuilder> {
  constructor(data?: { components?: (T | APIComponent)[] });
  data: { type: 1; [key: string]: any };
  components: APIComponent[];
  addComponents(...components: (T | APIComponent | readonly (T | APIComponent)[])[]): this;
  setComponents(...components: (T | APIComponent | readonly (T | APIComponent)[])[]): this;
  toJSON(): APIActionRow;
}

type ModalRowResolvable = ActionRowBuilder<TextInputBuilder> | ActionRowBuilder | APIActionRow;

/** A form, opened with `interaction.showModal(modal)`. */
export declare class ModalBuilder {
  constructor(data?: Partial<APIModal>);
  data: Partial<APIModal>;
  components: APIComponent[];
  setCustomId(customId: string): this;
  setTitle(title: string): this;
  addComponents(...rows: (ModalRowResolvable | readonly ModalRowResolvable[])[]): this;
  setComponents(...rows: (ModalRowResolvable | readonly ModalRowResolvable[])[]): this;
  toJSON(): APIModal;
}

/* ── Sending messages ──────────────────────────────────────────────────────────────────────── */

/** discord.js's PollData. `duration` is in hours (1 to 168, default 24). */
export interface PollData {
  question: { text: string } | string;
  answers: readonly (PollAnswerData | string)[];
  duration?: number;
  allowMultiselect?: boolean;
}
export interface PollAnswerData {
  text: string;
  /** A unicode emoji, or `{ id }` for one of the hub's own. */
  emoji?: string | { id: string } | { name: string };
}
/** The API's own poll shape, passed through as is. */
export interface APIPollData {
  question: string;
  answers: readonly { text: string; emoji?: string }[];
  duration_hours?: number;
  allow_multiselect?: boolean;
}

/** What a reply points at: a message id, a Message, or `{ messageId }`. */
export type MessageReferenceResolvable = string | { messageId: string } | { id: string };

export interface BaseMessageOptions {
  content?: string | null;
  /** Sent as embeds; beside layout components, as Containers that draw the same card. */
  embeds?: readonly (EmbedBuilder | APIEmbed)[];
  /** Rows of buttons or a select menu. `[]` on an edit removes them. */
  components?: readonly (ActionRowBuilder<any> | APIActionRow | APIComponent)[];
}

export interface MessageCreateOptions extends BaseMessageOptions {
  /** Up to 10 files, sent in order. More than 10 throws XiveUnsupportedError. */
  files?: readonly AttachmentResolvable[];
  /** A poll is the whole message: no content, files, embeds or components with it. */
  poll?: PollData | APIPollData;
  reply?: { messageReference: MessageReferenceResolvable };
  messageReference?: MessageReferenceResolvable;
}

export type MessageReplyOptions = Omit<MessageCreateOptions, "reply" | "messageReference">;

/** An edit cannot change the file or the poll. */
export type MessageEditOptions = BaseMessageOptions;

export interface InteractionReplyOptions extends BaseMessageOptions {
  /** Only the member sees it. An ephemeral reply cannot carry files. */
  ephemeral?: boolean;
  /** Up to 10 files, sent in order. More than 10 throws XiveUnsupportedError. */
  files?: readonly AttachmentResolvable[];
  poll?: PollData | APIPollData;
  /** `reply()` resolves to the Message (not the API's JSON), as in discord.js. */
  fetchReply?: boolean;
}

export type InteractionEditReplyOptions = BaseMessageOptions;
export interface InteractionUpdateOptions extends BaseMessageOptions {
  /** `update()` resolves to the updated Message (not the API's JSON), as in discord.js. */
  fetchReply?: boolean;
}

/** Options that make an answer private. */
export type EphemeralReplyOptions = InteractionReplyOptions & { ephemeral: true };
/** Options for an answer everyone in the channel sees. */
export type PublicReplyOptions = InteractionReplyOptions & { ephemeral?: false };

/* ── Permissions ───────────────────────────────────────────────────────────────────────────── */

/** A set of permission keys. `has()` takes Xive keys or `Permissions` names. */
export declare class PermissionSet {
  constructor(keys?: Iterable<string>);
  keys: Set<string>;
  static resolve(permission: string): string;
  /** All of them. */
  has(permission: PermissionResolvable | readonly PermissionResolvable[]): boolean;
  /** At least one. */
  any(permission: PermissionResolvable | readonly PermissionResolvable[]): boolean;
  toArray(): string[];
}

/* ── Users ─────────────────────────────────────────────────────────────────────────────────── */

export declare class User {
  constructor(
    client: Client,
    data: { id: string; username?: string | null; name?: string | null; avatar_url?: string | null; bot?: boolean },
  );
  client: Client;
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
  system: boolean;
  discriminator: string;
  readonly tag: string;
  readonly displayName: string;
  readonly partial: false;
  displayAvatarURL(): string | null;
  avatarURL(): string | null;
  /** `<user:id>` — interpolating a user mentions them. */
  toString(): string;
  /** Always rejects: applications cannot DM. */
  send(...args: any[]): Promise<never>;
  /** Always rejects: applications cannot DM. */
  createDM(): Promise<never>;
}

/** The statuses a bot can set. */
export type ClientPresenceStatus = "online" | "away" | "busy" | "invisible";

export interface ActivityData {
  name: string;
  /** Defaults to `playing`. */
  type?: ActivityType;
}

export interface PresenceData {
  status?: ClientPresenceStatus;
  /** `null` clears it. */
  activity?: ActivityData | null;
}

/** The bot's presence as Xive stored it. */
export interface ClientPresence {
  status: ClientPresenceStatus;
  activity: { type: ActivityType; name: string } | null;
}

export declare class ClientUser extends User {
  constructor(client: Client, app: { id: string; name: string; icon_url?: string | null });
  /** The presence last set from this process, or null before the first `setPresence`. */
  presence: ClientPresence | null;
  /** A key left out is unchanged; `activity: null` clears it. */
  setPresence(data: PresenceData): Promise<ClientPresence>;
  /** With no name, clears the activity. */
  setActivity(name?: string | ActivityData | null, options?: { type?: ActivityType }): Promise<ClientPresence>;
  setStatus(status: ClientPresenceStatus): Promise<ClientPresence>;
}

/* ── Roles ─────────────────────────────────────────────────────────────────────────────────── */

export declare class Role {
  constructor(client: Client, hub: Hub, data: any);
  client: Client;
  hub: Hub;
  id: string;
  name: string;
  hexColor: string;
  color: number;
  position: number;
  managed: boolean;
  permissions: PermissionSet;
  /** `<role:id>` — interpolating a role mentions it. */
  toString(): string;
  /** `permissions` is the role's whole new set; your application can only add or remove ones it has. */
  edit(data: RoleEditOptions): Promise<any>;
  /** Replace the role's permissions — only ones your application has itself can change. */
  setPermissions(permissions: RolePermissionsResolvable): Promise<this>;
  delete(): Promise<any>;
}

/** A role's whole permission set: one permission, several, or a PermissionSet. */
export type RolePermissionsResolvable = PermissionResolvable | readonly PermissionResolvable[] | PermissionSet;

export interface RoleEditOptions {
  name?: string;
  color?: string;
  /** Sent as the role's rank. */
  position?: number;
  permissions?: RolePermissionsResolvable;
}

/** A role a member holds that the hub's role cache does not know. */
export interface UncachedRole {
  id: string;
  name: string;
  position: number;
  permissions?: undefined;
  toString(): string;
}

export type RoleResolvable = string | Role;

/* ── Members ───────────────────────────────────────────────────────────────────────────────── */

/** `member.roles`. */
export interface MemberRoleManager {
  member: Member;
  roleIds: string[];
  readonly cache: Collection<string, Role | UncachedRole>;
  readonly highest: Role | UncachedRole | null;
  add(roles: RoleResolvable | readonly RoleResolvable[] | Collection<string, Role>): Promise<Member>;
  remove(roles: RoleResolvable | readonly RoleResolvable[] | Collection<string, Role>): Promise<Member>;
}

export declare class Member {
  constructor(client: Client, hub: Hub, data: any);
  client: Client;
  hub: Hub;
  id: string;
  user: User;
  nickname: string | null;
  joinedAt: Date | null;
  joinedTimestamp: number | null;
  communicationDisabledUntil: Date | null;
  roles: MemberRoleManager;
  /** True when built from an event that did not carry the whole member. */
  partial: boolean;
  readonly path: string;
  readonly displayName: string;
  readonly communicationDisabledTimestamp: number | null;
  /** The union of the member's roles' permissions. */
  readonly permissions: PermissionSet;
  isCommunicationDisabled(): boolean;
  toString(): string;
  fetch(): Promise<Member>;
  kick(reason?: string): Promise<this>;
  ban(options?: { reason?: string; deleteMessageSeconds?: number }): Promise<this>;
  /** `ms` how long, or null to lift. */
  timeout(ms: number | null, reason?: string): Promise<this>;
  disableCommunicationUntil(until: Date | number | null, reason?: string): Promise<this>;
  setNickname(nickname: string | null): Promise<this>;
  edit(data: {
    nick?: string | null;
    roles?: RoleResolvable | readonly RoleResolvable[] | Collection<string, Role>;
    communicationDisabledUntil?: Date | number | null;
  }): Promise<this>;
  /** Always rejects: applications cannot DM. */
  send(...args: any[]): Promise<never>;
}

export type UserResolvable = string | User | Member;

/* ── Messages ──────────────────────────────────────────────────────────────────────────────── */

/** One entry of a message's `attachments` array, as the API sends it. */
export interface APIAttachment {
  /** Null on a message sent before attachments had ids. */
  id: string | null;
  url: string;
  /** The MIME type, e.g. `image/png`. */
  type: string | null;
  filename?: string | null;
  size?: number | null;
}

/** A file on a received message — discord.js's `Attachment`. */
export declare class Attachment {
  constructor(data: APIAttachment);
  /** Null on a message sent before attachments had ids (its key in `message.attachments` is then its position). */
  id: string | null;
  url: string;
  /** The same as `url`: Xive serves files from where they are stored. */
  proxyURL: string;
  contentType: string | null;
  /** The filename, or the last part of the URL when the message has none. */
  name: string;
  /** Bytes, or null when unknown. */
  size: number | null;
  /** Always false: Xive has no spoiler files. */
  spoiler: false;
}

/** @deprecated Use `Attachment`. */
export type MessageAttachment = Attachment;

/**
 * What a message mentions — the server's `mentions` list. A user it names is added to
 * `client.users`; a role or channel this process has not cached is a stub with just id and name.
 */
export interface MessageMentions {
  everyone: boolean;
  users: Collection<string, User>;
  roles: Collection<string, Role>;
  channels: Collection<string, Channel>;
  /**
   * discord.js's `has()`: true for @everyone (unless `ignoreEveryone`), for a user, role or
   * channel the message mentions (unless `ignoreDirect`), and for a member holding a mentioned
   * role (unless `ignoreRoles`). Takes an object or an id.
   */
  has(
    target: User | Member | Role | Channel | string | null | undefined,
    options?: { ignoreDirect?: boolean; ignoreRoles?: boolean; ignoreEveryone?: boolean },
  ): boolean;
}

export interface MessageComponentCollectorOptions<T extends Interaction = MessageComponentInteraction> {
  filter?: (interaction: T) => boolean;
  /** Stop after this many milliseconds. */
  time?: number;
  /** Stop after collecting this many. */
  max?: number;
  componentType?: ComponentType;
}

export declare class Message {
  constructor(client: Client, channel: Channel, data: any);
  client: Client;
  channel: Channel;
  channelId: string;
  hub: Hub;
  hubId: string;
  id: string;
  /** True when built from an event that carried only the id. */
  partial: boolean;
  content: string | null;
  createdAt: Date | null;
  createdTimestamp: number | null;
  editedAt: Date | null;
  editedTimestamp: number | null;
  reference: { messageId: string; channelId: string; hubId: string } | null;
  /** The message's files, in order, keyed by attachment id (or by position, as a string, when the id is null). */
  attachments: Collection<string, Attachment>;
  embeds: APIEmbed[];
  /** Action rows of buttons / select menus, as JSON. */
  components: APIComponent[];
  pinned: boolean;
  poll: Poll | null;
  system: boolean;
  tts: boolean;
  author: User | null;
  member: Member | null;
  webhookId: string | null;
  mentions: MessageMentions;
  readonly url: string | null;
  readonly editable: boolean;
  readonly deletable: boolean;
  readonly pinnable: boolean;
  toString(): string;
  fetch(): Promise<this>;
  reply(options: string | MessageReplyOptions): Promise<Message>;
  edit(options: string | MessageEditOptions): Promise<this>;
  delete(): Promise<this>;
  react(emoji: string | { id?: string | null; name?: string | null }): Promise<MessageReaction>;
  pin(): Promise<this>;
  unpin(): Promise<this>;
  startThread(options: { name: string }): Promise<Channel>;
  createMessageComponentCollector(
    options?: MessageComponentCollectorOptions,
  ): InteractionCollector<MessageComponentInteraction>;
  awaitMessageComponent(options?: Omit<MessageComponentCollectorOptions, "max">): Promise<MessageComponentInteraction>;
  fetchReference(): Promise<Message>;
}

export interface ReactionEmoji {
  /** Set for a hub emoji. */
  id: string | null;
  /** Set for a unicode emoji. */
  name: string | null;
  identifier: string;
  toString(): string;
}

export declare class MessageReaction {
  constructor(client: Client, message: Message, data: { emoji: string });
  client: Client;
  message: Message;
  emoji: ReactionEmoji;
  count: number | null;
  me: boolean;
  partial: boolean;
  remove(): Promise<this>;
  fetch(): Promise<this>;
}

/** A message's poll. `answers` is keyed by answer id, 1…N in the order given. */
export declare class Poll {
  constructor(client: Client, message: Message, data: any);
  client: Client;
  message: Message;
  partial: boolean;
  question: { text: string | null };
  answers: Collection<number, PollAnswer>;
  allowMultiselect: boolean;
  expiresAt: Date | null;
  endedAt: Date | null;
  /** True once the poll has ended, early or by expiring. */
  resultsFinalized: boolean;
  /** Distinct people who voted. */
  totalVoters: number | null;
  readonly expiresTimestamp: number | null;
  /** Ended, or past its expiry. */
  readonly ended: boolean;
  /** End the poll now. Only on the application's own messages. */
  end(): Promise<Message>;
}

export declare class PollAnswer {
  constructor(client: Client, poll: Poll, data: any);
  client: Client;
  poll: Poll;
  id: number;
  text: string | null;
  emoji: { id: string | null; name: string | null; identifier: string } | null;
  voteCount: number | null;
  readonly partial: boolean;
  fetchVoters(options?: { limit?: number }): Promise<Collection<string, User>>;
}

/* ── Channels ──────────────────────────────────────────────────────────────────────────────── */

export interface FetchMessagesOptions {
  limit?: number;
  before?: string;
  after?: string;
  cache?: boolean;
}

/** `channel.messages`. */
export interface MessageManager {
  channel: Channel;
  cache: Collection<string, Message>;
  add(data: any): Message;
  fetch(id: string): Promise<Message>;
  /** Newest first. */
  fetch(options?: FetchMessagesOptions): Promise<Collection<string, Message>>;
  delete(message: string | Message): Promise<void>;
}

export declare class Channel {
  constructor(client: Client, hub: Hub, data: any);
  client: Client;
  hub: Hub;
  hubId: string;
  id: string;
  name: string;
  slug: string | null;
  topic: string | null;
  parentId: string | null;
  /** One of ChannelKind (other kinds, such as `announcement`, may appear). */
  kind: ChannelKind | (string & {});
  messages: MessageManager;
  /** A forum's tag catalogue; null on other kinds. */
  forumTags: ForumTag[] | null;
  /** A forum's settings; null on other kinds. */
  forumSettings: ForumSettings | null;
  /** A forum's posts. */
  posts: ForumPostManager;
  threads: {
    create(options: { name: string; startMessage?: string | Message }): Promise<Channel>;
  };
  /** False for a role picker and a forum (nobody posts into a forum itself). */
  isTextBased(): boolean;
  isThread(): boolean;
  isVoiceBased(): boolean;
  isForum(): boolean;
  /** The channel's address in the app, or null for one that has none. */
  readonly url: string | null;
  /** `<channel:id>` — interpolating a channel links it. */
  toString(): string;
  send(options: string | MessageCreateOptions): Promise<Message>;
  /** One by one: fine for dozens, not thousands. */
  bulkDelete(
    messages: number | readonly (string | Message)[] | Collection<string, Message>,
  ): Promise<Collection<string, { id: string }>>;
  /** Shows "<app> is typing…" for ten seconds, or until your next message in the channel. */
  sendTyping(): Promise<void>;
  setLocked(locked?: boolean): Promise<this>;
  /**
   * Replace a forum's whole tag catalogue (up to 20). Send a tag's `id` to keep it; one left out is
   * deleted. Re-reads the hub's channels afterwards, so `forumTags` carries the new ids.
   */
  setForumTags(tags: readonly ForumTagData[]): Promise<this>;
  /** Change a forum's settings. Keys left out keep their value. */
  setForumSettings(settings: Partial<ForumSettings>): Promise<this>;
}

/* ── Forums ────────────────────────────────────────────────────────────────────────────────── */

export type ForumSortOrder = "activity" | "newest" | "top";
export type ForumLayout = "list" | "gallery";
export type ForumPostStatus = "all" | "open" | "solved" | "unanswered";
/** What `forumPostUpdate` reports as changed. */
export type ForumPostChange = "title" | "applied_tags" | "pinned" | "accepted_message_id" | "archived" | "locked";

export interface ForumTag {
  id: string;
  /** Up to 24, unique in the forum ignoring case. */
  name: string;
  /** `#rrggbb`. */
  color: string | null;
  /** One emoji. */
  emoji: string | null;
  /** Only members with Manage Posts (and applications with `ManageThreads`) may apply it. */
  modOnly: boolean;
}

/** A tag as `setForumTags` takes it: an `id` keeps an existing tag; without one it is new. */
export interface ForumTagData {
  id?: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
  modOnly?: boolean;
}

export interface ForumSettings {
  /** Every post must wear at least one tag. */
  requireTag: boolean;
  defaultSort: ForumSortOrder;
  defaultLayout: ForumLayout;
}

/** A forum's tag, or its id. */
export type ForumTagResolvable = string | { id: string };

export interface ForumPostStarter {
  id: string;
  /** The first 400 characters of the opening message, as raw markdown. */
  excerpt: string;
  mediaUrl: string | null;
  mediaType: string | null;
  deleted: boolean;
}

export interface ForumPostCreateOptions extends Omit<MessageCreateOptions, "reply" | "messageReference"> {
  /** Up to 100. */
  title: string;
  /** Up to 5. Required (at least one) when the forum's `requireTag` is on. */
  tags?: readonly ForumTagResolvable[];
}

export interface ForumPostEditOptions {
  title?: string;
  /** Replaces the whole set. */
  tags?: readonly ForumTagResolvable[];
  pinned?: boolean;
  /** A reply in the post (not the opening message), or null to clear. */
  acceptedMessage?: string | Message | null;
  archived?: boolean;
  locked?: boolean;
}

export interface FetchForumPostsOptions {
  /** Defaults to the forum's `defaultSort`. */
  sort?: ForumSortOrder;
  tag?: ForumTagResolvable;
  status?: ForumPostStatus;
  /** Searches titles and opening messages. Up to 100. */
  query?: string;
  /** 0-based; 30 posts a page. */
  page?: number;
}

export interface FetchedForumPosts {
  /** Pinned posts first. */
  posts: ForumPost[];
  hasMore: boolean;
  page: number;
  sort: ForumSortOrder | null;
}

/** `channel.posts`. */
export interface ForumPostManager {
  forum: Channel;
  cache: Collection<string, ForumPost>;
  add(data: any): ForumPost;
  /** Needs `CreateThreads`. Everything but `title` and `tags` is the opening message. */
  create(options: ForumPostCreateOptions): Promise<ForumPost>;
  fetch(options?: FetchForumPostsOptions): Promise<FetchedForumPosts>;
  /** One post, with `acceptedMessage` loaded. */
  fetchOne(id: string): Promise<ForumPost>;
}

/** One post in a forum — a thread with a title, tags and an opening message. */
export declare class ForumPost {
  constructor(client: Client, forum: Channel, data: any);
  client: Client;
  forum: Channel;
  hub: Hub;
  hubId: string;
  id: string;
  forumId: string;
  title: string;
  /** The ids of the forum tags the post wears. */
  tags: string[];
  /** The member who posted; null for an application's post. */
  owner: User | null;
  /** The member or application that posted. */
  author: User | null;
  createdAt: Date | null;
  createdTimestamp: number | null;
  lastActivityAt: Date | null;
  replyCount: number;
  /** People's votes. Applications cannot vote. */
  voteCount: number;
  acceptedMessageId: string | null;
  /** Loaded by `fetch()` / `posts.fetchOne()`; otherwise null. */
  acceptedMessage: Message | null;
  solved: boolean;
  pinned: boolean;
  pinnedAt: Date | null;
  archived: boolean;
  locked: boolean;
  starter: ForumPostStarter | null;
  /** The post as a channel — its replies are its messages. */
  readonly channel: Channel;
  /** The post's address in the app, or null when its forum has none. */
  readonly url: string | null;
  fetch(): Promise<ForumPost>;
  /** A message in the post. Revives an archived (not locked) post. */
  reply(options: string | MessageCreateOptions): Promise<Message>;
  /** Needs `ManageThreads`. */
  edit(data: ForumPostEditOptions): Promise<this>;
  setAnswer(message: string | Message | null): Promise<this>;
  pin(): Promise<this>;
  unpin(): Promise<this>;
  lock(): Promise<this>;
  unlock(): Promise<this>;
  archive(): Promise<this>;
  unarchive(): Promise<this>;
  toString(): string;
}

/* ── Hubs ──────────────────────────────────────────────────────────────────────────────────── */

/** `hub.channels`. */
export interface ChannelManager {
  hub: Hub;
  cache: Collection<string, Channel>;
  add(data: any): Channel;
  fetch(): Promise<Collection<string, Channel>>;
  fetch(id: string): Promise<Channel | null>;
  create(options: {
    name: string;
    kind?: ChannelKind;
    topic?: string;
    parent?: string;
    /** Forums only. */
    forumTags?: readonly ForumTagData[];
    /** Forums only. */
    forumSettings?: Partial<ForumSettings>;
  }): Promise<Channel>;
}

/** `hub.members`. */
export interface MemberManager {
  hub: Hub;
  cache: Collection<string, Member>;
  add(data: any): Member;
  fetch(id: string): Promise<Member>;
  fetch(options: { user: string }): Promise<Member>;
  /** Every member, paging through the roster, up to `limit`. */
  fetch(options?: { limit?: number }): Promise<Collection<string, Member>>;
  kick(user: UserResolvable, reason?: string): Promise<void>;
  ban(user: UserResolvable, options?: { reason?: string | null }): Promise<void>;
  /** Lift a ban. The person can rejoin; they are not put back. */
  unban(user: UserResolvable, reason?: string): Promise<User | null>;
}

/** `hub.roles`. */
export interface RoleManager {
  hub: Hub;
  cache: Collection<string, Role>;
  everyone: Role | null;
  readonly highest: Role | null;
  fetch(): Promise<Collection<string, Role>>;
  fetch(id: string): Promise<Role | null>;
  create(options: RoleEditOptions & { name: string }): Promise<Role>;
}

/** `hub.commands` — this hub's own commands, beside the global set. discord.js's `guild.commands`. */
export interface HubCommandManager {
  hub: Hub;
  /** Replace this hub's whole command set; `[]` removes them all. */
  set(
    commands: readonly (SlashCommandBuilder | APIApplicationCommand)[],
  ): Promise<Collection<string, APIApplicationCommand>>;
  fetch(): Promise<Collection<string, APIApplicationCommand>>;
}

/** `hub.me` — the application itself in this hub. */
export declare class HubMe {
  constructor(hub: Hub, data: any);
  hub: Hub;
  /** The app's hub-wide permissions — exactly what the API checks. */
  permissions: PermissionSet;
  /** The role made when the hub installed the app. */
  readonly role: Role | null;
  /** Every role the app holds, highest first. */
  readonly roles: Collection<string, Role>;
  readonly highest: Role | null;
  /** Re-read the app's roles and permissions in this hub. */
  fetch(): Promise<this>;
}

/** A member's status, as `presenceUpdate` reports it. */
export type PresenceStatus = "online" | "away" | "busy" | "offline";

export interface PresenceActivity {
  custom: { text?: string | null; emoji?: string | null; [key: string]: any } | null;
  game: { name: string; startedAt?: string | number | null; [key: string]: any } | null;
  [key: string]: any;
}

/** A member's presence in a hub, from `presenceUpdate`. */
export declare class Presence {
  constructor(client: Client, hub: Hub, data: any);
  client: Client;
  hub: Hub;
  userId: string;
  status: PresenceStatus;
  activity: PresenceActivity | null;
  readonly user: User | null;
  readonly member: Member | null;
}

export declare class Hub {
  constructor(client: Client, data: any);
  client: Client;
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  /** When this hub installed the application. */
  joinedAt: Date | null;
  channels: ChannelManager;
  members: MemberManager;
  roles: RoleManager;
  /** Presences seen over `presenceUpdate`, by user id. */
  presences: { cache: Collection<string, Presence> };
  me: HubMe;
  /** Commands offered in this hub only. One named like a global command replaces it here. */
  commands: HubCommandManager;
  toString(): string;
}

/** What `banAdd` and `banRemove` hand you. */
export interface HubBan {
  hub: Hub;
  user: User;
  reason: string | null;
}

/* ── Interactions ──────────────────────────────────────────────────────────────────────────── */

/** Everything `interactionCreate` can hand you. */
export type Interaction =
  | CommandInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction
  | AutocompleteInteraction;

/** Interactions that can be answered with `reply()`. */
export type RepliableInteraction = CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

export declare class BaseInteraction {
  constructor(client: Client, hub: Hub, data: any);
  client: Client<true>;
  id: string;
  kind: "command" | "component" | "modal_submit" | "autocomplete";
  hub: Hub;
  hubId: string;
  channelId: string;
  channel: Channel;
  createdAt: Date;
  createdTimestamp: number;
  expiresAt: Date;
  user: User;
  member: Member;
  /** The member's permissions in THIS channel, with overrides applied. */
  memberPermissions: PermissionSet;
  deferred: boolean;
  replied: boolean;
  ephemeral: boolean | null;

  isCommand(): this is CommandInteraction;
  isChatInputCommand(): this is CommandInteraction;
  isMessageComponent(): this is MessageComponentInteraction;
  isButton(): this is ButtonInteraction;
  isStringSelectMenu(): this is StringSelectMenuInteraction;
  isUserSelectMenu(): this is UserSelectMenuInteraction;
  isRoleSelectMenu(): this is RoleSelectMenuInteraction;
  isMentionableSelectMenu(): this is MentionableSelectMenuInteraction;
  isChannelSelectMenu(): this is ChannelSelectMenuInteraction;
  isAnySelectMenu(): this is AnySelectMenuInteraction;
  isModalSubmit(): this is ModalSubmitInteraction;
  isAutocomplete(): this is AutocompleteInteraction;
  isRepliable(): this is RepliableInteraction;

  readonly base: string;
  /** The request body for `options`. */
  body(options: string | InteractionReplyOptions): Record<string, unknown> & { ephemeral: boolean };

  /**
   * Answer with a new message. `ephemeral: true` shows it only to the member. Resolves to the API's
   * JSON for the message (`{ id }` for a private one); with `fetchReply: true`, to the Message —
   * except a private reply, which is not a channel message.
   */
  reply(options: PublicReplyOptions & { fetchReply: true }): Promise<Message>;
  reply(options: EphemeralReplyOptions & { fetchReply: true }): Promise<APIEphemeralMessage>;
  reply(options: InteractionReplyOptions & { fetchReply: true }): Promise<Message | APIEphemeralMessage>;
  reply(options: string | InteractionReplyOptions): Promise<APIMessage>;
  /** Acknowledge now, answer later with `editReply()`. */
  deferReply(options?: { ephemeral?: boolean }): Promise<void>;
  /**
   * Send the answer after a defer, or change the one already sent. No files. Resolves to the
   * Message, or `{ id }` when the answer is private (decided by the earlier reply or defer).
   */
  editReply(options: string | InteractionEditReplyOptions): Promise<Message | APIEphemeralMessage>;
  /** Another message after the first. Resolves to the Message, or `{ id }` for a private one. */
  followUp(options: EphemeralReplyOptions): Promise<APIEphemeralMessage>;
  followUp(options: string | PublicReplyOptions): Promise<Message>;
  followUp(options: string | InteractionReplyOptions): Promise<Message | APIEphemeralMessage>;
}

export interface CommandInteractionOption {
  name: string;
  type: OptionType;
  value: string | number | boolean;
  focused?: boolean;
  resolved?: { username?: string; name?: string; [key: string]: any };
}

/** `interaction.options` — the values the member typed, by option name. */
export interface CommandInteractionOptionResolver {
  interaction: CommandInteraction | AutocompleteInteraction;
  subcommand: string | null;
  subcommandGroup: string | null;
  data: Collection<string, CommandInteractionOption>;
  /** Autocomplete: what the member is typing into the focused option. Always a string. */
  getFocused(getFull?: false): string;
  getFocused(getFull: true): CommandInteractionOption | null;
  get(name: string, required: true): CommandInteractionOption;
  get(name: string, required?: boolean): CommandInteractionOption | null;
  getSubcommand(required?: true): string;
  getSubcommand(required: boolean): string | null;
  getSubcommandGroup(required: true): string;
  getSubcommandGroup(required?: boolean): string | null;
  getString(name: string, required: true): string;
  getString(name: string, required?: boolean): string | null;
  getInteger(name: string, required: true): number;
  getInteger(name: string, required?: boolean): number | null;
  getBoolean(name: string, required: true): boolean;
  getBoolean(name: string, required?: boolean): boolean | null;
  getUser(name: string, required: true): User;
  getUser(name: string, required?: boolean): User | null;
  /** Partial; `await member.fetch()` for roles. */
  getMember(name: string, required: true): Member;
  getMember(name: string, required?: boolean): Member | null;
  getChannel(name: string, required: true): Channel;
  getChannel(name: string, required?: boolean): Channel | null;
  getRole(name: string, required: true): Role;
  getRole(name: string, required?: boolean): Role | null;
}

export interface AwaitModalSubmitOptions {
  filter?: (interaction: ModalSubmitInteraction) => boolean;
  time?: number;
}

/** A slash command. */
export declare class CommandInteraction extends BaseInteraction {
  kind: "command";
  commandId: string;
  commandName: string;
  /** The hub a hub command is registered to; null for a global command. */
  commandHubId: string | null;
  options: CommandInteractionOptionResolver;
  showModal(modal: ModalBuilder | APIModal): Promise<void>;
  awaitModalSubmit(options?: AwaitModalSubmitOptions): Promise<ModalSubmitInteraction>;
}
/** discord.js's name for the same thing. */
export type ChatInputCommandInteraction = CommandInteraction;

/** A private reply's message: not a channel message. */
export interface EphemeralMessageData {
  id: string;
  ephemeral: true;
  content: string | null;
  components: APIComponent[];
}

/** Shared by component presses and form submissions. */
declare class MessageBoundInteraction extends BaseInteraction {
  customId: string;
  /** The message the control is on (a plain object for a private one), or null. */
  message: Message | EphemeralMessageData | null;
  /**
   * Rewrite the message the control is on. Resolves to the API's JSON (`{ id, content }`); with
   * `fetchReply: true`, to the updated Message — or `{ id }` when that message is private.
   */
  update(options: InteractionUpdateOptions & { fetchReply: true }): Promise<Message | APIEphemeralMessage>;
  update(options: string | InteractionUpdateOptions): Promise<APIMessage>;
  /** Acknowledge without changing anything yet; `editReply()` then edits the message. */
  deferUpdate(): Promise<void>;
}

/** A button press or a select-menu choice. */
export declare class MessageComponentInteraction extends MessageBoundInteraction {
  kind: "component";
  componentType: ComponentType;
  /** The chosen values, for a select menu. Empty for a button. */
  values: string[];
  users: Collection<string, User>;
  members: Collection<string, { nick: string | null }>;
  roles: Collection<string, { id: string; name: string; color: string | null }>;
  channels: Collection<string, { id: string; name: string; kind: string }>;
  isUserSelectMenu(): this is UserSelectMenuInteraction;
  isRoleSelectMenu(): this is RoleSelectMenuInteraction;
  isMentionableSelectMenu(): this is MentionableSelectMenuInteraction;
  isChannelSelectMenu(): this is ChannelSelectMenuInteraction;
  isAnySelectMenu(): this is AnySelectMenuInteraction;
  showModal(modal: ModalBuilder | APIModal): Promise<void>;
  awaitModalSubmit(options?: AwaitModalSubmitOptions): Promise<ModalSubmitInteraction>;
}

/** Type-only narrowings of MessageComponentInteraction (there are no such runtime classes). */
export interface ButtonInteraction extends MessageComponentInteraction {
  componentType: 2;
}
export interface StringSelectMenuInteraction extends MessageComponentInteraction {
  componentType: 3;
}
export interface UserSelectMenuInteraction extends MessageComponentInteraction {
  componentType: 5;
}
export interface RoleSelectMenuInteraction extends MessageComponentInteraction {
  componentType: 6;
}
export interface MentionableSelectMenuInteraction extends MessageComponentInteraction {
  componentType: 7;
}
export interface ChannelSelectMenuInteraction extends MessageComponentInteraction {
  componentType: 8;
}
export interface AnySelectMenuInteraction extends MessageComponentInteraction {
  componentType: 3 | 5 | 6 | 7 | 8;
}

/** `interaction.fields` on a submitted form. */
export interface ModalSubmitFields {
  fields: Collection<string, { customId: string; value: string }>;
  getTextInputValue(customId: string): string;
  getField(customId: string): { customId: string; value: string };
}

/** A form the member filled in and sent. */
export declare class ModalSubmitInteraction extends MessageBoundInteraction {
  kind: "modal_submit";
  fields: ModalSubmitFields;
  /** True when opened from a button or menu, so `update()` has a message to change. */
  isFromMessage(): boolean;
}

/** A member is typing into an option marked `setAutocomplete(true)`. */
export declare class AutocompleteInteraction extends BaseInteraction {
  kind: "autocomplete";
  commandId: string;
  commandName: string;
  /** The hub a hub command is registered to; null for a global command. */
  commandHubId: string | null;
  options: CommandInteractionOptionResolver;
  responded: boolean;
  /** Up to 25 suggestions. */
  respond(choices: readonly APICommandChoice[]): Promise<void>;
}

/* ── Collectors ────────────────────────────────────────────────────────────────────────────── */

export interface InteractionCollectorEvents<T extends Interaction> {
  collect: [interaction: T];
  /** `reason` is `"time"`, `"limit"`, `"user"`, or what `stop(reason)` was given. */
  end: [collected: Collection<string, T>, reason: string];
}

export interface CollectorOptions<T extends Interaction = Interaction> {
  filter?: (interaction: T) => boolean;
  time?: number;
  max?: number;
}

/** Collects interactions matching a predicate. */
export declare class InteractionCollector<T extends Interaction = Interaction> extends EventEmitter {
  constructor(client: Client, predicate: (interaction: Interaction) => boolean, options?: CollectorOptions<T>);
  client: Client;
  filter: (interaction: T) => boolean;
  max: number;
  collected: Collection<string, T>;
  ended: boolean;
  timer: NodeJS.Timeout | null;
  stop(reason?: string): void;

  on<E extends keyof InteractionCollectorEvents<T>>(event: E, listener: (...args: InteractionCollectorEvents<T>[E]) => void): this;
  once<E extends keyof InteractionCollectorEvents<T>>(event: E, listener: (...args: InteractionCollectorEvents<T>[E]) => void): this;
  off<E extends keyof InteractionCollectorEvents<T>>(event: E, listener: (...args: InteractionCollectorEvents<T>[E]) => void): this;
  addListener<E extends keyof InteractionCollectorEvents<T>>(event: E, listener: (...args: InteractionCollectorEvents<T>[E]) => void): this;
  removeListener<E extends keyof InteractionCollectorEvents<T>>(event: E, listener: (...args: InteractionCollectorEvents<T>[E]) => void): this;
  emit<E extends keyof InteractionCollectorEvents<T>>(event: E, ...args: InteractionCollectorEvents<T>[E]): boolean;
}

/* ── Client ────────────────────────────────────────────────────────────────────────────────── */

/** Each Client event and the arguments its listeners receive. */
export interface ClientEvents {
  ready: [client: Client<true>];
  messageCreate: [message: Message];
  /** `oldMessage` is the cached copy, or a partial with only the id. */
  messageUpdate: [oldMessage: Message, newMessage: Message];
  /** The cached copy, or a partial with only the id. */
  messageDelete: [message: Message];
  messageReactionAdd: [reaction: MessageReaction, user: User];
  messageReactionRemove: [reaction: MessageReaction, user: User];
  messagePollVoteAdd: [answer: PollAnswer, userId: string];
  messagePollVoteRemove: [answer: PollAnswer, userId: string];
  memberAdd: [member: Member];
  /** Left, kicked or banned. */
  memberRemove: [member: Member];
  memberUpdate: [oldMember: Member, newMember: Member];
  banAdd: [ban: HubBan];
  banRemove: [ban: HubBan];
  /** A hub installed the application after `ready`. */
  hubCreate: [hub: Hub];
  interactionCreate: [interaction: Interaction];
  presenceUpdate: [oldPresence: Presence | null, newPresence: Presence];
  /** A post started in a forum the application can view. Its opening message also arrives as `messageCreate`. */
  forumPostCreate: [post: ForumPost];
  /** A post's title, tags, pin, answer, archive or lock changed. */
  forumPostUpdate: [post: ForumPost, changes: ForumPostChange[]];
  disconnect: [context: { code: number; reason: string; [key: string]: any }];
  reconnect: [];
  error: [error: Error];
  debug: [message: string];
}

export interface ClientOptions {
  baseURL?: string;
  /** Only for HTTP delivery. */
  signingSecret?: string;
  /** Only on Node < 22: pass the `ws` package. */
  WebSocket?: any;
  /** Set during `login()`, before `ready`. */
  presence?: PresenceData;
}

/** `client.hubs`. */
export interface HubManager {
  client: Client;
  cache: Collection<string, Hub>;
  /** Every hub that installed the application, with channels and roles loaded. */
  fetch(): Promise<Collection<string, Hub>>;
  fetch(id: string): Promise<Hub | null>;
}

/** `client.users`. */
export interface UserManager {
  client: Client;
  cache: Collection<string, User>;
  add(data: { id: string; username?: string | null; name?: string | null; avatar_url?: string | null; bot?: boolean }): User;
  /** Rejects when no hub knows the user. */
  fetch(id: string): Promise<User>;
}

/** `client.application.commands`. */
export interface ApplicationCommandManager {
  client: Client;
  /** Replace the whole command set — or, with `hubId`, that hub's own set. */
  set(
    commands: readonly (SlashCommandBuilder | APIApplicationCommand)[],
    hubId?: string,
  ): Promise<Collection<string, APIApplicationCommand>>;
  /** The global set, or with `hubId` that hub's own. */
  fetch(hubId?: string): Promise<Collection<string, APIApplicationCommand>>;
}

type If<T extends boolean, A, B = null> = T extends true ? A : T extends false ? B : A | B;

type ClientEventListener<E extends keyof ClientEvents> = (...args: ClientEvents[E]) => void | Promise<void>;

/** A Xive bot. `Client<true>` is a client after `ready`. */
export declare class Client<out Ready extends boolean = boolean> extends EventEmitter {
  constructor(options?: ClientOptions);
  options: ClientOptions;
  /** The REST, gateway and HTTP layer underneath. */
  core: If<Ready, Connection>;
  user: If<Ready, ClientUser>;
  application: If<Ready, { id: string; commands: ApplicationCommandManager }>;
  readyAt: If<Ready, Date>;
  token: If<Ready, string>;
  hubs: HubManager;
  channels: { cache: Collection<string, Channel>; fetch(id: string): Promise<Channel | null> };
  users: UserManager;

  isReady(): this is Client<true>;
  readonly readyTimestamp: If<Ready, number>;

  /** `token` defaults to `XIVE_TOKEN`. `gateway: false` for HTTP delivery only. */
  login(token?: string, options?: { gateway?: boolean }): Promise<string>;
  /** Collect interactions matching `predicate` (and `options.filter`). */
  collect<T extends Interaction = Interaction>(
    predicate: (interaction: Interaction) => boolean,
    options?: CollectorOptions<T>,
  ): InteractionCollector<T>;
  /** The first interaction a collector gathers; rejects if it ends with none. */
  awaitOne<T extends Interaction>(collector: InteractionCollector<T>): Promise<T>;
  destroy(): Promise<void>;
  /** An HTTP handler for signed event deliveries (node:http, or Express with `express.raw`). */
  middleware(): (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => void;
  /** Serve signed event deliveries on `port`. */
  listen(port: number, options?: { path?: string }): Server;

  on<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  once<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  off<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  addListener<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  prependListener<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  prependOnceListener<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  removeListener<E extends keyof ClientEvents>(event: E, listener: ClientEventListener<E>): this;
  removeAllListeners(event?: keyof ClientEvents): this;
  emit<E extends keyof ClientEvents>(event: E, ...args: ClientEvents[E]): boolean;
  listenerCount(event: keyof ClientEvents): number;
}

/* ── Underneath ────────────────────────────────────────────────────────────────────────────── */

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Sends multipart/form-data: the body as `payload_json`, the files as `files[0]`…`files[9]`, in order. */
  files?: { data: Uint8Array; name: string }[] | null;
  /** One file — the same as `files: [file]`. */
  file?: { data: Uint8Array; name: string } | null;
}

/** The HTTP layer: Bearer auth, the envelope unwrapped, 429s waited out. */
export declare class REST {
  constructor(options: { token: string; baseURL?: string; fetch?: typeof fetch });
  token: string;
  baseURL: string;
  fetch: typeof fetch;
  /** Resolves to the response body without `success`; rejects with XiveAPIError. */
  request(method: string, path: string, options?: RequestOptions): Promise<any>;
  get(path: string, query?: Record<string, string | number | undefined>): Promise<any>;
  /** Files (up to 10, or one) go as multipart. */
  post(path: string, body?: unknown, files?: { data: Uint8Array; name: string }[] | { data: Uint8Array; name: string } | null): Promise<any>;
  put(path: string, body?: unknown): Promise<any>;
  patch(path: string, body?: unknown): Promise<any>;
  delete(path: string, body?: unknown): Promise<any>;
}

/** A raw event, as `Connection` emits it. */
export interface XiveEvent {
  id?: string;
  type: string;
  data?: any;
  [key: string]: any;
}

export interface ConnectionEvents {
  /** Each event exactly once, whichever route it came by. */
  event: [event: XiveEvent, envelope: any];
  gatewayConnect: [];
  gatewayDisconnect: [context: { code: number; reason: string; [key: string]: any }];
  debug: [info: unknown];
  error: [error: unknown];
}

export interface ConnectionOptions {
  token: string;
  signingSecret?: string;
  baseURL?: string;
  fetch?: typeof fetch;
  toleranceSeconds?: number;
  /** Only on Node < 22: pass the `ws` package. */
  WebSocket?: any;
}

type ConnectionEventListener<E extends keyof ConnectionEvents> = (...args: ConnectionEvents[E]) => void | Promise<void>;

/** REST, the gateway socket and the HTTP receiver, emitting raw events. */
export declare class Connection extends EventEmitter {
  constructor(options: ConnectionOptions);
  rest: REST;
  signingSecret: string | null;
  toleranceSeconds: number | undefined;
  /** Filled by `login()`. */
  application: { id: string; name: string; client_id: string; [key: string]: any } | null;
  seen: Set<string>;
  WebSocket: any;
  /** The centrifuge client, while connected. */
  gateway: any;

  /** Check the token and learn who this application is. */
  login(): Promise<{ id: string; name: string; client_id: string; [key: string]: any }>;
  /** Every hub that has installed this application. */
  hubs(): Promise<any[]>;
  connect(options?: { timeoutMs?: number }): Promise<void>;
  disconnect(): void;
  /** Idempotent. The signing secret comes back only the first time. */
  setEventEndpoint(url: string, options?: { events?: string[] | null }): Promise<{ subscription: any; secret?: string }>;
  getEventEndpoint(): Promise<{ subscription: any | null; types: Record<string, string> }>;
  removeEventEndpoint(): Promise<any>;
  rotateSigningSecret(): Promise<any>;
  testEventEndpoint(): Promise<any>;
  /** The last 50 deliveries and how each went. */
  deliveries(): Promise<any[]>;
  setCommands(commands: readonly APIApplicationCommand[]): Promise<any>;
  /** Handle one delivery, framework-agnostic; returns the status to answer with. */
  receive(delivery: { headers: Record<string, string | string[] | undefined>; body: string | Uint8Array }): { status: number };
  middleware(): (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => void;
  listen(port: number, options?: { path?: string }): Server;

  on<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEventListener<E>): this;
  once<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEventListener<E>): this;
  off<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEventListener<E>): this;
  addListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEventListener<E>): this;
  removeListener<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEventListener<E>): this;
  emit<E extends keyof ConnectionEvents>(event: E, ...args: ConnectionEvents[E]): boolean;
}

/** Check a delivery's signature. `body` must be the raw bytes received. */
export declare function verifySignature(input: {
  secret: string;
  eventId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string | Uint8Array;
  toleranceSeconds?: number;
  now?: number;
}): boolean;

export {};
