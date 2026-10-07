import { test } from "node:test";
import assert from "node:assert/strict";
import { Connection } from "./connection.js";
import { Channel, Message, Role, User, embedToContainer, toXiveMessage, translateMentions } from "./structures.js";
import {
  Client, Events, EmbedBuilder, SlashCommandBuilder, Permissions, XiveUnsupportedError, ActivityType,
} from "./index.js";

const APP = { id: "app-1", name: "Modbot", client_id: "c", icon_url: null };
const HUB = { id: "hub-1", slug: "test-hub", name: "Test Hub", description: null, installed_at: "2026-10-01T00:00:00Z" };

const FORUM = {
  id: "forum-1", name: "help", slug: "help", kind: "forum", topic: null, category_id: null,
  forum_tags: [{ id: "tag-bug", name: "Bug", color: "#ff0000", emoji: "🐛", mod_only: false }, { id: "tag-staff", name: "Staff", color: null, emoji: null, mod_only: true }],
  forum_settings: { require_tag: true, default_sort: "activity", default_layout: "list" },
};

/** A Post as the API sends it, with `over` on top. @param {any} [over] */
const forumPost = (over = {}) => ({
  id: "post-1", forum_id: "forum-1", title: "Crash on login", applied_tags: ["tag-bug"],
  owner: { id: "user-1", username: "sam", displayName: "Sam", display_name: "Sam", avatar_url: null },
  author: { type: "user", id: "user-1", username: "sam", displayName: "Sam", avatar_url: null },
  created_at: "2026-10-07T10:00:00Z", last_activity_at: "2026-10-07T11:00:00Z", reply_count: 2, vote_count: 5,
  accepted_message_id: null, is_solved: false, is_pinned: false, pinned_at: null, is_archived: false, is_locked: false,
  starter: { id: "starter-1", excerpt: "It **crashes**", media_url: null, media_type: null, is_deleted: false },
  ...over,
});

