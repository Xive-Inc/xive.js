// Type tests for types/index.d.ts. Checked, never run. See README "TypeScript".
import {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelKind,
  Client,
  Collection,
  Colors,
  ComponentType,
  EmbedBuilder,
  Events,
  ModalBuilder,
  Permissions,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  XiveAPIError,
  XiveUnsupportedError,
  Connection,
  REST,
  verifySignature,
} from "xive.js";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  Channel,
  ClientPresence,
  CommandInteraction,
  HubBan,
  Interaction,
  Member,
  Message,
  MessageComponentInteraction,
  MessageReaction,
  ModalSubmitInteraction,
  PollAnswer,
  Presence,
  User,
} from "xive.js";

/** Compile-time equality check. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function expectType<T>(_value: T): void {}
function assertType<T extends true>(): void {}

const client = new Client({ presence: { status: "away", activity: { name: "/help", type: ActivityType.Listening } } });

/* ── Events: listener params are inferred ─────────────────────────────────────────────────── */

client.once(Events.ClientReady, async (c) => {
  expectType<Client<true>>(c);
  // After ready, user is not null.
  console.log(c.user.tag);
  const presence = await c.user.setPresence({ status: "busy", activity: { name: "40 hubs", type: ActivityType.Watching } });
  expectType<ClientPresence>(presence);
  await c.user.setActivity("/help", { type: ActivityType.Listening });
  await c.user.setActivity();
  await c.user.setStatus("invisible");
  // @ts-expect-error — Discord's "idle" is "away" on Xive
  await c.user.setStatus("idle");
  // @ts-expect-error — no Streaming activity type
  await c.user.setActivity("live", { type: "streaming" });
  // @ts-expect-error — one activity, not discord.js's `activities` array
  await c.user.setPresence({ activities: [{ name: "x" }] });
});

// Before ready, user may be null.
// @ts-expect-error — client.user is ClientUser | null
client.user.setStatus("online");
if (client.isReady()) expectType<string>(client.user.id);

client.on(Events.MessageCreate, async (message) => {
  assertType<Equals<typeof message, Message>>();
  if (message.author?.bot) return;
  if (message.content === "!ping") await message.reply("Pong!");

  const embed = new EmbedBuilder().setTitle("Hi").setColor(Colors.Blue).setColor("#ff0000").setColor([1, 2, 3]).addFields({ name: "a", value: "b" });
  // @ts-expect-error — colour names are not resolved
  embed.setColor("Red");
  const sent = await message.channel.send({ content: "with file", embeds: [embed], files: [new AttachmentBuilder("./a.png", { name: "a.png" })] });
  expectType<Message>(sent);
  await message.channel.send({ files: [Buffer.from("x"), { attachment: "https://example.com/a.png", name: "a.png" }] });

  // Polls
  const pollMessage = await message.channel.send({
    poll: { question: { text: "Best map?" }, answers: [{ text: "Dust", emoji: "🏜️" }, { text: "Inferno" }], duration: 24, allowMultiselect: false },
  });
  const poll = pollMessage.poll;
  if (poll) {
    expectType<string | null>(poll.question.text);
    expectType<boolean>(poll.resultsFinalized);
    const voters = await poll.answers.get(1)?.fetchVoters({ limit: 100 });
    expectType<Collection<string, User> | undefined>(voters);
    expectType<Message>(await poll.end());
  }

  // Components + collector
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("yes").setLabel("Yes").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("no").setLabel("No").setStyle(ButtonStyle.Danger),
  );
  // @ts-expect-error — a style must be a ButtonStyle
  new ButtonBuilder().setStyle(9);
  const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId("pick").addOptions(
      new StringSelectMenuOptionBuilder().setLabel("A").setValue("a"),
      { label: "B", value: "b" },
    ),
  );
  const vote = await message.channel.send({ content: "Vote!", components: [row, menu] });
  const collector = vote.createMessageComponentCollector({ time: 60_000, componentType: ComponentType.Button });
  collector.on("collect", (i) => expectType<MessageComponentInteraction>(i));
  collector.on("end", (collected, reason) => {
    expectType<Collection<string, MessageComponentInteraction>>(collected);
    expectType<string>(reason);
  });
  const press = await vote.awaitMessageComponent({ time: 60_000 });
  await press.update({ content: `You voted ${press.customId}`, components: [] });

  await message.react("👍");
  await message.edit({ content: "edited" });
  // @ts-expect-error — an edit cannot change the file
  await message.edit({ files: ["./a.png"] });

  if (message.channel.kind === ChannelKind.Text) await message.channel.setLocked(true);
  const history = await message.channel.messages.fetch({ limit: 10 });
  expectType<Collection<string, Message>>(history);
  expectType<Message>(await message.channel.messages.fetch("id"));
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  expectType<Message>(oldMessage);
  expectType<Message>(newMessage);
});
client.on(Events.MessageReactionAdd, (reaction, user) => {
  expectType<MessageReaction>(reaction);
  expectType<User>(user);
});
client.on(Events.MessagePollVoteAdd, (answer, userId) => {
  assertType<Equals<typeof answer, PollAnswer>>();
  assertType<Equals<typeof userId, string>>();
  console.log(`${userId} voted for ${answer.text}`);
});
client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
  assertType<Equals<typeof oldPresence, Presence | null>>();
  assertType<Equals<typeof newPresence, Presence>>();
  expectType<"online" | "away" | "busy" | "offline">(newPresence.status);
});
client.on(Events.MemberAdd, (member) => expectType<Member>(member));
client.on(Events.MemberUpdate, (before, after) => expectType<[Member, Member]>([before, after]));
client.on(Events.BanAdd, (ban) => {
  expectType<HubBan>(ban);
  expectType<string | null>(ban.reason);
});
client.on(Events.Reconnect, () => {});
client.on(Events.Debug, (info) => expectType<string>(info));
client.on("hubCreate", (hub) => expectType<string>(hub.name));

