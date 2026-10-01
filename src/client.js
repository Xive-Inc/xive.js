import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { REST } from "./rest.js";
import { verifySignature } from "./verify.js";
import { Hub, Message } from "./structures.js";

/** @typedef {import("centrifuge").Centrifuge} Centrifuge */

/**
 * Xive event type → the name a listener subscribes to. Anything not listed is still emitted as
 * `raw`, so a new server-side type is usable before this table learns about it.
 */
export const EVENT_NAMES = Object.freeze({
  "message.created": "messageCreate",
  "message.updated": "messageUpdate",
  "message.deleted": "messageDelete",
  "message.reaction_added": "messageReactionAdd",
  "message.reaction_removed": "messageReactionRemove",
  "member.joined": "memberJoin",
  "member.left": "memberLeave",
  "member.kicked": "memberKick",
  "member.banned": "memberBan",
  "member.unbanned": "memberUnban",
  "role.assigned": "roleAssign",
  "role.removed": "roleRemove",
  ping: "ping",
});

/** How many event ids are remembered for de-duplicating retries. */
const SEEN_MAX = 2000;

/** Largest body a delivery may have before it is refused unread. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * A Xive bot.
 *
 * Events reach it one of two ways, and the listeners are the same either way:
 *
 *   - `connect()` — the GATEWAY. The bot opens an outbound websocket, like discord.js. No public
 *     URL, no tunnel; runs from a laptop.
 *   - `listen()` / `middleware()` — HTTP. Xive POSTs each event, signed, to the URL registered with
 *     `setEventEndpoint`. The client verifies it, answers 200 at once and then emits, so a slow
 *     listener never makes Xive retry.
 *
 * Using both is safe: each event carries one id across both routes, and the second copy is dropped.
 *
 * @example
 * const client = new Client({ token: process.env.XIVE_TOKEN, signingSecret: process.env.XIVE_SIGNING_SECRET });
 * client.on("messageCreate", async (message) => {
 *   if (message.isAutomated) return;
 *   if (message.content === "!ping") await message.reply("pong");
 * });
 * client.listen(3000);
 */
export class Client extends EventEmitter {
  /**
   * @param {{
   *   token: string,
   *   signingSecret?: string,
   *   baseURL?: string,
   *   fetch?: typeof fetch,
   *   toleranceSeconds?: number,
   *   WebSocket?: any,
   * }} options  `WebSocket` is only needed on Node < 22, which has no global one (pass `ws`).
   */
  constructor({ token, signingSecret, baseURL, fetch, toleranceSeconds, WebSocket }) {
    // An async listener that rejects lands in [Symbol.for("nodejs.rejection")] below, not in an
    // unhandled rejection.
    super({ captureRejections: true });
    this.rest = new REST({ token, baseURL, fetch });
    this.signingSecret = signingSecret ?? null;
    this.toleranceSeconds = toleranceSeconds;
    /** Filled by `login()`. @type {{ id: string, name: string, client_id: string } | null} */
    this.application = null;
    /** @type {Set<string>} */
    this.seen = new Set();
    this.WebSocket = WebSocket ?? globalThis.WebSocket;
    /** @type {Centrifuge | null} */
    this.gateway = null;
  }

  /** Check the token and learn who this application is. Optional, but `message.isOwn` needs it. */
  async login() {
    const { application } = await this.rest.get("/hubs/applications/@me");
    this.application = application;
    this.emit("ready", application);
    return application;
  }

  /** Every hub that has installed this application. */
  async hubs() {
    return (await this.rest.get("/hubs/applications/@me/hubs")).hubs;
  }

  /* ── The gateway ───────────────────────────────────────────────────────────────────────── */