/** A fake Xive API: records every call, answers the routes a bot touches. */
function fakeApi(t) {
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  /** @type {Map<string, { deferred: boolean, ephemeral: boolean, replyId: string | null }>} */
  const interactionState = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    const path = new URL(url).pathname;
    const query = Object.fromEntries(new URL(url).searchParams);
    const method = init.method;
    // Multipart: the JSON part, with the file names it carried as `files`.
    const body = init.body instanceof FormData
      ? { ...JSON.parse(String(init.body.get("payload_json"))), files: [...init.body.keys()].filter((k) => k !== "payload_json").map((k) => /** @type {any} */ (init.body.get(k)).name) }
      : init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, ...(Object.keys(query).length && { query }) });
    const json = (/** @type {any} */ data, status = 200) => new Response(JSON.stringify({ success: true, ...data }), { status });

    if (path === "/hubs/applications/@me") return json({ application: APP });
    if (path === "/hubs/applications/@me/hubs") return json({ hubs: [HUB] });
    if (path === "/hubs/applications/@me/commands") return json({ commands: body?.commands ?? [] });
    if (path === "/hubs/applications/@me/presence") {
      return json({ presence: { status: body.status ?? "online", activity: body.activity ?? null } });
    }
    if (path === "/hubs/hub-1/app/channels" && method === "POST") return json({ channel: { id: "chan-new", name: body.name, kind: body.kind } }, 201);
    if (path === "/hubs/hub-1/app/channels") return json({ channels: [{ id: "chan-1", name: "general", slug: "general", kind: "conversation", topic: null, category_id: null }] });
    if (path === "/hubs/hub-1/app/commands") return json({ commands: (body?.commands ?? []).map((/** @type {any} */ c) => ({ id: `hubcmd-${c.name}`, ...c })) });
    if (path === "/hubs/hub-1/app/roles" && method === "POST") return json({ role: { id: "role-new", name: body.name, rank: body.rank ?? 100 } }, 201);
    if (path === "/hubs/hub-1/app/roles") return json({ roles: [{ id: "role-mod", name: "Moderator", color: "#ff0000", rank: 500, managed: false, permissions: ["mod_ban", "mod_kick"] }] });
    if (path === "/hubs/hub-1/app/channels/chan-1/messages" && method === "POST") {
      return json({ message: { id: "sent-1", channel_id: "chan-1", content: body.content ?? "", author: { type: "application", application_id: APP.id, name: APP.name } } }, 201);
    }
    if (path.startsWith("/hubs/hub-1/app/interactions/")) {
      // As the API answers: a public answer is the message, a private one `{ id }`,
      // an edit `{ id, content }`. "ix-empty" answers with no message at all.
      const [, , , , , ix, route] = path.split("/");
      if (ix === "ix-empty") return json({ status: "replied" });
      const state = interactionState.get(ix) ?? { deferred: false, ephemeral: false, replyId: null };
      interactionState.set(ix, state);
      const whole = (/** @type {string} */ id) => ({
        id, channel_id: "chan-1", content: body.content ?? "", interaction: { id: ix },
        author: { type: "application", application_id: APP.id, name: APP.name }, components: body.components ?? [], poll: null,
      });
      if (route === "callback") {
        if (body.type === "defer" || body.type === "defer_update") {
          Object.assign(state, { deferred: true, ephemeral: body.type === "defer" && Boolean(body.ephemeral) });
          return json({ status: "deferred", ephemeral: state.ephemeral });
        }
        if (body.type === "reply") {
          state.ephemeral = Boolean(body.ephemeral);
          state.replyId = `reply-${ix}`;
          return json({ status: "replied", ...(state.ephemeral ? { ephemeral: true, message: { id: `private-${ix}` } } : { ephemeral: false, message: whole(state.replyId) }) });
        }
        if (body.type === "update") return json({ status: "replied", ephemeral: false, message: { id: "sent-1", content: body.content ?? "" } });
        return json({ status: body.type });
      }
      if (route === "original") {
        if (state.ephemeral) return json({ status: "replied", ephemeral: true, message: { id: `private-${ix}` } });
        if (state.deferred && !state.replyId) {
          state.replyId = `reply-${ix}`;
          return json({ status: "replied", ephemeral: false, message: whole(state.replyId) });
        }
        return json({ ephemeral: false, message: { id: state.replyId, content: body.content ?? "" } });
      }
      if (route === "followups") {
        return json(body.ephemeral ? { ephemeral: true, message: { id: `private-followup-${ix}` } } : { ephemeral: false, message: whole(`followup-${ix}`) }, 201);
      }
    }
    // Forums: forum-1 holds post-1.
    if (path === "/hubs/hub-1/app/channels/forum-1/posts" && method === "POST") {
      const { title, applied_tags, ...opening } = body;
      return json({ post: forumPost({ title, applied_tags: applied_tags ?? [], owner: null, author: { type: "application", application_id: APP.id, name: APP.name } }),
        message: { id: "starter-1", channel_id: "post-1", content: opening.content ?? "", author: { type: "application", application_id: APP.id, name: APP.name } } }, 201);
    }
    if (path === "/hubs/hub-1/app/channels/forum-1/posts") {
      return json({ posts: [forumPost({ is_pinned: true })], has_more: true, page: Number(query.page ?? 0), sort: query.sort ?? "activity", forum: FORUM });
    }
    if (path === "/hubs/hub-1/app/posts/post-1" && method === "PATCH") {
      return json({ post: forumPost({
        ...(body.title !== undefined && { title: body.title }), ...(body.applied_tags && { applied_tags: body.applied_tags }),
        ...(body.pinned !== undefined && { is_pinned: body.pinned }), ...(body.locked !== undefined && { is_locked: body.locked }),
        ...(body.archived !== undefined && { is_archived: body.archived }),
        ...(body.accepted_message_id !== undefined && { accepted_message_id: body.accepted_message_id, is_solved: body.accepted_message_id !== null }),
      }) });
    }
    if (path === "/hubs/hub-1/app/posts/post-1") {
      return json({ post: { ...forumPost({ accepted_message_id: "reply-9", is_solved: true }), accepted_message: { id: "reply-9", channel_id: "post-1", content: "Fixed in 2.1", author: { type: "member", profile_id: "user-2", username: "kai", name: "Kai" } } }, forum: FORUM });
    }
    if (path === "/hubs/hub-1/app/channels/post-1/messages" && method === "POST") {
      return json({ message: { id: "reply-1", channel_id: "post-1", content: body.content ?? "", author: { type: "application", application_id: APP.id, name: APP.name } } }, 201);
    }
    if (path.endsWith("/voters")) return json({ voters: [{ profile_id: "user-7", username: "kai", display_name: "Kai", avatar_url: null }] });
    if (path.endsWith("/poll/end")) return json({ poll: { ended: true, ended_at: "2026-10-04T13:00:00Z" } });
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
  // Embeds go as embeds, as on Discord.
  assert.equal(post?.body.components, undefined);
  assert.equal(post?.body.embeds?.[0]?.title, "Hub");
  assert.equal(post?.body.embeds?.[0]?.fields?.[0]?.value, "Test Hub");

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
  await assert.rejects(channel.send({ files: Array.from({ length: 11 }, () => Buffer.from("x")) }), XiveUnsupportedError);
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
  // Content beside rows of buttons is sent as it is, as on Discord.
  assert.equal(send?.body.content, "Vote!");
  assert.deepEqual(send?.body.components, [{ type: 1, components: [
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

test("toXiveMessage: Discord's two shapes — embeds and rows as sent, a layout tree alone", () => {
  const row = { type: 1, components: [{ type: 2, style: 1, label: "Go", custom_id: "go" }] };
  // Legacy: content, embeds and rows together; mentions in a card are rewritten.
  assert.deepEqual(toXiveMessage(/** @type {any} */ (null), null, {
    content: "Pick", embeds: [{ title: "T", description: "hi <@0123abcd>" }], components: [row],
  }), { content: "Pick", embeds: [{ title: "T", description: "hi <user:0123abcd>" }], components: [row] });
  // Layout: embeds become Containers and content the Text Display above them.
  const layout = { type: 10, content: "x" };
  assert.deepEqual(toXiveMessage(/** @type {any} */ (null), null, {
    content: "Pick", embeds: [{ title: "T" }], components: [layout],
  }), { components: [{ type: 10, content: "Pick" }, { type: 17, components: [{ type: 10, content: "## T" }] }, layout] });
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

test("user/role/channel selects: builders send discord.js JSON; picks arrive resolved", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const { ActionRowBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, ComponentType } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");

  const hub = client.hubs.cache.get(HUB.id);
  const channel = await hub?.channels.fetch("chan-1");
  await channel?.send({ components: [
    new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId("who").setMaxValues(2).setDefaultUsers("u-1")),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("where").setChannelTypes(0)),
  ] });
  const sent = calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"));
  assert.deepEqual(sent?.body.components.map((/** @type {any} */ r) => r.components[0]), [
    { type: 5, custom_id: "who", max_values: 2, default_values: [{ id: "u-1", type: "user" }] },
    { type: 8, custom_id: "where", channel_types: [0] },
  ]);

  /** @type {any} */
  let got = null;
  client.on(Events.InteractionCreate, (i) => { if (i.isUserSelectMenu()) got = i; });
  await publish(client, "interaction.created", {
    id: "ix-sel", hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null, type: "component",
    custom_id: "who", component_type: ComponentType.UserSelect, values: ["u-2"],
    resolved: { users: { "u-2": { id: "u-2", username: "luna", display_name: "Luna" } }, members: { "u-2": { nick: "L" } } },
    message: { id: "m-1", private: false, content: "", components: [] },
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
  });
  assert.equal(got?.isAnySelectMenu(), true);
  assert.equal(got?.users.get("u-2")?.username, "luna");
  assert.equal(got?.members.get("u-2")?.nick, "L");
  await client.destroy();
});

test("presenceUpdate: old and new presence, cached on hub.presences", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  /** @type {any[]} */
  const seen = [];
  client.on(Events.PresenceUpdate, (oldP, newP) => seen.push([oldP?.status ?? null, newP.status, newP.activity?.game?.name ?? null]));
  await publish(client, "presence.updated", { hub_id: HUB.id, user_id: "u-1", status: "online", activity: null });
  await publish(client, "presence.updated", { hub_id: HUB.id, user_id: "u-1", status: "busy", activity: { custom: null, game: { name: "Rust" } } });
  assert.deepEqual(seen, [[null, "online", null], ["online", "busy", "Rust"]]);
  assert.equal(client.hubs.cache.get(HUB.id)?.presences.cache.get("u-1")?.status, "busy");
  await client.destroy();
});

test("files: one file goes as multipart with payload_json; buffers, builders and paths all work", async (t) => {
  fakeGateway(t);
  /** @type {{ path: string, body: any, contentType: string | null }[]} */
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    const path = new URL(url).pathname;
    const json = (/** @type {any} */ data, status = 200) => new Response(JSON.stringify({ success: true, ...data }), { status });
    if (path === "/hubs/applications/@me") return json({ application: APP });
    if (path === "/hubs/applications/@me/hubs") return json({ hubs: [HUB] });
    if (path === "/hubs/hub-1/app/channels") return json({ channels: [{ id: "chan-1", name: "general", slug: "general", kind: "conversation", topic: null, category_id: null }] });
    if (init.body instanceof FormData) {
      const f = /** @type {any} */ (init.body.get("files[0]"));
      sent.push({ path, body: JSON.parse(String(init.body.get("payload_json"))), contentType: init.headers["Content-Type"] ?? null });
      sent.at(-1).file = { name: f.name, text: await f.text() };
      return json({ message: { id: "m-1", channel_id: "chan-1", content: "" } }, 201);
    }
    return json({});
  });
  t.after(() => { globalThis.fetch = original; });

  const { AttachmentBuilder } = await import("./index.js");
  const { writeFile, mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "xivejs-"));
  const path = join(dir, "log.txt");
  await writeFile(path, "from disk");

  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const channel = client.channels.cache.get("chan-1") ?? await client.channels.fetch("chan-1");
  await channel.send({ content: "see file", files: [new AttachmentBuilder(Buffer.from("hello"), { name: "a.txt" })] });
  await channel.send({ files: [path] });

  assert.deepEqual(sent.map((s) => [s.path, s.body.content ?? null, s.file.name, s.file.text, s.contentType]), [
    ["/hubs/hub-1/app/channels/chan-1/messages", "see file", "a.txt", "hello", null],
    ["/hubs/hub-1/app/channels/chan-1/messages", null, "log.txt", "from disk", null],
  ]);
  await client.destroy();
});

