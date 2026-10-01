import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection } from "./connection.js";
import {
  Client, Events, EmbedBuilder, SlashCommandBuilder, Permissions, XiveUnsupportedError,
} from "./index.js";

const APP = { id: "app-1", name: "Modbot", client_id: "c", icon_url: null };
const HUB = { id: "hub-1", slug: "test-hub", name: "Test Hub", description: null, installed_at: "2026-10-01T00:00:00Z" };

/** A fake Xive API: records every call, answers the routes a bot touches. */
function fakeApi(t) {
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    const path = new URL(url).pathname;
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const json = (/** @type {any} */ data, status = 200) => new Response(JSON.stringify({ success: true, ...data }), { status });

    if (path === "/hubs/applications/@me") return json({ application: APP });
    if (path === "/hubs/applications/@me/hubs") return json({ hubs: [HUB] });
    if (path === "/hubs/applications/@me/commands") return json({ commands: body?.commands ?? [] });
    if (path === "/hubs/hub-1/app/channels") return json({ channels: [{ id: "chan-1", name: "general", kind: "conversation", topic: null, category_id: null }] });
    if (path === "/hubs/hub-1/app/roles") return json({ roles: [{ id: "role-mod", name: "Moderator", color: "#ff0000", rank: 500, managed: false, permissions: ["mod_ban", "mod_kick"] }] });
    if (path === "/hubs/hub-1/app/channels/chan-1/messages" && method === "POST") {
      return json({ message: { id: "sent-1", channel_id: "chan-1", content: body.content ?? "", author: { type: "application", application_id: APP.id, name: APP.name } } }, 201);
    }
    if (path.startsWith("/hubs/hub-1/app/members/")) {
      return json({ member: { profile_id: path.split("/")[5], username: "sam", display_name: "Sam", nickname: null, avatar_url: null, joined_at: "2026-09-01T00:00:00Z", role_ids: ["role-mod"], timed_out_until: null } });
    }
    return json({});
  });
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

/** The gateway is Centrifugo; in tests, the test emits what Xive would publish. */
function fakeGateway(t) {
  const original = Connection.prototype.connect;
  Connection.prototype.connect = async function () {};
  t.after(() => { Connection.prototype.connect = original; });
}

/** @param {Client} client @param {string} type @param {any} data */
function publish(client, type, data) {
  const env = {
    subscription: { id: null, application_id: APP.id, hub_id: HUB.id },
    event: { id: crypto.randomUUID(), type, occurred_at: new Date().toISOString(), data },
  };
  client.core?.emit("event", env.event, env);
  return new Promise((r) => setTimeout(r, 20));
}

const fromMember = (/** @type {string} */ content) => ({
  id: crypto.randomUUID(), hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null, content,
  created_at: new Date().toISOString(), edited: false, edited_at: null, reply_to_id: null, attachment: null,
  author: { type: "member", profile_id: "user-1", username: "sam", name: "Sam" },
});

test("a discord.js-style bot, ported: ready, !ping, embeds, moderation, reactions, welcomes", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);

  // ── The bot. Ported from discord.js by changing the import, `guild` → `hub`, and the event
  //    and permission names. Everything else is as it was. ─────────────────────────────────────
  const client = new Client({ baseURL: "https://api.example.test" });
  const log = [];
  client.once(Events.ClientReady, (c) => log.push(`ready as ${c.user.tag} in ${c.hubs.cache.size} hub(s)`));
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.content === "!ping") await message.reply("Pong!");
    if (message.content === "!info") {
      const embed = new EmbedBuilder().setTitle("Hub").setColor(0x5865f2).addFields({ name: "Name", value: message.hub.name });
      await message.channel.send({ embeds: [embed] });
    }
    if (message.content.startsWith("!timeout")) {
      if (!message.member.permissions.has(Permissions.BanMembers)) return;
      const member = await message.hub.members.fetch("user-2");
      await member.timeout(10 * 60 * 1000, "spam");
      await message.react("✅");
      await message.channel.send(`${member} has been timed out`);
    }
  });
  client.on(Events.MemberAdd, (member) => log.push(`welcome ${member.displayName}`));
  await client.login("xive_as_test");
  // ──────────────────────────────────────────────────────────────────────────────────────────

  assert.deepEqual(log, ["ready as Modbot in 1 hub(s)"]);
  assert.equal(client.channels.cache.get("chan-1")?.toString(), "#general");

  await publish(client, "message.created", fromMember("!ping"));
  let post = calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"));
  assert.equal(post?.body.content, "Pong!");
  assert.ok(post?.body.reply_to_id, "reply carries the message it answers");

  await publish(client, "message.created", fromMember("!info"));
  post = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages")).at(-1);
  assert.equal(post?.body.embeds[0].title, "Hub");
  assert.equal(post?.body.embeds[0].fields[0].value, "Test Hub");

  // The author holds Moderator (role-mod), whose permissions include mod_ban.
  await client.hubs.cache.get("hub-1")?.members.fetch("user-1");
  await publish(client, "message.created", fromMember("!timeout @someone"));
  const patch = calls.find((c) => c.method === "PATCH" && c.path === "/hubs/hub-1/app/members/user-2");
  assert.deepEqual(patch?.body, { muted_until_minutes: 10 });
  assert.ok(calls.find((c) => c.method === "PUT" && c.path.includes("/reactions/")), "react() calls the reaction route");
  post = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages")).at(-1);
  assert.equal(post?.body.content, "@sam has been timed out", "a member interpolates as an @mention");

  // `if (message.author.bot) return` skips the bot's own posts.
  const before = calls.length;
  await publish(client, "message.created", { ...fromMember("!ping"), author: { type: "application", application_id: APP.id, name: APP.name } });
  assert.equal(calls.length, before);

  await publish(client, "member.joined", { hub_id: HUB.id, member_id: "user-3", member_name: "newbie" });
  assert.equal(log.at(-1), "welcome Sam");
});

