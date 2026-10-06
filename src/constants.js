/**
 * Event names, permissions and colours. Event names follow discord.js wherever the concept is the
 * same (`messageCreate`, `messageReactionAdd`, `interactionCreate`), and say "member" and "hub"
 * where discord.js says "guild member" and "guild".
 */

export const Events = Object.freeze({
  ClientReady: "ready",
  MessageCreate: "messageCreate",
  MessageUpdate: "messageUpdate",
  MessageDelete: "messageDelete",
  MessageReactionAdd: "messageReactionAdd",
  MessageReactionRemove: "messageReactionRemove",
  MessagePollVoteAdd: "messagePollVoteAdd",
  MessagePollVoteRemove: "messagePollVoteRemove",
  MemberAdd: "memberAdd",
  MemberRemove: "memberRemove",
  MemberUpdate: "memberUpdate",
  BanAdd: "banAdd",
  BanRemove: "banRemove",
  HubCreate: "hubCreate",
  InteractionCreate: "interactionCreate",
  PresenceUpdate: "presenceUpdate",
  Disconnect: "disconnect",
  Reconnect: "reconnect",
  Error: "error",
  Debug: "debug",
});

/**
 * Xive's permission keys, under the names a Discord bot already uses for the same thing — so
 * `PermissionFlagsBits.BanMembers` ports as `Permissions.BanMembers`. The values are the keys the
 * API speaks; `member.permissions.has()` and `setDefaultMemberPermissions()` take either.
 */
export const Permissions = Object.freeze({
  CreateInstantInvite: "hub_manage_invites",
  KickMembers: "mod_kick",
  BanMembers: "mod_ban",
  ModerateMembers: "mod_timeout",
  WarnMembers: "mod_warn",
  ManageChannels: "conv_manage_channels",
  ManageHub: "hub_customize",
  Administrator: "hub_administrator",
  ManageRoles: "hub_manage_roles",
  AssignRoles: "hub_assign_roles",
  ManageNicknames: "hub_manage_nicknames",
  ManageWebhooks: "conv_manage_webhooks",
  ManageMessages: "conv_delete_messages",
  PinMessages: "conv_pin_messages",
  ManageThreads: "conv_manage_threads",
  ManageEvents: "event_manager",
  ViewAuditLog: "hub_view_audit",
  ViewChannel: "conv_view",
  SendMessages: "conv_post",
  SendMessagesInThreads: "conv_send_in_threads",
  CreateThreads: "conv_create_threads",
  AddReactions: "conv_react",
  SendPolls: "conv_create_polls",
  EmbedLinks: "conv_embed_links",
  AttachFiles: "conv_attach_files",
  MentionEveryone: "conv_mention_everyone",
  MentionRoles: "conv_mention_roles",
  UseExternalEmojis: "conv_use_external_emoji",
  UseExternalStickers: "conv_use_external_stickers",
  LockChannels: "conv_lock",
  Connect: "room_connect",
  MuteMembers: "room_mute",
  DeafenMembers: "room_deafen",
  MoveMembers: "room_move",
});

/**
 * What a bot's activity line says — `client.user.setActivity(name, { type })`. discord.js's
 * `ActivityType` without `Streaming`, since on Xive streaming is a real live stream.
 */
export const ActivityType = Object.freeze({
  Playing: "playing",
  Watching: "watching",
  Listening: "listening",
  Competing: "competing",
  Custom: "custom",
});

/** What a channel is. `channel.kind` holds one of these. */
export const ChannelKind = Object.freeze({
  Text: "conversation",
  Thread: "thread",
  LiveRoom: "live_room",
  RolePicker: "role_picker",
});

/** Component types — Discord's numbers, which is what Xive stores. */
export const ComponentType = Object.freeze({
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  TextInput: 4,
  UserSelect: 5,
  RoleSelect: 6,
  MentionableSelect: 7,
  ChannelSelect: 8,
});

/** Button styles. `Link` opens `url` and is never sent to the bot. */
export const ButtonStyle = Object.freeze({
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
  Link: 5,
});

/** Text input styles in a form. */
export const TextInputStyle = Object.freeze({
  Short: 1,
  Paragraph: 2,
});

/** Slash-command option types, as the API names them. */
export const OptionType = Object.freeze({
  String: "string",
  Integer: "integer",
  Boolean: "boolean",
  User: "user",
  Channel: "channel",
  Role: "role",
  Subcommand: "subcommand",
  SubcommandGroup: "subcommand_group",
});

/** The same palette discord.js exports as `Colors`, for `setColor`. */
export const Colors = Object.freeze({
  Default: 0x000000, White: 0xffffff, Aqua: 0x1abc9c, Green: 0x57f287, Blue: 0x3498db, Yellow: 0xfee75c,
  Purple: 0x9b59b6, LuminousVividPink: 0xe91e63, Fuchsia: 0xeb459e, Gold: 0xf1c40f, Orange: 0xe67e22,
  Red: 0xed4245, Grey: 0x95a5a6, Navy: 0x34495e, DarkAqua: 0x11806a, DarkGreen: 0x1f8b4c,
  DarkBlue: 0x206694, DarkPurple: 0x71368a, DarkGold: 0xc27c0e, DarkOrange: 0xa84300, DarkRed: 0x992d22,
  Blurple: 0x5865f2, Greyple: 0x99aab5, NotQuiteBlack: 0x23272a,
});