test("files: up to 10 go as files[0]…files[n-1] in order; 11 are refused before anything is sent", async (t) => {
  fakeGateway(t);
  /** @type {{ path: string, body: any, keys: string[], files: { name: string, text: string }[] }[]} */
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    const path = new URL(url).pathname;
    const json = (/** @type {any} */ data, status = 200) => new Response(JSON.stringify({ success: true, ...data }), { status });
    if (path === "/hubs/applications/@me") return json({ application: APP });
    if (path === "/hubs/applications/@me/hubs") return json({ hubs: [HUB] });
    if (path === "/hubs/hub-1/app/channels") return json({ channels: [{ id: "chan-1", name: "general", slug: "general", kind: "conversation", topic: null, category_id: null }] });
    if (init.body instanceof FormData) {
      const keys = [...init.body.keys()];
      const files = await Promise.all(keys.filter((k) => k !== "payload_json").map(async (k) => {
        const f = /** @type {any} */ (init.body.get(k));
        return { name: f.name, text: await f.text() };
      }));
      sent.push({ path, body: JSON.parse(String(init.body.get("payload_json"))), keys, files });
      return json({
        message: {
          id: "m-3", channel_id: "chan-1", content: "three",
          attachment: { url: "https://cdn.example.test/a.txt", type: "text/plain" },
          attachments: files.map((f, i) => ({ id: `att-${i}`, url: `https://cdn.example.test/${f.name}`, type: "text/plain", filename: f.name, size: f.text.length })),
        },
      }, 201);
    }
    return json({});
  });
  t.after(() => { globalThis.fetch = original; });

  const { AttachmentBuilder, Attachment } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const channel = client.channels.cache.get("chan-1") ?? await client.channels.fetch("chan-1");

  const msg = await channel.send({
    content: "three",
    files: [
      new AttachmentBuilder(Buffer.from("one"), { name: "a.txt" }),
      { attachment: Buffer.from("two"), name: "b.txt" },
      new AttachmentBuilder(Buffer.from("three")).setName("c.txt"),
    ],
  });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].keys, ["payload_json", "files[0]", "files[1]", "files[2]"]);
  assert.deepEqual(sent[0].files, [{ name: "a.txt", text: "one" }, { name: "b.txt", text: "two" }, { name: "c.txt", text: "three" }]);
  assert.equal(sent[0].body.content, "three");
  // The sent message's attachments come back as Attachments, in order.
  assert.deepEqual([...msg.attachments.keys()], ["att-0", "att-1", "att-2"]);
  assert.ok(msg.attachments.get("att-1") instanceof Attachment);
  assert.equal(msg.attachments.get("att-1")?.name, "b.txt");

  // Eleven: refused by name, with the limit, and nothing goes out.
  await assert.rejects(
    channel.send({ files: Array.from({ length: 11 }, (_, i) => ({ attachment: Buffer.from("x"), name: `${i}.txt` })) }),
    (/** @type {any} */ e) => e instanceof XiveUnsupportedError && /10/.test(e.message),
  );
  assert.equal(sent.length, 1);
  await client.destroy();
});