// @ts-expect-error — not an event the client emits
client.on("guildCreate", (guild: unknown) => {});
// @ts-expect-error — wrong listener parameter type for messageCreate
client.on(Events.MessageCreate, (message: Member) => {});
// @ts-expect-error — presenceUpdate's first argument may be null
client.on(Events.PresenceUpdate, (oldPresence: Presence, newPresence: Presence) => {});

/* ── Slash commands ───────────────────────────────────────────────────────────────────────── */

const commands = [
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban someone")
    .addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Why"))
    .setDefaultMemberPermissions(Permissions.BanMembers),
  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation")
    .addSubcommand((s) => s.setName("kick").setDescription("Kick").addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true)))
    .addSubcommandGroup((g) =>
      g.setName("role").setDescription("Roles").addSubcommand((s) => s.setName("add").setDescription("Add a role").addRoleOption((o) => o.setName("role").setDescription("Which"))),
    ),
  new SlashCommandBuilder()
    .setName("fruit")
    .setDescription("Pick a fruit")
    .addStringOption((o) => o.setName("name").setDescription("Which").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("count").setDescription("How many").addChoices({ name: "one", value: 1 }, { name: "two", value: 2 })),
];
// @ts-expect-error — not a permission key
new SlashCommandBuilder().setDefaultMemberPermissions("ban_people");

client.once(Events.ClientReady, async (c) => {
  const saved = await c.application.commands.set(commands);
  expectType<number>(saved.size);
});

/* ── Interactions ─────────────────────────────────────────────────────────────────────────── */

