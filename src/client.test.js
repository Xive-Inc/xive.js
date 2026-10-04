import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection } from "./connection.js";
import { Channel, Message, Role, User, embedToContainer, translateMentions } from "./structures.js";
import {
  Client, Events, EmbedBuilder, SlashCommandBuilder, Permissions, XiveUnsupportedError, ActivityType,
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
    if (path === "/hubs/applications/@me/presence") {
      return json({ presence: { status: body.status ?? "online", activity: body.activity ?? null } });
    }
    if (path === "/hubs/hub-1/app/channels") return json({ channels: [{ id: "chan-1", name: "general", slug: "general", kind: "conversation", topic: null, category_id: null }] });
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
  assert.equal(client.channels.cache.get("chan-1")?.url, "https://hub.thexive.com/hub/test-hub/conversations/general");

  await publish(client, "message.created", fromMember("!ping"));
  let post = calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"));
  assert.equal(post?.body.content, "Pong!");
  assert.ok(post?.body.reply_to_id, "reply carries the message it answers");

  await publish(client, "message.created", fromMember("!info"));
  post = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages")).at(-1);
  // Xive takes no embeds from an application: the card is sent as a Container that draws the same.
  assert.equal(post?.body.embeds, undefined);
  assert.deepEqual(post?.body.components, [{
    type: 17, accent_color: 0x5865f2,
    components: [{ type: 10, content: "## Hub" }, { type: 10, content: "**Name**\nTest Hub" }],
  }]);

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

test("components: buttons, a collector that updates, a select menu, and a form", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = await import("./index.js");

  // ── A discord.js-style bot. ────────────────────────────────────────────────────────────────
  let collected = null;
  client.on(Events.MessageCreate, async (message) => {
    if (message.content !== "!vote") return;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("yes").setLabel("Yes").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("no").setLabel("No").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setLabel("Docs").setStyle(ButtonStyle.Link).setURL("https://example.com"),
    );
    const sent = await message.channel.send({ content: "Vote!", components: [row] });
    collected = sent.awaitMessageComponent({ time: 1000 }).then(async (i) => {
      await i.update({ content: `You voted ${i.customId}`, components: [] });
      return i.customId;
    });
  });
  client.on(Events.InteractionCreate, async (i) => {
    if (i.isStringSelectMenu()) await i.reply({ content: `Picked ${i.values.join(", ")}`, ephemeral: true });
    if (i.isButton() && i.customId === "feedback") {
      await i.showModal(new ModalBuilder().setCustomId("fb").setTitle("Feedback").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Say it").setStyle(TextInputStyle.Paragraph)),
      ));
      const submit = await i.awaitModalSubmit({ time: 1000, filter: (s) => s.customId === "fb" });
      await submit.reply({ content: `Thanks: ${submit.fields.getTextInputValue("text")}`, ephemeral: true });
    }
  });
  // ──────────────────────────────────────────────────────────────────────────────────────────

  const ix = (/** @type {string} */ id, /** @type {any} */ extra) => publish(client, "interaction.created", {
    id, hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(), ...extra,
  });

  await publish(client, "message.created", fromMember("!vote"));
  const send = calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"));
  // Content beside components is a 400 on Xive, so it is sent as the Text Display above them.
  assert.equal(send?.body.content, undefined);
  assert.deepEqual(send?.body.components?.[0], { type: 10, content: "Vote!" });
  assert.deepEqual(send?.body.components?.slice(1), [{ type: 1, components: [
    { type: 2, custom_id: "yes", label: "Yes", style: 3 },
    { type: 2, custom_id: "no", label: "No", style: 4 },
    { type: 2, label: "Docs", style: 5, url: "https://example.com" },
  ] }]);

  // A press on the sent message ("sent-1" in the fake API) resolves the collector, which updates.
  await ix("ix-yes", { type: "component", custom_id: "yes", component_type: 2, values: [], message: { id: "sent-1", private: false } });
  assert.equal(await collected, "yes");
  assert.deepEqual(calls.filter((c) => c.path.endsWith("/ix-yes/callback")).at(-1)?.body,
    { type: "update", content: "You voted yes", components: [] });

  await ix("ix-sel", { type: "component", custom_id: "pick", component_type: 3, values: ["a", "b"], message: { id: "sent-1", private: false } });
  assert.deepEqual(calls.filter((c) => c.path.endsWith("/ix-sel/callback")).at(-1)?.body,
    { type: "reply", content: "Picked a, b", ephemeral: true });

  // A button opens a form; the submission (a new interaction) is awaited and answered.
  await ix("ix-fb", { type: "component", custom_id: "feedback", component_type: 2, values: [], message: { id: "sent-1", private: false } });
  const modalCall = calls.filter((c) => c.path.endsWith("/ix-fb/callback")).at(-1);
  assert.equal(modalCall?.body.type, "modal");
  assert.equal(modalCall?.body.modal.components[0].components[0].custom_id, "text");
  await ix("ix-sub", { type: "modal_submit", custom_id: "fb", fields: [{ custom_id: "text", value: "great bot" }], message: { id: "sent-1", private: false } });
  assert.deepEqual(calls.filter((c) => c.path.endsWith("/ix-sub/callback")).at(-1)?.body,
    { type: "reply", content: "Thanks: great bot", ephemeral: true });
});