test("message.attachments: built from `attachments`; falls back to the old single `attachment`", () => {
  const hub = /** @type {any} */ ({ id: "hub-1", slug: "test-hub" });
  const channel = new Channel(null, hub, { id: "chan-1", name: "general", slug: "general", kind: "conversation" });

  const msg = new Message(null, channel, {
    id: "m-1", content: "",
    attachment: { url: "https://cdn.example.test/u/shot.png", type: "image/png" },
    attachments: [
      { id: "a1", url: "https://cdn.example.test/u/shot.png", type: "image/png", filename: "shot.png", size: 12345 },
      { id: null, url: "https://cdn.example.test/u/clip.mp4?v=2", type: "video/mp4", filename: null, size: null },
    ],
  });
  assert.deepEqual([...msg.attachments.keys()], ["a1", "1"]);
  const a = msg.attachments.get("a1");
  assert.deepEqual({ ...a }, {
    id: "a1", url: "https://cdn.example.test/u/shot.png", proxyURL: "https://cdn.example.test/u/shot.png",
    contentType: "image/png", name: "shot.png", size: 12345, spoiler: false,
  });
  const b = msg.attachments.get("1");
  assert.equal(b?.id, null);
  assert.equal(b?.name, "clip.mp4");
  assert.equal(b?.size, null);

  // An older server: only `attachment`.
  const legacy = new Message(null, channel, { id: "m-2", content: "", attachment: { url: "https://cdn.example.test/u/old.pdf", type: "application/pdf" } });
  assert.equal(legacy.attachments.size, 1);
  assert.deepEqual({ ...legacy.attachments.get("0") }, {
    id: null, url: "https://cdn.example.test/u/old.pdf", proxyURL: "https://cdn.example.test/u/old.pdf",
    contentType: "application/pdf", name: "old.pdf", size: null, spoiler: false,
  });

  // `attachments: []` wins over a stale `attachment`; neither → empty.
  assert.equal(new Message(null, channel, { id: "m-3", content: "", attachments: [], attachment: { url: "https://x.test/a", type: null } }).attachments.size, 0);
  assert.equal(new Message(null, channel, { id: "m-4", content: "" }).attachments.size, 0);
});

test("autocomplete: setAutocomplete registers it; getFocused + respond answer it", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");

  await client.application?.commands.set([
    new SlashCommandBuilder().setName("fruit").setDescription("Pick a fruit")
      .addStringOption((o) => o.setName("name").setDescription("Which").setRequired(true).setAutocomplete(true)),
  ]);
  const put = calls.find((c) => c.method === "PUT" && c.path === "/hubs/applications/@me/commands");
  assert.equal(put?.body.commands[0].options[0].autocomplete, true);

  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isAutocomplete()) return;
    const typed = i.options.getFocused();
    await i.respond(["apple", "apricot", "banana"].filter((f) => f.startsWith(typed)).map((f) => ({ name: f, value: f })));
  });
  await publish(client, "interaction.created", {
    id: "ac-1", type: "autocomplete", hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
    command: { id: "cmd-fruit", name: "fruit" }, subcommand: null, subcommand_group: null,
    options: [{ name: "name", type: "string", value: "ap", focused: true }],
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15000).toISOString(),
  });
  const cb = calls.find((c) => c.path === "/hubs/hub-1/app/interactions/ac-1/callback");
  assert.deepEqual(cb?.body, { type: "autocomplete", choices: [{ name: "apple", value: "apple" }, { name: "apricot", value: "apricot" }] });
  await client.destroy();
});

test("polls: PollData out, message.poll in, vote events, end() and fetchVoters()", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const channel = client.channels.cache.get("chan-1");

  // discord.js's PollData → the API's poll object.
  await channel.send({
    poll: {
      question: { text: "Best map?" },
      answers: [{ text: "Dust", emoji: "🏜️" }, { text: "Inferno", emoji: { id: "emoji-1" } }, { text: "Nuke" }],
      duration: 48,
      allowMultiselect: true,
    },
  });
  const post = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages")).at(-1);
  assert.deepEqual(post?.body, {
    poll: {
      question: "Best map?",
      answers: [{ text: "Dust", emoji: "🏜️" }, { text: "Inferno", emoji: "custom:emoji-1" }, { text: "Nuke" }],
      duration_hours: 48,
      allow_multiselect: true,
    },
  });

  // A message with a poll parses into Poll / PollAnswer.
  const data = {
    ...fromMember(""), content: null,
    poll: {
      question: "Best map?",
      answers: [
        { answer_id: 1, text: "Dust", emoji: "🏜️", count: 3, voted: false },
        { answer_id: 2, text: "Inferno", emoji: "custom:emoji-1", count: 1, voted: false },
      ],
      allow_multiselect: false, expires_at: "2026-10-05T21:00:00Z", ended: false, ended_at: null, total_voters: 4,
    },
  };
  let created;
  client.on(Events.MessageCreate, (m) => { created = m; });
  await publish(client, "message.created", data);
  const poll = created.poll;
  assert.equal(poll.question.text, "Best map?");
  assert.equal(poll.answers.size, 2);
  assert.equal(poll.answers.get(1).text, "Dust");
  assert.equal(poll.answers.get(1).voteCount, 3);
  assert.deepEqual({ ...poll.answers.get(2).emoji }, { id: "emoji-1", name: null, identifier: "custom:emoji-1" });
  assert.equal(poll.allowMultiselect, false);
  assert.equal(poll.expiresAt.toISOString(), "2026-10-05T21:00:00.000Z");
  assert.equal(poll.resultsFinalized, false);
  assert.equal(poll.totalVoters, 4);

  // Vote events: (pollAnswer, userId); a cached poll's count follows.
  const votes = [];
  client.on(Events.MessagePollVoteAdd, (answer, userId) => votes.push(["add", answer.id, answer.voteCount, userId]));
  client.on(Events.MessagePollVoteRemove, (answer, userId) => votes.push(["remove", answer.id, answer.voteCount, userId]));
  const vote = { message_id: data.id, hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null, user: { type: "member", profile_id: "user-7" } };
  await publish(client, "message.poll_vote_added", { ...vote, answer_id: 1 });
  await publish(client, "message.poll_vote_removed", { ...vote, answer_id: 2 });
  await publish(client, "message.poll_vote_added", { ...vote, message_id: "uncached", answer_id: 3 });
  assert.deepEqual(votes, [["add", 1, 4, "user-7"], ["remove", 2, 0, "user-7"], ["add", 3, null, "user-7"]]);

  // message.updated carries the ended poll.
  let updated;
  client.on(Events.MessageUpdate, (_old, fresh) => { updated = fresh; });
  await publish(client, "message.updated", { ...data, poll: { ...data.poll, ended: true, ended_at: "2026-10-04T12:00:00Z" } });
  assert.equal(updated.poll.resultsFinalized, true);
  assert.equal(updated.poll.endedAt.toISOString(), "2026-10-04T12:00:00.000Z");

  // end() and fetchVoters() hit the contract routes.
  await poll.end();
  assert.ok(calls.find((c) => c.method === "POST" && c.path === `/hubs/hub-1/app/messages/${data.id}/poll/end`));
  assert.equal(poll.resultsFinalized, true);
  const voters = await poll.answers.get(1).fetchVoters({ limit: 10 });
  assert.ok(calls.find((c) => c.method === "GET" && c.path === `/hubs/hub-1/app/messages/${data.id}/poll/answers/1/voters`));
  assert.equal(voters.get("user-7")?.displayName, "Kai");
});

