// A ping-pong test bot: one chat command and three slash commands, covering every reply path.
//
//   cd /opt/xive-hub/packages/xive.js
//   XIVE_TOKEN=xive_as_… node examples/pingpong.js
//
// What to try in a hub that has installed the app:
//   !ping              → replies "Pong!" to your message
//   /ping              → public reply, with the round-trip time
//   /pong              → private reply, only you see it
//   /slowping seconds  → "thinking…", then the answer after N seconds, then a private follow-up
//
// The app's install needs View Channels and Send Messages (conv_view, conv_post) in the channel.
import { Client, Events, SlashCommandBuilder, EmbedBuilder, Colors } from "../src/index.js";

const client = new Client();

client.once(Events.ClientReady, async (c) => {
  console.log(`✓ logged in as ${c.user.tag}`);
  console.log(`✓ installed in ${c.hubs.cache.size} hub(s): ${c.hubs.cache.map((h) => h.name).join(", ") || "none yet"}`);

  // Registered on every start; it is a bulk replace, so this is idempotent.
  await c.application.commands.set([
    new SlashCommandBuilder().setName("ping").setDescription("Is the bot alive?"),
    new SlashCommandBuilder().setName("pong").setDescription("A reply only you can see"),
    new SlashCommandBuilder()
      .setName("slowping")
      .setDescription("Think for a bit, then answer")
      .addIntegerOption((o) => o.setName("seconds").setDescription("How long to think (1-10)").setRequired(true)),
  ]);
  console.log("✓ registered /ping, /pong and /slowping. Type / in the composer.");
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() === "!ping") {
    console.log(`!ping from ${message.author.username} in ${message.hub.name} ${message.channel}`);
    await message.reply("Pong! 🏓");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  console.log(`/${interaction.commandName} from ${interaction.user.username} in ${interaction.hub.name}`);

  if (interaction.commandName === "ping") {
    const ms = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Pong! 🏓").setColor(Colors.Green).setDescription(`Round trip: ${ms} ms`)],
    });
  }

  if (interaction.commandName === "pong") {
    await interaction.reply({ content: "Ping! 🏓 (only you can see this)", ephemeral: true });
  }

  if (interaction.commandName === "slowping") {
    const seconds = Math.min(10, Math.max(1, interaction.options.getInteger("seconds", true)));
    await interaction.deferReply();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    await interaction.editReply(`Pong! 🏓 …after thinking for ${seconds}s`);
    await interaction.followUp({ content: "That was a deferred reply plus a private follow-up.", ephemeral: true });
  }
});

client.on(Events.Disconnect, () => console.log("… gateway disconnected, reconnecting"));
client.on(Events.Reconnect, () => console.log("✓ gateway connected"));
client.on(Events.Error, (err) => console.error("✗", err.message ?? err));

process.on("SIGINT", async () => {
  await client.destroy();
  process.exit(0);
});

client.login(process.env.XIVE_TOKEN).catch((err) => {
  console.error(`✗ login failed: ${err.message}`);
  if (err.type === "AuthError") console.error("  Check XIVE_TOKEN: it should be the application secret (xive_as_…) from hub.thexive.com/developers.");
  process.exit(1);
});