test("embedToContainer: thumbnail beside the heading, image, footer, nothing for an empty embed", () => {
  const id = (/** @type {string} */ t) => t;
  assert.deepEqual(embedToContainer({
    title: "Status", url: "https://example.com/s", description: "All good", color: 0x00ff00,
    thumbnail: { url: "https://example.com/t.png" }, image: { url: "https://example.com/i.png" },
    footer: { text: "ops" }, timestamp: "2026-10-04T12:00:00Z",
  }, id), {
    type: 17, accent_color: 0x00ff00,
    components: [
      { type: 9, components: [{ type: 10, content: "## [Status](https://example.com/s)\nAll good" }], accessory: { type: 11, media: { url: "https://example.com/t.png" } } },
      { type: 12, items: [{ media: { url: "https://example.com/i.png" } }] },
      { type: 10, content: "*ops · Sun, 04 Oct 2026 12:00:00 GMT*" },
    ],
  });
  assert.equal(embedToContainer({ color: 1 }, id), null);
});

test("mentions: Xive tokens out, Discord tokens converted, has() reads the stored form", () => {
  const uid = "c0901ae8-6771-4e9a-b40c-b6e72d3ca397";
  const rid = "11111111-2222-4333-8444-555555555555";
  const cid = "66666666-7777-4888-9999-000000000000";
  const hub = { id: "h", slug: "acme", members: { cache: new Map() } };
  const user = new User(null, { id: uid, username: "luna" });
  const role = new Role(null, hub, { id: rid, name: "Moderator" });
  const channel = new Channel(null, hub, { id: cid, name: "general", slug: "general", kind: "conversation" });

  assert.equal(`${user} ${role} ${channel}`, `<user:${uid}> <role:${rid}> <channel:${cid}>`);
  // A webhook author's stand-in id is not a uuid, so it cannot be a token.
  assert.equal(`${new User(null, { id: "webhook:CI", username: "CI" })}`, "@CI");
  assert.equal(translateMentions(null, null, `<@${uid}> <@!${uid}> <@&${rid}> <#${cid}>`),
    `<user:${uid}> <user:${uid}> <role:${rid}> <channel:${cid}>`);

  // What the server stored for `${user} ${role} ${channel}`.
  const msg = new Message(null, channel, { id: "m", content: `@luna @Moderator ${channel.url}` });
  assert.ok(msg.mentions.has(user));
  assert.ok(msg.mentions.has(role));
  assert.ok(msg.mentions.has(channel));
  assert.ok(!msg.mentions.has(new User(null, { id: rid, username: "sol" })));
});