test("setColor: numbers, hex with and without #, [r, g, b], Colors names and Random; anything else throws", async () => {
  const { Colors } = await import("./index.js");
  const color = (/** @type {any} */ c) => new EmbedBuilder().setColor(c).data.color;
  assert.equal(color(0x123456), 0x123456);
  assert.equal(color("#ff0000"), 0xff0000);
  assert.equal(color("00FF00"), 0x00ff00);
  assert.equal(color([0, 0, 255]), 0x0000ff);
  assert.equal(color("Red"), Colors.Red);
  assert.equal(color("Blurple"), 0x5865f2);
  assert.equal(color("Default"), 0);
  for (let n = 0; n < 20; n++) {
    const random = color("Random");
    assert.ok(Number.isInteger(random) && random >= 0 && random <= 0xffffff, `Random gave ${random}`);
  }
  assert.equal(color(null), undefined, "null clears the colour");
  for (const bad of ["NotAColour", "red", "#fff", "#gg0000", "", NaN, 1.5, [1, 2], [0, 0, 256], {}, true]) {
    assert.throws(() => color(bad), TypeError, `${JSON.stringify(bad)} should be a TypeError`);
  }
  assert.throws(() => color(0x1000000), RangeError);
  assert.throws(() => color(-1), RangeError);
});

test("message.mentions: users, roles and channels read from the stored text; has() agrees with them", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const { Member } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));
  const thread = hub.channels.add({ id: "th-1", name: "bugs", kind: "thread" });
  /** @type {any[]} */
  const got = [];
  client.on(Events.MessageCreate, (m) => got.push(m));

  // What the server stored for `${sam} ${moderator} ${general} ${thread}`, plus things that are not mentions:
  // an unknown name, an unresolved token (the server leaves those as written) and a link to a message.
  const general = "https://hub.thexive.com/hub/test-hub/conversations/general";
  await publish(client, "message.created", fromMember(
    `hi @sam and @Moderator, see ${general} and #bugs — not @nobody, <user:c0901ae8-6771-4e9a-b40c-b6e72d3ca397> or ${general}?m=abc`,
  ));
  const msg = got.at(-1);
  assert.deepEqual([...msg.mentions.users.keys()], ["user-1"]);
  assert.equal(msg.mentions.users.get("user-1"), client.users.cache.get("user-1"), "users go through client.users");
  assert.deepEqual([...msg.mentions.roles.keys()], ["role-mod"]);
  assert.equal(msg.mentions.roles.get("role-mod"), hub.roles.cache.get("role-mod"));
  assert.deepEqual([...msg.mentions.channels.keys()].sort(), ["chan-1", "th-1"]);
  assert.equal(msg.mentions.channels.get("th-1"), thread);
  assert.equal(msg.mentions.everyone, false);

  // has() and the collections agree, by object or by id.
  assert.ok(msg.mentions.has(client.users.cache.get("user-1")));
  assert.ok(msg.mentions.has("role-mod"));
  assert.ok(msg.mentions.has(hub.channels.cache.get("chan-1")));
  assert.ok(!msg.mentions.has("user-2"));
  // A member holding a mentioned role is mentioned, unless ignoreRoles — discord.js's rule.
  const modOnly = new Member(client, hub, { profile_id: "user-9", username: "kai", role_ids: ["role-mod"] });
  assert.ok(msg.mentions.has(modOnly));
  assert.ok(!msg.mentions.has(modOnly, { ignoreRoles: true }));
  // A user the caches had not seen is still found by name — and then appears in mentions.users.
  const stranger = new User(client, { id: "user-8", username: "luna" });
  await publish(client, "message.created", fromMember("ping @luna"));
  const second = got.at(-1);
  assert.equal(second.mentions.users.size, 0);
  assert.ok(second.mentions.has(stranger));
  assert.equal(second.mentions.users.get("user-8"), stranger);

  // @everyone: has() is true for anyone unless ignoreEveryone; the collections stay what was named.
  await publish(client, "message.created", fromMember("@everyone hello"));
  const all = got.at(-1);
  assert.equal(all.mentions.everyone, true);
  assert.equal(all.mentions.users.size + all.mentions.roles.size + all.mentions.channels.size, 0);
  assert.ok(all.mentions.has("anyone"));
  assert.ok(!all.mentions.has("anyone", { ignoreEveryone: true }));
  await client.destroy();
});

