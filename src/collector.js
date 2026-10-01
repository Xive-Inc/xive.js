import { EventEmitter } from "node:events";
import { Collection } from "./collection.js";
import { Events } from "./constants.js";

/**
 * Collects interactions matching a predicate, discord.js-style: `collect` per match, `end` with
 * everything collected and a reason — `"time"`, `"limit"` or whatever `stop(reason)` was given.
 *
 * Built by `message.createMessageComponentCollector()` and the `await…` helpers; rarely made
 * directly.
 */
export class InteractionCollector extends EventEmitter {
  /**
   * @param {import("./client.js").Client} client
   * @param {(i: any) => boolean} predicate what this collector is about (its message, its form)
   * @param {{ filter?: (i: any) => boolean, time?: number, max?: number }} [options]
   */
  constructor(client, predicate, options = {}) {
    super();
    this.client = client;
    this.filter = options.filter ?? (() => true);
    this.max = options.max ?? Infinity;
    /** @type {Collection<string, any>} */
    this.collected = new Collection();
    this.ended = false;

    this.listener = (/** @type {any} */ interaction) => {
      if (this.ended || !predicate(interaction) || !this.filter(interaction)) return;
      this.collected.set(interaction.id, interaction);
      this.emit("collect", interaction);
      if (this.collected.size >= this.max) this.stop("limit");
    };
    client.on(Events.InteractionCreate, this.listener);
    this.timer = options.time ? setTimeout(() => this.stop("time"), options.time) : null;
  }

  /** @param {string} [reason] */
  stop(reason = "user") {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearTimeout(this.timer);
    this.client.off(Events.InteractionCreate, this.listener);
    this.emit("end", this.collected, reason);
  }
}

/**
 * The first interaction a collector gathers; rejects if it ends with none, as discord.js's
 * `awaitMessageComponent` does on timeout.
 *
 * @param {InteractionCollector} collector
 */
export function awaitOne(collector) {
  return new Promise((resolve, reject) => {
    collector.once("end", (collected, reason) => {
      const first = collected.first();
      if (first) resolve(first);
      else reject(new Error(`Collector received no interactions before ending with reason: ${reason}`));
    });
  });
}