  /**
   * Connect to the gateway and start receiving events. Resolves once connected; reconnects on its
   * own after that, and events missed during a short drop are replayed from history on reconnect.
   *
   * @param {{ timeoutMs?: number }} [options]
   */
  async connect({ timeoutMs = 15000 } = {}) {
    if (this.gateway) return;
    if (!this.WebSocket) {
      throw new Error("xive.js: no WebSocket available — use Node 22+, or pass { WebSocket } from the 'ws' package");
    }
    const { Centrifuge } = await import("centrifuge");
    const first = await this.rest.post("/hubs/applications/@me/gateway");

    const gateway = new Centrifuge(first.url, {
      token: first.token,
      // Called by centrifuge before the token expires, and after a reconnect that needs a new one.
      getToken: async () => (await this.rest.post("/hubs/applications/@me/gateway")).token,
      websocket: this.WebSocket,
    });
    this.gateway = gateway;

    // Server-side subscription (the token names `app:<id>`), so publications arrive on the client.
    gateway.on("publication", (ctx) => {
      const id = ctx.data?.event?.id;
      if (id && !this.#markSeen(id)) return;
      this.#dispatch(ctx.data);
    });
    gateway.on("connected", () => this.emit("gatewayConnect"));
    gateway.on("disconnected", (ctx) => this.emit("gatewayDisconnect", ctx));
    gateway.on("error", (ctx) => this.emit("debug", ctx));

    gateway.connect();
    await gateway.ready(timeoutMs);
  }

  /** Close the gateway connection. */
  disconnect() {
    this.gateway?.disconnect();
    this.gateway = null;
  }

  /** @param {string} key a hub slug or id */
  hub(key) {
    return new Hub(this, key);
  }

  /* ── Registration — part of a deploy, like the command set ─────────────────────────────── */

  /**
   * Point this application's events at `url`. Idempotent — call it on every deploy. The signing
   * secret comes back ONLY the first time; store it as `signingSecret`.
   *
   * @param {string} url  https only
   * @param {{ events?: string[] | null }} [options]  null / omitted = every event
   * @returns {Promise<{ subscription: any, secret?: string }>}
   */
  setEventEndpoint(url, { events = null } = {}) {
    return this.rest.put("/hubs/applications/@me/events", { target_url: url, event_types: events });
  }

  /** @returns {Promise<{ subscription: any | null, types: Record<string, string> }>} */
  getEventEndpoint() {
    return this.rest.get("/hubs/applications/@me/events");
  }

  removeEventEndpoint() {
    return this.rest.delete("/hubs/applications/@me/events");
  }

  /** A new signing secret, shown once. The old one stops verifying immediately. */
  rotateSigningSecret() {
    return this.rest.post("/hubs/applications/@me/events/secret");
  }

  /** Ask Xive to send a signed `ping` to your endpoint now. */
  testEventEndpoint() {
    return this.rest.post("/hubs/applications/@me/events/test");
  }

  /** The last 50 deliveries and how each went. */
  async deliveries() {
    return (await this.rest.get("/hubs/applications/@me/events/deliveries")).deliveries;
  }

  /**
   * Replace the whole slash-command set. Registration only for now — Xive does not deliver
   * invocations yet.
   * @param {any[]} commands
   */
  setCommands(commands) {
    return this.rest.put("/hubs/applications/@me/commands", { commands });
  }

  /* ── Receiving ─────────────────────────────────────────────────────────────────────────── */

  /**
   * Handle one delivery, framework-agnostic. Returns the status to answer with; emitting happens
   * on the next tick, after the caller has had the chance to respond.
   *
   * @param {{ headers: Record<string, string | string[] | undefined>, body: string | Buffer }} delivery
   * @returns {{ status: number }}
   */
  receive({ headers, body }) {
    const h = (/** @type {string} */ name) => {
      const v = headers[name] ?? headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    };
    const eventId = h("xive-event-id");

    if (!this.signingSecret) {
      this.#fail(new Error("xive.js: received an event but no signingSecret is configured"));
      return { status: 500 };
    }
    const ok = verifySignature({
      secret: this.signingSecret,
      eventId,
      timestamp: h("xive-event-timestamp"),
      signature: h("xive-signature"),
      body,
      toleranceSeconds: this.toleranceSeconds,
    });
    if (!ok) return { status: 401 };

    /** @type {any} */
    let envelope;
    try {
      envelope = JSON.parse(body.toString());
    } catch {
      return { status: 400 };
    }

    // A retry of something already handled (or a copy that came over the gateway): acknowledge it
    // and do nothing.
    if (eventId && !this.#markSeen(eventId)) return { status: 200 };

    setImmediate(() => this.#dispatch(envelope));
    return { status: 200 };
  }

  /**
   * A `(req, res)` handler for node:http or Express. With Express, mount it BEFORE any JSON body
   * parser, or give it `express.raw({ type: "application/json" })` — it needs the raw bytes.
   */
  middleware() {
    return (/** @type {any} */ req, /** @type {any} */ res) => {
      const done = (/** @type {Buffer} */ raw) => {
        const { status } = this.receive({ headers: req.headers, body: raw });
        res.statusCode = status;
        res.end();
      };
      if (Buffer.isBuffer(req.body)) return done(req.body);

      /** @type {Buffer[]} */
      const chunks = [];
      let size = 0;
      req.on("data", (/** @type {Buffer} */ c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          res.statusCode = 413;
          res.end();
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        if (!res.writableEnded) done(Buffer.concat(chunks));
      });
    };
  }

  /**
   * Serve the endpoint yourself. Put it behind https (a reverse proxy or a tunnel) — Xive only
   * delivers to https URLs.
   *
   * @param {number} port
   * @param {{ path?: string }} [options]
   */
  listen(port, { path = "/" } = {}) {
    const handler = this.middleware();
    const server = createServer((req, res) => {
      if (req.method !== "POST" || (req.url ?? "/").split("?")[0] !== path) {
        res.statusCode = 404;
        res.end();
        return;
      }
      handler(req, res);
    });
    return server.listen(port);
  }

  /** Remember an event id. False if it was already seen. @param {string} id */
  #markSeen(id) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > SEEN_MAX) this.seen.delete(/** @type {string} */ (this.seen.values().next().value));
    return true;
  }

  /** @param {any} envelope */
  #dispatch(envelope) {
    try {
      const event = envelope?.event ?? {};
      const hubId = envelope?.subscription?.hub_id ?? null;
      this.emit("raw", event, envelope);

      const name = EVENT_NAMES[/** @type {keyof typeof EVENT_NAMES} */ (event.type)];
      if (!name) return;

      if (event.type === "message.created" || event.type === "message.updated") {
        this.emit(name, new Message(this, event.data, hubId));
      } else if (event.type === "message.deleted") {
        this.emit(name, {
          id: event.data.id,
          hubId: event.data.hub_id ?? hubId,
          channelId: event.data.channel_id,
          parentChannelId: event.data.parent_channel_id ?? null,
        });
      } else {
        this.emit(name, { hubId, ...event.data });
      }
    } catch (err) {
      this.#fail(err);
    }
  }

  /** @param {unknown} err */
  [Symbol.for("nodejs.rejection")](err) {
    this.#fail(err);
  }

  /** @param {unknown} err */
  #fail(err) {
    // An 'error' event with no listener throws — out of a setImmediate, that kills the process.
    if (this.listenerCount("error") > 0) this.emit("error", err);
    else console.error(err);
  }
}
