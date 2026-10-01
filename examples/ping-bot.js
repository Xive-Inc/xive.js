// The smallest useful bot: answers !ping, and logs everything else it hears.
//
//   XIVE_TOKEN=xive_as_… XIVE_SIGNING_SECRET=… node examples/ping-bot.js
//
// Listens on :3000 (PORT to change). Xive only delivers to https, so put a tunnel in front:
//   cloudflared tunnel --url http://localhost:3000
// then run register.js with the https URL it prints.
import { Client } from "../src/index.js";

const client = new Client({
  token: process.env.XIVE_TOKEN,
  signingSecret: process.env.XIVE_SIGNING_SECRET,
});

client.on("ready", (app) => console.log(`logged in as ${app.name}`));
client.on("ping", () => console.log("ping received — endpoint and secret are working"));
client.on("raw", (event) => console.log(`event ${event.type} ${event.id}`));

client.on("messageCreate", async (message) => {
  if (message.isAutomated) return;
  console.log(`[${message.hubId}/${message.channelId}] ${message.author.name}: ${message.content}`);
  if (message.content.trim() === "!ping") {
    await message.reply("pong");
  }
});

client.on("memberJoin", (member) => console.log("member joined", member));
client.on("error", (err) => console.error(err));

await client.login();
const port = Number(process.env.PORT) || 3000;
client.listen(port);
console.log(`listening on :${port}`);
