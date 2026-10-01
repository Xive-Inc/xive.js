import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Connection } from "./connection.js";
import { verifySignature } from "./verify.js";

const SECRET = "a".repeat(64);

/** Sign exactly as IntegrationsDispatch::send does. */
function signed(envelope, { id = "11111111-1111-4111-8111-111111111111", timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z") } = {}) {
  const body = JSON.stringify(envelope);
  const signature = "sha256=" + createHmac("sha256", SECRET).update(id + timestamp + body).digest("hex");
  return { headers: { "xive-event-id": id, "xive-event-timestamp": timestamp, "xive-signature": signature }, body };
}

const envelope = {
  subscription: { id: "s", application_id: "app-1", hub_id: "hub-1" },
  event: { id: "11111111-1111-4111-8111-111111111111", type: "message.created", occurred_at: "2026-10-01T12:00:00Z", data: { id: "m1", content: "!ping" } },
};

test("verifySignature accepts a correct signature and rejects tampering, a wrong key and a stale timestamp", () => {
  const { headers, body } = signed(envelope);
  const base = { secret: SECRET, eventId: headers["xive-event-id"], timestamp: headers["xive-event-timestamp"], signature: headers["xive-signature"] };
  assert.equal(verifySignature({ ...base, body }), true);
  assert.equal(verifySignature({ ...base, body: body.replace("!ping", "!pong") }), false);
  assert.equal(verifySignature({ ...base, secret: "b".repeat(64), body }), false);
  const stale = signed(envelope, { timestamp: "2020-01-01T00:00:00Z" });
  assert.equal(verifySignature({ ...base, timestamp: "2020-01-01T00:00:00Z", signature: stale.headers["xive-signature"], body: stale.body }), false);
});

test("receive emits each event once, acknowledges retries, and refuses a bad signature", async () => {
  const conn = new Connection({ token: "t", signingSecret: SECRET });
  let count = 0;
  conn.on("event", (event) => { count++; assert.equal(event.type, "message.created"); });

  const delivery = signed(envelope);
  assert.equal(conn.receive(delivery).status, 200);
  assert.equal(conn.receive(delivery).status, 200);
  // receive() dispatches on setImmediate; an immediate queued after it runs after it. A timer
  // would not be ordered: on a busy loop it can fire before the check phase.
  await new Promise((r) => setImmediate(r));
  assert.equal(count, 1);

  const bad = signed(envelope, { id: "22222222-2222-4222-8222-222222222222" });
  bad.headers["xive-signature"] = "sha256=" + "0".repeat(64);
  assert.equal(conn.receive(bad).status, 401);
});

test("REST surfaces the error envelope as XiveAPIError", async () => {
  const conn = new Connection({
    token: "t",
    fetch: async () => new Response(JSON.stringify({
      success: false, error: { type: "PermissionError", code: "PERMISSION_DENIED", message: "nope" },
    }), { status: 403 }),
  });
  await assert.rejects(conn.hubs(), (err) => err.type === "PermissionError" && err.status === 403);
});