test("message.mentions: the server's list wins when the message carries one", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const { Member } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));
  /** @type {any[]} */
  const got = [];
  client.on(Events.MessageCreate, (m) => got.push(m));

  // A user this process never cached, a cached role and an unknown one, a cached channel and an
  // unknown one. The text is deliberately unhelpful: the list, not the text, is the answer.
  const listed = (/** @type {any} */ mentions, content = "see above") => ({ ...fromMember(content), mentions });
  await publish(client, "message.created", listed({
    everyone: false,
    users: [{ id: "user-77", username: "nova", name: "Nova Star" }],
    roles: [{ id: "role-mod", name: "Moderator" }, { id: "role-new", name: "Raiders" }],
    channels: [{ id: "chan-1", name: "general" }, { id: "chan-new", name: "secret-plans" }],
  }));
  const msg = got.at(-1);
  assert.deepEqual([...msg.mentions.users.keys()], ["user-77"]);
  const nova = client.users.cache.get("user-77");
  assert.ok(nova, "a mentioned user is added to client.users");
  assert.equal(nova.username, "nova");
  assert.equal(nova.displayName, "Nova Star");
  assert.equal(msg.mentions.users.get("user-77"), nova);
  assert.equal(msg.mentions.roles.get("role-mod"), hub.roles.cache.get("role-mod"), "a cached role is the cached object");
  const raiders = msg.mentions.roles.get("role-new");
  assert.ok(raiders instanceof Role && raiders.name === "Raiders", "an unknown role is a stub");
  assert.equal(String(raiders), "@Raiders", "a stub still stringifies (a non-uuid id has no token)");
  assert.equal(msg.mentions.channels.get("chan-1"), hub.channels.cache.get("chan-1"));
  const secret = msg.mentions.channels.get("chan-new");
  assert.ok(secret instanceof Channel && secret.name === "secret-plans", "an unknown channel is a stub");
  assert.equal(msg.mentions.everyone, false);

  assert.ok(msg.mentions.has(nova));
  assert.ok(msg.mentions.has("role-new"));
  assert.ok(msg.mentions.has("chan-new"));
  const raider = new Member(client, hub, { profile_id: "user-9", username: "kai", role_ids: ["role-new"] });
  assert.ok(msg.mentions.has(raider), "a member holding a listed role is mentioned");
  assert.ok(!msg.mentions.has(raider, { ignoreRoles: true }));

  // The text is not read when the list is there: `@sam` in it, an empty list — not mentioned.
  await publish(client, "message.created", listed({ everyone: false, users: [], roles: [], channels: [] }, "hi @sam @everyone"));
  const quiet = got.at(-1);
  assert.equal(quiet.mentions.users.size, 0);
  assert.equal(quiet.mentions.everyone, false, "everyone comes from the list too");
  assert.ok(!quiet.mentions.has(client.users.cache.get("user-1")));

  await publish(client, "message.created", listed({ everyone: true, users: [], roles: [], channels: [] }, ""));
  const all = got.at(-1);
  assert.ok(all.mentions.has("anyone"));
  assert.ok(!all.mentions.has("anyone", { ignoreEveryone: true }));

  // Message Content withheld: the server blanks the list as it blanks the text.
  await publish(client, "message.created", { ...listed({ everyone: false, users: [], roles: [], channels: [] }, ""), content_redacted: true });
  assert.equal(got.at(-1).mentions.users.size + got.at(-1).mentions.roles.size, 0);
  await client.destroy();
});

test("select-menu checks exist on every interaction: false on a command, true on the right component", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const { ComponentType } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  /** @type {any[]} */
  const got = [];
  client.on(Events.InteractionCreate, (i) => got.push(i));
  const base = {
    hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
  };
  await publish(client, "interaction.created", { ...base, id: "ix-cmd", command: { id: "cmd-1", name: "ping" }, options: [] });
  await publish(client, "interaction.created", { ...base, id: "ix-ch", type: "component", custom_id: "where", component_type: ComponentType.ChannelSelect, values: ["chan-1"], message: { id: "sent-1" } });
  await publish(client, "interaction.created", { ...base, id: "ix-btn", type: "component", custom_id: "go", component_type: ComponentType.Button, values: [], message: { id: "sent-1" } });
  const checks = ["isUserSelectMenu", "isRoleSelectMenu", "isMentionableSelectMenu", "isChannelSelectMenu", "isAnySelectMenu"];
  const [command, channelSelect, button] = got;
  assert.deepEqual(checks.map((c) => command[c]()), [false, false, false, false, false]);
  assert.deepEqual(checks.map((c) => channelSelect[c]()), [false, false, false, true, true]);
  assert.deepEqual(checks.map((c) => button[c]()), [false, false, false, false, false]);
  await client.destroy();
});