test("hub.me: the app's own roles and permissions, refreshed by fetch()", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const entry = {
    ...HUB,
    role: { id: "role-app", name: "Modbot", rank: 101, permissions: ["conv_post"] },
    roles: [{ id: "role-mod", name: "Moderator", rank: 500 }],
    permissions: ["conv_view", "conv_post", "mod_ban", "mod_kick"],
  };
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) =>
    new URL(url).pathname === "/hubs/applications/@me/hubs"
      ? new Response(JSON.stringify({ success: true, hubs: [entry] }))
      : original(url, init));
  t.after(() => { globalThis.fetch = original; });

  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));

  assert.equal(hub.me.role.id, "role-app");
  assert.equal(hub.me.role.managed, true);
  assert.deepEqual([...hub.me.roles.keys()], ["role-mod", "role-app"], "highest first");
  assert.equal(hub.me.highest.id, "role-mod");
  assert.ok(hub.me.highest instanceof Role);
  assert.equal(hub.me.highest.hexColor, "#ff0000", "uses the cached Role when hub.roles has it");
  assert.ok(hub.me.permissions.has("BanMembers"));
  assert.ok(!hub.me.permissions.has("ManageRoles"));

  // The hub takes the extra role away; fetch() catches up.
  entry.roles = [];
  entry.permissions = ["conv_view", "conv_post"];
  await hub.me.fetch();
  assert.deepEqual([...hub.me.roles.keys()], ["role-app"]);
  assert.ok(!hub.me.permissions.has("BanMembers"));

  await client.destroy();
});

test("presence: the client option is set before ready; setActivity, setStatus and clearing", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({
    baseURL: "https://api.example.test",
    presence: { status: "away", activity: { name: "40 hubs", type: ActivityType.Watching } },
  });
  let atReady = null;
  client.once(Events.ClientReady, (c) => { atReady = c.user.presence; });
  await client.login("xive_as_test");

  assert.deepEqual(atReady, { status: "away", activity: { name: "40 hubs", type: "watching" } });

  await client.user.setActivity("/help", { type: ActivityType.Listening });
  await client.user.setActivity("a game");
  await client.user.setStatus("busy");
  await client.user.setActivity();

  const sent = calls.filter((c) => c.path === "/hubs/applications/@me/presence").map((c) => [c.method, c.body]);
  assert.deepEqual(sent, [
    ["PATCH", { status: "away", activity: { name: "40 hubs", type: "watching" } }],
    ["PATCH", { activity: { name: "/help", type: "listening" } }],
    ["PATCH", { activity: { name: "a game", type: "playing" } }],
    ["PATCH", { status: "busy" }],
    ["PATCH", { activity: null }],
  ]);
  await client.destroy();
});

test("subcommands: register with addSubcommand/addSubcommandGroup, read with getSubcommand", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");

  await client.application?.commands.set([
    new SlashCommandBuilder().setName("mod").setDescription("Moderation")
      .addSubcommand((s) => s.setName("ban").setDescription("Ban someone")
        .addUserOption((o) => o.setName("target").setDescription("Who").setRequired(true)))
      .addSubcommandGroup((g) => g.setName("role").setDescription("Roles")
        .addSubcommand((s) => s.setName("add").setDescription("Add a role"))),
  ]);
  const put = calls.find((c) => c.method === "PUT" && c.path === "/hubs/applications/@me/commands");
  assert.deepEqual(put?.body.commands[0].options, [
    { name: "ban", description: "Ban someone", type: "subcommand", options: [
      { name: "target", description: "Who", type: "user", required: true },
    ] },
    { name: "role", description: "Roles", type: "subcommand_group", options: [
      { name: "add", description: "Add a role", type: "subcommand", options: [] },
    ] },
  ]);

  /** @type {string[]} */
  const seen = [];
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    seen.push([interaction.commandName, interaction.options.getSubcommandGroup(), interaction.options.getSubcommand(false)].join("|"));
  });
  const run = (/** @type {string|null} */ sub, /** @type {string|null} */ group) => publish(client, "interaction.created", {
    id: `ix-${sub}-${group}`, hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
    command: { id: "cmd-mod", name: "mod" }, subcommand: sub, subcommand_group: group, options: [],
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
  });
  await run("ban", null);
  await run("add", "role");
  assert.deepEqual(seen, ["mod||ban", "mod|role|add"]);
  await client.destroy();
});
