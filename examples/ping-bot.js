// The smallest useful bot: answers !ping, welcomes newcomers, logs what it hears.
//
//   XIVE_TOKEN=xive_as_… node examples/ping-bot.js
//
// Connects out over the gateway — no public URL, no tunnel.
import { Client, Events, EmbedBuilder, Colors } from "../src/index.js";

const client = new Client();

client.once(Events.ClientReady, (c) => {
  console.log(`logged in as ${c.user.tag}, in ${c.hubs.cache.size} hub(s)`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  console.log(`[${message.hub.name} #${message.channel.name}] ${message.author.username}: ${message.content}`);

  if (message.content === "!ping") {
    await message.reply("Pong!");
  }
  if (message.content === "!hub") {
    const embed = new EmbedBuilder()
      .setTitle(message.hub.name)
      .setColor(Colors.Blurple)
      .addFields({ name: "Channels", value: String(message.hub.channels.cache.size), inline: true });
    await message.channel.send({ embeds: [embed] });
  }
});

client.on(Events.MemberAdd, async (member) => {
  const general = member.hub.channels.cache.find((c) => c.name === "general");
  await general?.send(`Welcome, ${member}!`);
});

client.on(Events.Error, (err) => console.error(err));

client.login(process.env.XIVE_TOKEN);