test("reply/followUp/editReply/update: Messages for public answers, { id } for private ones, null for none", async (t) => {
  fakeGateway(t);
  fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const channel = /** @type {any} */ (client.channels.cache.get("chan-1"));
  /** @type {any[]} */
  const got = [];
  client.on(Events.InteractionCreate, (i) => got.push(i));
  const command = async (/** @type {string} */ id) => {
    await publish(client, "interaction.created", {
      id, hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null, command: { id: "cmd-1", name: "ping" }, options: [],
      user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
    });
    return got.at(-1);
  };

  // reply(): the API's JSON by default, as before …
  let i = await command("ix-a");
  const raw = await i.reply("Pong!");
  assert.ok(!(raw instanceof Message));
  assert.equal(raw.id, "reply-ix-a");
  // … and followUp() a Message, built through the channel's manager like channel.send().
  const follow = await i.followUp("More");
  assert.ok(follow instanceof Message);
  assert.equal(follow.id, "followup-ix-a");
  assert.equal(follow.content, "More");
  assert.equal(follow.author?.id, APP.id);
  assert.equal(follow.author?.bot, true);
  assert.equal(channel.messages.cache.get("followup-ix-a"), follow);
  // A private follow-up is not a channel message: the raw { id }.
  assert.deepEqual(await i.followUp({ content: "psst", ephemeral: true }), { id: "private-followup-ix-a" });
  // editReply() after a reply edits it — and returns the Message, kept up to date.
  const edited = await i.editReply("Pong! (edited)");
  assert.ok(edited instanceof Message);
  assert.equal(edited.id, "reply-ix-a");
  assert.equal(edited.content, "Pong! (edited)");
  assert.ok(edited.editedAt instanceof Date);

  // reply({ fetchReply: true }) → the Message; a private one → { id }.
  i = await command("ix-b");
  const fetched = await i.reply({ content: "Fetched", fetchReply: true });
  assert.ok(fetched instanceof Message);
  assert.equal(fetched.content, "Fetched");
  assert.equal(channel.messages.cache.get("reply-ix-b"), fetched);
  assert.equal((await i.editReply("Changed")), fetched, "editing a cached reply updates that Message");
  assert.equal(fetched.content, "Changed");
  i = await command("ix-c");
  assert.deepEqual(await i.reply({ content: "Secret", ephemeral: true, fetchReply: true }), { id: "private-ix-c" });
  assert.deepEqual(await i.editReply("Still secret"), { id: "private-ix-c" });

  // deferReply() → editReply() SENDS the answer: a whole Message.
  i = await command("ix-d");
  await i.deferReply();
  const answer = await i.editReply("Done");
  assert.ok(answer instanceof Message);
  assert.equal(answer.id, "reply-ix-d");
  assert.equal(answer.author?.id, APP.id);

  // No message in the answer: null, not a throw.
  i = await command("ix-empty");
  assert.equal(await i.reply({ content: "x", fetchReply: true }), null);
  assert.equal(await i.followUp("x"), null);
  assert.equal(await i.editReply("x"), null);

  // update(): the API's JSON, or with fetchReply the message the control is on, updated.
  const source = channel.messages.add({ id: "sent-1", content: "Vote!", author: { type: "application", application_id: APP.id, name: APP.name } });
  await publish(client, "interaction.created", {
    id: "ix-up", type: "component", custom_id: "yes", component_type: 2, values: [], message: { id: "sent-1", content: "Vote!", components: [] },
    hub_id: HUB.id, channel_id: "chan-1", parent_channel_id: null,
    user: { type: "member", profile_id: "user-1", username: "sam", name: "Sam", permissions: [], role_ids: [] },
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 900000).toISOString(),
  });
  const press = got.at(-1);
  assert.deepEqual(await press.update({ content: "Counted" }), { id: "sent-1", content: "Counted" });
  const updated = await press.update({ content: "Counted again", components: [], fetchReply: true });
  assert.equal(updated, source);
  assert.equal(source.content, "Counted again");
  assert.deepEqual(source.components, []);
  await client.destroy();
});

test("ChannelSelectMenuBuilder.setDefaultChannels takes uuid strings", async () => {
  const { ChannelSelectMenuBuilder } = await import("./index.js");
  const id = "66666666-7777-4888-9999-000000000000";
  assert.deepEqual(new ChannelSelectMenuBuilder().setDefaultChannels(id, [id]).toJSON().default_values,
    [{ id, type: "channel" }, { id, type: "channel" }]);
});

test("hub commands: hub.commands.set() and application.commands.set(commands, hubId) write that hub's own set", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));

  const saved = await hub.commands.set([new SlashCommandBuilder().setName("beta").setDescription("Try it")]);
  const put = calls.find((c) => c.method === "PUT" && c.path === "/hubs/hub-1/app/commands");
  assert.ok(put, "PUT to the hub's route, not the global one");
  assert.equal(put.body.commands[0].name, "beta");
  assert.equal(saved.get("hubcmd-beta").name, "beta");
  assert.ok(!calls.some((c) => c.method === "PUT" && c.path === "/hubs/applications/@me/commands"));

  await client.application.commands.set([{ name: "other", description: "x" }], "hub-1");
  assert.equal(calls.filter((c) => c.method === "PUT" && c.path === "/hubs/hub-1/app/commands").at(-1).body.commands[0].name, "other");
  const fetched = await client.application.commands.fetch("hub-1");
  assert.ok(fetched instanceof Map);
  assert.ok(calls.some((c) => c.method === "GET" && c.path === "/hubs/hub-1/app/commands"));
});

test("role permissions: setPermissions sends the whole set as a map; create takes permissions", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));
  const mod = await hub.roles.fetch("role-mod");

  // Moderator has mod_ban and mod_kick; the new set keeps kick, drops ban, adds timeout by its discord.js name.
  const back = await mod.setPermissions(["mod_kick", "ModerateMembers"]);
  const patch = calls.find((c) => c.method === "PATCH" && c.path === "/hubs/hub-1/app/roles/role-mod");
  assert.equal(back, mod, "resolves to the role");
  assert.equal(patch.body.permissions.mod_ban, false, "a key left out is removed");
  assert.equal(patch.body.permissions.mod_kick, true);
  assert.equal(patch.body.permissions.mod_timeout, true, "a discord.js name is sent as its key");
  assert.ok(mod.permissions.has("mod_kick") && !mod.permissions.has("mod_ban"), "the cached role follows");

  await mod.edit({ position: 400 });
  assert.equal(calls.filter((c) => c.method === "PATCH").at(-1).body.rank, 400, "position is sent as rank");

  const role = await hub.roles.create({ name: "Helper", permissions: ["mod_kick"] });
  const post = calls.find((c) => c.method === "POST" && c.path === "/hubs/hub-1/app/roles");
  assert.deepEqual(post.body.permissions, { mod_kick: true });
  assert.ok(role.permissions.has("mod_kick"));
});

