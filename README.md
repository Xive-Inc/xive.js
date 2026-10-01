# xive.js

Build bots for Xive hubs. Node 18+.

If you've written a discord.js bot, you already know this API. The patterns are the same:
`client.on(Events.MessageCreate)`, `message.reply()`, `member.timeout()`, `EmbedBuilder` and
`SlashCommandBuilder`. Xive's own words are used where the concepts differ.

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
| `channel.type === ChannelType.GuildText` | `channel.kind === ChannelKind.Text` |
| `new REST().put(Routes.applicationCommands(id), { body })` | `client.application.commands.set(commands)` |

Unchanged: `messageCreate` / `Update` / `Delete`, `messageReactionAdd` / `Remove`, `reply`,
`send`, `edit`, `delete`, `react`, `pin`, `channel.messages.fetch({ limit, before, after })`,
`bulkDelete`, `members.fetch`, `kick`, `ban`, `timeout`, `roles.add` / `remove`,
`setNickname`, `EmbedBuilder`, `Colors`, `Collection`, and `SlashCommandBuilder`.

A few things work differently:

- **Ids are uuids.** They're still strings, but you can't parse them as numbers.
- **Mentions are plain text** (`@username`, `@Role`, `#channel`). `${user}` and `${channel}`
  mention them. `<@id>`-style tokens are converted when the target is cached.
- **Things Xive doesn't have throw `XiveUnsupportedError` at the call:** DMs, file uploads,
  buttons and menus (for now), and unbanning from a bot. Subcommands aren't supported; register
  each one as its own command.
- **Not available yet:** voice, and bot presence and activity.

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