test("commands register through client.application.commands.set with SlashCommandBuilder", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");

  await client.application?.commands.set([
    new SlashCommandBuilder().setName("ban").setDescription("Ban someone")
      .addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why"))
      .setDefaultMemberPermissions(Permissions.BanMembers),
  ]);

  const put = calls.find((c) => c.method === "PUT" && c.path === "/hubs/applications/@me/commands");
  assert.deepEqual(put?.body.commands[0], {
    name: "ban", description: "Ban someone", invoker_permission: "mod_ban",
    options: [
      { name: "target", description: "Who", type: "user", required: true },
      { name: "reason", description: "Why", type: "string", required: false },
    ],
  });
});

test("what Xive does not do fails at the call, by name", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const channel = client.channels.cache.get("chan-1");
  await assert.rejects(channel.send({ files: ["./a.png"] }), XiveUnsupportedError);
  await assert.rejects(channel.send({ components: [{}] }), XiveUnsupportedError);
  const user = await client.users.fetch("user-9");
  await assert.rejects(user.send("hi"), XiveUnsupportedError);
});

test("slash commands: interactionCreate, options, reply, private reply, defer → editReply, followUp", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");

  // ── Ported from discord.js: only `Events`/`Permissions` names differ. ───────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ping") {
      await interaction.reply("Pong!");
    }
    if (interaction.commandName === "ban") {
      if (!interaction.memberPermissions.has(Permissions.BanMembers)) {
        await interaction.reply({ content: "You can't do that.", ephemeral: true });
        return;
      }
      const target = interaction.options.getUser("target", true);
      const reason = interaction.options.getString("reason") ?? "no reason";
      await interaction.deferReply();
      await interaction.editReply(`Banned ${target} (${reason})`);
      await interaction.followUp({ content: "Logged.", ephemeral: true });
    }
  });
  // ──────────────────────────────────────────────────────────────────────────────────────────

  const run = (/** @type {string} */ name, /** @type {any[]} */ options, /** @type {string[]} */ permissions) =>
    publish(client, "interaction.created", {
      id: `ix-${name}-${permissions.length}`, hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
      command: { id: `cmd-${name}`, name }, options,
      user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions, role_ids: [] },
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
    });
  const callbacks = () => calls.filter((c) => c.path.includes("/app/interactions/"));

  await run("ping", [], []);
  assert.deepEqual(callbacks().at(-1), {
    method: "POST", path: "/hubs/hub-1/app/interactions/ix-ping-0/callback",
    body: { type: "reply", content: "Pong!", ephemeral: false },
  });

  await run("ban", [{ name: "target", type: "user", value: "user-2", resolved: { id: "user-2", username: "trouble", name: "Trouble" } }], []);
  assert.deepEqual(callbacks().at(-1)?.body, { type: "reply", content: "You can't do that.", ephemeral: true });

  const before = callbacks().length;
  await run("ban", [
    { name: "target", type: "user", value: "user-2", resolved: { id: "user-2", username: "trouble", name: "Trouble" } },
    { name: "reason", type: "string", value: "spam" },
  ], ["mod_ban"]);
  const flow = callbacks().slice(before).map((c) => `${c.method} ${c.path.split("/").pop()} ${JSON.stringify(c.body)}`);
  assert.deepEqual(flow, [
    `POST callback {"type":"defer","ephemeral":false}`,
    `PATCH original {"content":"Banned @trouble (spam)"}`,
    `POST followups {"content":"Logged.","ephemeral":true}`,
  ]);
});
