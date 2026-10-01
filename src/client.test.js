import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Client } from "./client.js";
import { verifySignature } from "./verify.js";

const SECRET = "a".repeat(64);

/** Sign exactly as IntegrationsDispatch::send does. */
function signed(envelope, { id = "11111111-1111-4111-8111-111111111111", timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z") } = {}) {
  const body = JSON.stringify(envelope);
  const signature = "sha256=" + createHmac("sha256", SECRET).update(id + timestamp + body).digest("hex");
  return {
    headers: { "xive-event-id": id, "xive-event-timestamp": timestamp, "xive-signature": signature },
    body,
  };
}

const messageEnvelope = {
  subscription: { id: "s", application_id: "app-1", hub_id: "hub-1" },
  event: {
    id: "11111111-1111-4111-8111-111111111111",
    type: "message.created",
    occurred_at: "2026-10-01T12:00:00Z",
    data: {
      id: "m1", hub_id: "hub-1", channel_id: "c1", parent_channel_id: null, content: "!ping",
      created_at: "2026-10-01T12:00:00.000Z", edited: false, edited_at: null, reply_to_id: null,
      attachment: null, author: { type: "member", profile_id: "p1", username: "sam", name: "Sam" },
    },
  },
};

test("verifySignature accepts a correct signature and rejects a tampered body", () => {
  const { headers, body } = signed(messageEnvelope);
  const base = { secret: SECRET, eventId: headers["xive-event-id"], timestamp: headers["xive-event-timestamp"], signature: headers["xive-signature"] };
  assert.equal(verifySignature({ ...base, body }), true);
  assert.equal(verifySignature({ ...base, body: body.replace("!ping", "!pong") }), false);
  assert.equal(verifySignature({ ...base, secret: "b".repeat(64), body }), false);
});

test("verifySignature rejects a stale timestamp", () => {
  const { headers, body } = signed(messageEnvelope, { timestamp: "2020-01-01T00:00:00Z" });
  assert.equal(verifySignature({
    secret: SECRET, eventId: headers["xive-event-id"], timestamp: headers["xive-event-timestamp"],
    signature: headers["xive-signature"], body,
  }), false);
});

test("receive emits messageCreate once, and acknowledges a retry without re-emitting", async () => {
  const replies = [];
  const client = new Client({
    token: "xive_as_test",
    signingSecret: SECRET,
    fetch: async (url, init) => {
      replies.push({ url, init });
      return new Response(JSON.stringify({ success: true, message: { id: "m2" } }), { status: 201 });
    },
  });

  let count = 0;
  client.on("messageCreate", async (message) => {
    count++;
    assert.equal(message.content, "!ping");
    assert.equal(message.hubId, "hub-1");
    assert.equal(message.isAutomated, false);
    await message.reply("pong");
  });

  const delivery = signed(messageEnvelope);
  assert.equal(client.receive(delivery).status, 200);
  assert.equal(client.receive(delivery).status, 200);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(count, 1);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].url, "https://api.thexive.com/hubs/hub-1/app/channels/c1/messages");
  assert.deepEqual(JSON.parse(replies[0].init.body), { content: "pong", reply_to_id: "m1" });
  assert.equal(replies[0].init.headers.Authorization, "Bearer xive_as_test");
});

test("receive refuses a bad signature", () => {
  const client = new Client({ token: "t", signingSecret: SECRET });
  const delivery = signed(messageEnvelope);
  delivery.headers["xive-signature"] = "sha256=" + "0".repeat(64);
  assert.equal(client.receive(delivery).status, 401);
});

test("REST surfaces the error envelope as XiveAPIError", async () => {
  const client = new Client({
    token: "t",
    fetch: async () => new Response(JSON.stringify({
      success: false, error: { type: "PermissionError", code: "PERMISSION_DENIED", message: "nope" },
    }), { status: 403 }),
  });
  await assert.rejects(client.hub("h").channels(), (err) => err.type === "PermissionError" && err.status === 403);
});