client.on(Events.InteractionCreate, async (interaction) => {
  assertType<Equals<typeof interaction, Interaction>>();

  if (interaction.isAutocomplete()) {
    assertType<Equals<typeof interaction, AutocompleteInteraction>>();
    const typed = interaction.options.getFocused();
    expectType<string>(typed);
    await interaction.respond(["apple", "pear"].filter((f) => f.startsWith(typed)).map((f) => ({ name: f, value: f })));
    return;
  }

  if (interaction.isChatInputCommand()) {
    assertType<Equals<typeof interaction, CommandInteraction>>();
    const sub = interaction.options.getSubcommand(false);
    expectType<string | null>(sub);
    expectType<string>(interaction.options.getSubcommand());
    const target = interaction.options.getUser("target", true);
    expectType<User>(target);
    expectType<string | null>(interaction.options.getString("reason"));
    expectType<number | null>(interaction.options.getInteger("count"));
    expectType<Channel | null>(interaction.options.getChannel("where"));

    if (!interaction.memberPermissions.has(Permissions.BanMembers) || !interaction.memberPermissions.has("BanMembers")) return;
    await interaction.deferReply({ ephemeral: false });
    await interaction.hub.members.ban(target.id, { reason: interaction.options.getString("reason") });
    const unbanned = await interaction.hub.members.unban(target, "appeal");
    expectType<User | null>(unbanned);
    await interaction.editReply(`Banned ${target}`);
    // @ts-expect-error — editReply cannot carry a file
    await interaction.editReply({ files: ["./a.png"] });
    await interaction.followUp({ content: "Logged.", ephemeral: true });
    await interaction.followUp({ content: "Proof", files: [new AttachmentBuilder(Buffer.from("x"), { name: "log.txt" })] });
    await interaction.followUp({ poll: { question: "Again?", answers: ["Yes", "No"] } });

    const modal = new ModalBuilder()
      .setCustomId("why")
      .setTitle("Why?")
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Text").setStyle(TextInputStyle.Paragraph)));
    await interaction.showModal(modal);
    const submitted = await interaction.awaitModalSubmit({ time: 60_000, filter: (i) => i.customId === "why" });
    expectType<ModalSubmitInteraction>(submitted);
    expectType<string>(submitted.fields.getTextInputValue("text"));
    return;
  }

  if (interaction.isButton()) {
    expectType<ButtonInteraction>(interaction);
    expectType<string>(interaction.customId);
    await interaction.update({ components: [] });
    return;
  }

  // A non-button component is still possible here.
  if (interaction.isMessageComponent()) {
    expectType<MessageComponentInteraction>(interaction);
    if (interaction.isStringSelectMenu()) expectType<string[]>(interaction.values);
    if (interaction.isUserSelectMenu()) expectType<Collection<string, User>>(interaction.users);
    await interaction.deferUpdate();
    return;
  }

  if (interaction.isModalSubmit()) {
    assertType<Equals<typeof interaction, ModalSubmitInteraction>>();
    await interaction.reply({ content: "Thanks", ephemeral: true });
  }

  // @ts-expect-error — only component interactions have isUserSelectMenu()
  interaction.isUserSelectMenu();
});

/* ── Hubs, members, roles ─────────────────────────────────────────────────────────────────── */

async function moderation(c: Client<true>) {
  const hub = c.hubs.cache.first();
  if (!hub) return;
  const member = await hub.members.fetch("someone");
  expectType<Member>(member);
  const all = await hub.members.fetch({ limit: 50 });
  expectType<Collection<string, Member>>(all);
  await hub.members.ban(member, { reason: "spam" });
  await hub.members.unban("someone");
  await member.timeout(60_000, "cool off");
  await member.roles.add(["role-id"]);
  await member.setNickname(null);
  expectType<boolean>(hub.me.permissions.has([Permissions.ManageRoles, "KickMembers"]));
  // @ts-expect-error — not a permission
  hub.me.permissions.has("Administrator");
  const role = await hub.roles.fetch("role-id");
  if (role) expectType<number>(role.position);
  const fetched = await c.hubs.fetch("hub-id");
  if (fetched) expectType<string>(fetched.id);
  // @ts-expect-error — a hub ban takes options, not a bare reason string
  await hub.members.ban(member, "spam");
}

/* ── Errors and the raw layer ─────────────────────────────────────────────────────────────── */

async function raw() {
  try {
    await new REST({ token: "xive_as_x" }).get("/hubs/applications/@me");
  } catch (err) {
    if (err instanceof XiveAPIError) expectType<string | null>(err.code);
    if (err instanceof XiveUnsupportedError) expectType<string>(err.feature);
  }
  const core = new Connection({ token: "xive_as_x" });
  core.on("event", (event) => expectType<string>(event.type));
  expectType<boolean>(verifySignature({ secret: "s", eventId: "e", timestamp: "t", signature: "sig", body: "{}" }));
}

void moderation;
void raw;
client.login(process.env.XIVE_TOKEN);