test("forums: posts.create, fetch and fetchOne, edit and its shortcuts, reply, and the two post events", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const { ChannelKind, ForumPost } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));
  const forum = hub.channels.add(FORUM);

  assert.equal(forum.isForum(), true);
  assert.equal(forum.isTextBased(), false);
  assert.equal(forum.url, "https://hub.thexive.com/hub/test-hub/forum/help");
  assert.deepEqual(forum.forumTags[1], { id: "tag-staff", name: "Staff", color: null, emoji: null, modOnly: true });
  assert.deepEqual(forum.forumSettings, { requireTag: true, defaultSort: "activity", defaultLayout: "list" });

  // create: title and tags are the post's; the rest is the opening message, files included.
  const post = await forum.posts.create({
    title: "Crash on login", tags: [forum.forumTags[0], "tag-staff"], content: "Steps <@abcdef12>",
    files: [{ attachment: Buffer.from("trace"), name: "log.txt" }],
  });
  const created = calls.find((c) => c.method === "POST" && c.path === "/hubs/hub-1/app/channels/forum-1/posts");
  assert.deepEqual(created?.body, { content: "Steps <user:abcdef12>", title: "Crash on login", applied_tags: ["tag-bug", "tag-staff"], files: ["log.txt"] });
  assert.ok(post instanceof ForumPost);
  assert.equal(post.author?.bot, true);
  assert.equal(post.owner, null);
  assert.equal(post.channel.kind, ChannelKind.Thread);
  assert.equal(post.channel.messages.cache.get("starter-1")?.content, "Steps <user:abcdef12>");
  assert.equal(post.url, "https://hub.thexive.com/hub/test-hub/forum/help/post-1");

  // fetch: camelCase options → the API's query.
  const page = await forum.posts.fetch({ sort: "top", tag: forum.forumTags[0], status: "unanswered", query: "crash", page: 1 });
  assert.deepEqual(calls.at(-1)?.query, { sort: "top", tag: "tag-bug", status: "unanswered", q: "crash", page: "1" });
  assert.equal(page.hasMore, true);
  assert.equal(page.posts[0], post, "the cached post, refreshed");
  assert.equal(post.pinned, true);
  assert.equal(post.owner?.username, "sam");
  assert.equal(post.author, post.owner);
  assert.deepEqual(post.starter, { id: "starter-1", excerpt: "It **crashes**", mediaUrl: null, mediaType: null, deleted: false });
  assert.deepEqual([post.replyCount, post.voteCount, post.tags], [2, 5, ["tag-bug"]]);

  const one = await forum.posts.fetchOne("post-1");
  assert.equal(calls.at(-1)?.path, "/hubs/hub-1/app/posts/post-1");
  assert.equal(one.solved, true);
  assert.equal(one.acceptedMessage?.content, "Fixed in 2.1");

  // edit and the shortcuts: camelCase → the API's fields, the response patched in.
  await post.edit({ title: "Crash on login (2.0)", tags: ["tag-bug"], pinned: false });
  assert.deepEqual(calls.at(-1)?.body, { title: "Crash on login (2.0)", applied_tags: ["tag-bug"], pinned: false });
  assert.equal(post.title, "Crash on login (2.0)");
  assert.equal(post.channel.name, "Crash on login (2.0)");
  const reply = await post.reply("Fixed in 2.1");
  assert.equal(calls.at(-1)?.path, "/hubs/hub-1/app/channels/post-1/messages");
  await post.setAnswer(reply);
  assert.deepEqual(calls.at(-1)?.body, { accepted_message_id: "reply-1" });
  assert.equal(post.solved, true);
  await post.setAnswer(null);
  assert.deepEqual(calls.at(-1)?.body, { accepted_message_id: null });
  await post.lock();
  assert.equal(post.locked, true);
  await post.archive();
  assert.equal(post.archived, true);
  await post.unpin();
  assert.deepEqual(calls.slice(-3).map((c) => c.body), [{ locked: true }, { archived: true }, { pinned: false }]);

  // Gateway: forum.post_created / forum.post_updated, for a forum the cache did not know yet.
  /** @type {any[]} */ const seen = [];
  client.on(Events.ForumPostCreate, (p) => seen.push(["create", p.id, p.forum.id, p.title]));
  client.on(Events.ForumPostUpdate, (p, changes) => seen.push(["update", p.id, p.locked, changes]));
  await publish(client, "forum.post_created", { channel_id: "forum-2", post: forumPost({ id: "post-2", forum_id: "forum-2", title: "New one" }) });
  await publish(client, "forum.post_updated", { channel_id: "forum-2", post: forumPost({ id: "post-2", forum_id: "forum-2", title: "New one", is_locked: true }), changes: ["locked"] });
  assert.deepEqual(seen, [["create", "post-2", "forum-2", "New one"], ["update", "post-2", true, ["locked"]]]);
  assert.equal(hub.channels.cache.get("forum-2")?.kind, ChannelKind.Forum);
  assert.equal(hub.channels.cache.get("forum-2")?.posts.cache.get("post-2")?.locked, true);
  await client.destroy();
});

test("forums: create a forum with tags and settings; setForumTags and setForumSettings send the API's shapes", async (t) => {
  fakeGateway(t);
  const calls = fakeApi(t);
  const { ChannelKind } = await import("./index.js");
  const client = new Client({ baseURL: "https://api.example.test" });
  await client.login("xive_as_test");
  const hub = /** @type {any} */ (client.hubs.cache.get("hub-1"));

  await hub.channels.create({
    name: "help", kind: ChannelKind.Forum,
    forumTags: [{ name: "Bug", color: "#ff0000", emoji: "🐛" }, { name: "Staff", modOnly: true }],
    forumSettings: { requireTag: true, defaultLayout: "gallery" },
  });
  const made = calls.find((c) => c.method === "POST" && c.path === "/hubs/hub-1/app/channels");
  assert.deepEqual(made?.body, {
    name: "help", kind: "forum",
    forum_tags: [{ name: "Bug", color: "#ff0000", emoji: "🐛" }, { name: "Staff", mod_only: true }],
    forum_settings: { require_tag: true, default_layout: "gallery" },
  });

  const forum = hub.channels.add(FORUM);
  await forum.setForumTags([...forum.forumTags.slice(0, 1), { name: "Question" }]);
  const patched = calls.find((c) => c.method === "PATCH" && c.path === "/hubs/hub-1/app/channels/forum-1");
  assert.deepEqual(patched?.body, { forum_tags: [{ id: "tag-bug", name: "Bug", color: "#ff0000", emoji: "🐛", mod_only: false }, { name: "Question" }] });
  assert.equal(calls.at(-1)?.path, "/hubs/hub-1/app/channels", "re-read for the new tag's id");

  await forum.setForumSettings({ defaultSort: "top" });
  assert.deepEqual(calls.at(-1)?.body, { forum_settings: { default_sort: "top" } });
  assert.deepEqual(forum.forumSettings, { requireTag: true, defaultSort: "top", defaultLayout: "list" });
  await client.destroy();
});
