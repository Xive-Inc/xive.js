# xive.js

Build bots for Xive hubs. Node 18+, no dependencies.

```js
import { Client } from "xive.js";

const client = new Client({
  token: process.env.XIVE_TOKEN,                  // xive_as_… application secret
  signingSecret: process.env.XIVE_SIGNING_SECRET, // from setEventEndpoint(), shown once
});

client.on("messageCreate", async (message) => {
  if (message.isAutomated) return;
  if (message.content === "!ping") await message.reply("pong");
});

client.on("memberJoin", ({ hubId, ...member }) => console.log("joined", hubId, member));

await client.login();
client.listen(3000); // put https in front of it — Xive only delivers to https
```

## How events arrive

Xive **pushes** events. Your application registers one https URL, and every hub that installed it
POSTs signed events there. You only receive events from channels your install can read, so a
channel your bot can't see never reaches you.

```js
// Once per deploy. The secret is returned only the first time; keep it.
const { secret } = await client.setEventEndpoint("https://bot.example.com/", {
  events: ["message.created", "member.joined"], // omit for everything
});
await client.testEventEndpoint();               // sends a signed `ping`
```

The client checks every delivery's `Xive-Signature`, ignores retries it has already handled, and
answers 200 before your listeners run.

Events: `messageCreate`, `messageUpdate`, `messageDelete`, `memberJoin`, `memberLeave`,
`memberKick`, `memberBan`, `memberUnban`, `roleAssign`, `roleRemove`, `ping`, and `raw` for every
event.

### Express

```js
app.post("/xive", express.raw({ type: "application/json" }), client.middleware());
```

## REST

```js
const hub = client.hub("my-hub");               // slug or id
await hub.channel(channelId).send("hello");
await hub.channel(channelId).messages({ limit: 50 });
await hub.member(profileId).timeout(10);
await hub.member(profileId).addRoles([roleId]);
```

A 429 is retried after its `Retry-After`. Any other refusal throws `XiveAPIError` with the API's
`type` and `code`.

## Not yet

Slash commands can be registered (`client.setCommands`), but Xive doesn't deliver invocations yet.
There are also no buttons, no voice and no live gateway connection.
