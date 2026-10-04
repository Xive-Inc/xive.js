<div align="center">
  <br />
  <p>
    <a href="https://hub.thexive.com/developers"><img src="https://thexive.com/brand/xive-wordmark-white.png" width="128" alt="Xive" /></a>
  </p>
  <h1>xive.js</h1>
  <p><b>Build bots for Xive hubs.</b></p>
  <p>
    <a href="https://www.npmjs.com/package/xive.js"><img src="https://img.shields.io/npm/v/xive.js.svg?maxAge=3600" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/xive.js"><img src="https://img.shields.io/npm/dt/xive.js.svg?maxAge=3600" alt="npm downloads" /></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node 18+" />
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0 license" />
  </p>
</div>

## About

xive.js is a Node.js library for building bots on [Xive](https://thexive.com). It covers
the whole bot API:

- **The gateway and its events**, with no public URL needed. Signed HTTP delivery is there for
  serverless hosts.
- **An object model with caches.** Bots work with hubs, channels, members, roles and messages.
- **Slash commands, buttons, select menus and forms**, built with the same builders as
  discord.js.
- **A thin REST client** for anything below the object model.

If you've written a discord.js bot, you already know this API. The patterns are the same:
`client.on(Events.MessageCreate)`, `message.reply()`, `member.timeout()`, `EmbedBuilder` and
`SlashCommandBuilder`. Xive's own words are used where the concepts differ, so most bots port
with [a handful of renames](#porting-a-discordjs-bot).

## Installation

**Node.js 18 or newer is required.**

```sh
npm install xive.js
yarn add xive.js
pnpm add xive.js
```

You'll need an application from the [Developer Portal](https://hub.thexive.com/developers). Its
application secret (`xive_as_…`) is your bot token.

## Example usage

```js
import { Client, Events, EmbedBuilder } from "xive.js";

const client = new Client();

client.once(Events.ClientReady, (c) => console.log(`ready as ${c.user.tag}`));

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") await message.reply("Pong!");
});

client.login(process.env.XIVE_TOKEN); // your application secret, xive_as_…
```

`login()` connects out over the gateway, so the bot needs no public URL, and loads every hub that
has installed it into `client.hubs`. You only receive events from channels your install can read.

## Porting a discord.js bot

Change the import and the token, then rename the things below. The rest of the bot stays as it is.

| discord.js | xive.js |
|---|---|
| `import … from "discord.js"` | `import … from "xive.js"` |
| `new Client({ intents: [...] })` | `new Client()`. There are no intents; you get what your install can read |
| `client.login(DISCORD_TOKEN)` | `client.login(XIVE_TOKEN)` |
| `client.guilds`, `message.guild`, `member.guild` | `client.hubs`, `message.hub`, `member.hub` |
| `guildId` | `hubId` |
| `Events.GuildMemberAdd` / `Remove` / `Update` | `Events.MemberAdd` / `MemberRemove` / `MemberUpdate` |
| `Events.GuildBanAdd` / `Remove`, `Events.GuildCreate` | `Events.BanAdd` / `BanRemove`, `Events.HubCreate` |
| `PermissionFlagsBits.BanMembers` | `Permissions.BanMembers` |
| `guild.members.me.roles.cache`, `.roles.highest`, `.permissions` | `hub.me.roles`, `hub.me.highest`, `hub.me.permissions`. An app isn't a member; call `hub.me.fetch()` after its roles change |
| `channel.type === ChannelType.GuildText` | `channel.kind === ChannelKind.Text` |
| `new REST().put(Routes.applicationCommands(id), { body })` | `client.application.commands.set(commands)` |
| `setPresence({ activities: [a], status: "idle" })` | `setPresence({ activity: a, status: "away" })`. One activity; statuses are `online`, `away`, `busy`, `invisible` (`idle` → `away`, `dnd` → `busy`). Returns a Promise |

Unchanged: `messageCreate` / `Update` / `Delete`, `messageReactionAdd` / `Remove`, `reply`,
`send`, `edit`, `delete`, `react`, `pin`, `channel.messages.fetch({ limit, before, after })`,
`bulkDelete`, `members.fetch`, `kick`, `ban`, `timeout`, `roles.add` / `remove`,
`setNickname`, `EmbedBuilder`, `Colors`, `Collection`, `SlashCommandBuilder`, `ActionRowBuilder`,
`ButtonBuilder`, `StringSelectMenuBuilder`, `ModalBuilder`, `TextInputBuilder`, collectors,
`update()`, `deferUpdate()`, `showModal()` and `awaitModalSubmit()`.

A few things work differently:

- **Ids are uuids.** They're still strings, but you can't parse them as numbers.
- **Mentions are `<user:id>`, `<role:id>` and `<channel:id>`**, and `${user}`, `${member}`,
  `${role}` and `${channel}` produce them. The server stores them as `@username`, `@Role` and the
  channel's link (a #channel pill for readers who can see it), so that is what received messages
  contain. Discord's `<@id>`, `<@&id>` and `<#id>` are converted for you.
- **Embeds are sent as components.** Xive takes no embeds from an application, so each
  `EmbedBuilder` is sent as a Container that draws the same card (title, description, fields,
  thumbnail, image, footer, colour; author and footer icons are dropped). `content` sent with
  components or embeds becomes the Text Display above them, since Xive refuses content beside
  components. Text across the message is capped at 4000 characters.
- **One file per message.** `files: [path | Buffer | URL | new AttachmentBuilder(…)]` works on
  `send()`, `reply()` and `followUp()`, up to 32 MB. Not on ephemeral replies or edits.
- **Things Xive doesn't have throw `XiveUnsupportedError` at the call:** DMs, more than one file,
  polls and stickers.
- **Presence shows only while the bot is connected to the gateway.** An HTTP-only bot can set
  it, but it never appears. There is no `Streaming` activity type, and presence can change once
  every 4 seconds (the client waits out the limit for you).
- **Not available yet:** voice.

## Presence

```js
import { Client, ActivityType } from "xive.js";

// Set during login, before `ready`:
const client = new Client({ presence: { activity: { name: "/help", type: ActivityType.Listening } } });

// Or any time after:
await client.user.setActivity(`${client.hubs.cache.size} hubs`, { type: ActivityType.Watching });
await client.user.setStatus("away");
await client.user.setActivity(); // clears it
```

Xive keeps the last presence you set, across restarts. It shows under the bot's name in every hub
that installed it, but only while the bot is connected.

## Slash commands

Register once per deploy:

```js
import { SlashCommandBuilder, Permissions } from "xive.js";

await client.application.commands.set([
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban someone")
    .addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Why"))
    .setDefaultMemberPermissions(Permissions.BanMembers),
]);
```

Then answer them, the same way as in discord.js:

```js
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.commandName !== "ban") return;
  const target = interaction.options.getUser("target", true);
  await interaction.deferReply();                               // the member sees "thinking…"
  await interaction.hub.members.ban(target.id, { reason: interaction.options.getString("reason") });
  await interaction.editReply(`Banned ${target}`);
  await interaction.followUp({ content: "Logged.", ephemeral: true }); // only they see this
});
```

- **Timing:** reply or defer within about 3 seconds, or the member sees "didn't respond". You
  then have 15 minutes to follow up.
- **Private replies:** `ephemeral: true` shows a reply only to the member who ran the command.
- **Permissions:** `interaction.memberPermissions` is the member's permissions in that channel.
- **Option getters:** `getString`, `getInteger`, `getBoolean`, `getUser`, `getMember`,
  `getChannel` and `getRole`.

### Autocomplete

```js
new SlashCommandBuilder().setName("fruit").setDescription("Pick a fruit")
  .addStringOption((o) => o.setName("name").setDescription("Which").setRequired(true).setAutocomplete(true));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;
  const typed = interaction.options.getFocused();
  await interaction.respond(fruits.filter((f) => f.startsWith(typed)).slice(0, 25).map((f) => ({ name: f, value: f })));
});
```

## Buttons, menus and forms

Components use the same builders and JSON as discord.js:

```js
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "xive.js";

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("yes").setLabel("Yes").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("no").setLabel("No").setStyle(ButtonStyle.Danger),
);
const message = await channel.send({ content: "Vote!", components: [row] });

const press = await message.awaitMessageComponent({ time: 60_000 });
await press.update({ content: `You voted ${press.customId}`, components: [] });
```

- **Handling presses:** handle them in `interactionCreate` with `isButton()`,
  `isStringSelectMenu()` and `isModalSubmit()`, or collect them per message with
  `message.createMessageComponentCollector()`.
- **Answering a press:** `update()` rewrites the message the control is on, and `deferUpdate()`
  acknowledges it silently. `reply()`, `deferReply()` and `followUp()` work as they do for
  commands.
- **Forms:** `interaction.showModal(modal)` opens a form from a command or a press. The answers
  arrive as a `ModalSubmitInteraction`; await it with `awaitModalSubmit()` and read
  `fields.getTextInputValue(id)`.

## HTTP delivery instead of the gateway

If you'd rather receive signed POSTs, for example on a serverless host:

```js
const client = new Client({ signingSecret: process.env.XIVE_SIGNING_SECRET });
await client.login(process.env.XIVE_TOKEN, { gateway: false });
client.listen(3000); // or app.post("/xive", express.raw({ type: "application/json" }), client.middleware())
```

Register the URL once per deploy with `examples/register.js`. Your listeners are the same either
way, and an event that arrives over both routes is only handled once.

## Underneath

`Connection` gives you raw REST, the gateway and the HTTP receiver without the object model. It
emits `event(event, envelope)`. `REST` and `verifySignature` are exported too.

## Links

- [Developer Portal](https://hub.thexive.com/developers)
- [Developer docs](https://hub.thexive.com/developers/docs/intro)
- [Quick start](https://hub.thexive.com/developers/docs/quick-start)
- [API reference](https://hub.thexive.com/developers/docs/reference)
- [Change log](https://hub.thexive.com/developers/docs/changelog)
- [npm](https://www.npmjs.com/package/xive.js)

## Examples

[`examples/`](examples) has runnable bots:

- [`ping-bot.js`](examples/ping-bot.js) is the smallest working bot.
- [`pingpong.js`](examples/pingpong.js) covers every reply path: chat commands, public and
  private slash replies, deferred replies, buttons, menus and forms.
- [`register.js`](examples/register.js) registers your HTTP delivery URL.

```sh
XIVE_TOKEN=xive_as_… node examples/pingpong.js
```

## Contributing

Before opening an issue or a pull request, check the [docs](https://hub.thexive.com/developers/docs/intro)
and the existing issues to see whether it's already covered.

Run the tests with:

```sh
npm test
```

## Help

If you're stuck or something isn't behaving the way the docs say it should, start with the
[developer docs](https://hub.thexive.com/developers/docs/intro) and the
[status codes](https://hub.thexive.com/developers/docs/status-codes) page, then open an issue.

## Acknowledgements

xive.js follows the API design of [discord.js](https://discord.js.org), so a Discord bot ports with
a few renames. Thanks to its maintainers. xive.js is its own code and is not affiliated with
Discord or discord.js.

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Versions up to 0.1.1 were released under MIT.
