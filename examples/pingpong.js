// A ping-pong test bot: one chat command and three slash commands, covering every reply path.
//
//   XIVE_TOKEN=xive_as_… node examples/pingpong.js
//
// What to try in a hub that has installed the app:
//   !ping              → replies "Pong!" to your message
//   /ping              → public reply, with the round-trip time
//   /pong              → private reply, only you see it
//   /slowping seconds  → "thinking…", then the answer after N seconds, then a private follow-up
//   /buttons           → buttons, a menu and a form: press, pick, fill in
//
// The app's install needs View Channels and Send Messages (conv_view, conv_post) in the channel.
import {
  Client, Events, SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from "../src/index.js";

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
    new SlashCommandBuilder().setName("buttons").setDescription("Buttons, a menu and a form"),
  ]);
  console.log("✓ registered /ping, /pong, /slowping and /buttons. Type / in the composer.");
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content.trim().toLowerCase() === "!ping") {
    console.log(`!ping from ${message.author.username} in ${message.hub.name} #${message.channel.name}`);
    await message.reply("Pong! 🏓");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Buttons, menus and forms arrive here too; they are handled (and logged) further down.
  if (!interaction.isChatInputCommand()) return;
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

// /buttons: one message with every kind of control, and what each one does when used.
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "buttons") {
    await interaction.reply({
      content: "Try these:",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("bump").setLabel("Count: 0").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("secret").setLabel("Private reply").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("form").setLabel("Open a form").setStyle(ButtonStyle.Success).setEmoji("📝"),
          new ButtonBuilder().setLabel("Xive").setStyle(ButtonStyle.Link).setURL("https://hub.thexive.com"),
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("fruit").setPlaceholder("Pick fruit (up to 2)").setMinValues(1).setMaxValues(2)
            .addOptions(
              { label: "Apple", value: "apple", emoji: { name: "🍎" } },
              { label: "Banana", value: "banana", emoji: { name: "🍌" } },
              { label: "Cherry", value: "cherry", emoji: { name: "🍒" } },
            ),
        ),
      ],
    });
    return;
  }

  if (interaction.isButton()) {
    console.log(`button "${interaction.customId}" from ${interaction.user.username}`);
    if (interaction.customId === "bump") {
      // update() rewrites the message the button is on: the count lives in the label.
      const count = Number(/\d+/.exec(interaction.message?.components?.[0]?.components?.[0]?.label ?? "")?.[0] ?? 0) + 1;
      const rows = interaction.message?.components ?? [];
      await interaction.update({
        content: "Try these:",
        components: rows.length ? [{ type: 1, components: rows[0].components.map((/** @type {any} */ c) =>
          c.custom_id === "bump" ? { ...c, label: `Count: ${count}` } : c) }, ...rows.slice(1)] : [],
      });
    }
    if (interaction.customId === "secret") {
      await interaction.reply({ content: "🤫 Only you can see this.", ephemeral: true });
    }
    if (interaction.customId === "form") {
      await interaction.showModal(new ModalBuilder().setCustomId("feedback").setTitle("Quick form").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Your name").setStyle(TextInputStyle.Short).setMaxLength(40)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("idea").setLabel("Your idea").setStyle(TextInputStyle.Paragraph).setRequired(false)),
      ));
    }
  }

  if (interaction.isStringSelectMenu()) {
    console.log(`menu "${interaction.customId}" → ${interaction.values.join(", ")}`);
    await interaction.reply({ content: `You picked: ${interaction.values.join(" and ")}`, ephemeral: true });
  }

  if (interaction.isModalSubmit() && interaction.customId === "feedback") {
    const name = interaction.fields.getTextInputValue("name");
    const idea = interaction.fields.getTextInputValue("idea") || "(none)";
    console.log(`form from ${interaction.user.username}: ${name} / ${idea}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Thanks, ${name}!`).setDescription(idea).setColor(Colors.Blurple)] });
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
