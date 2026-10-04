import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { XiveUnsupportedError } from "./errors.js";

/**
 * A file to send — discord.js's `AttachmentBuilder`. Pass it, a Buffer, a file path, an http(s)
 * URL, or `{ attachment, name }` in `files`. Xive takes ONE file per message.
 */
export class AttachmentBuilder {
  /**
   * @param {Buffer | Uint8Array | string} attachment bytes, a file path, or an http(s) URL
   * @param {{ name?: string, description?: string }} [data]
   */
  constructor(attachment, data = {}) {
    this.attachment = attachment;
    this.name = data.name ?? null;
    this.description = data.description ?? null;
  }
  /** @param {Buffer | Uint8Array | string} attachment */ setFile(attachment) { this.attachment = attachment; return this; }
  /** @param {string} name */ setName(name) { this.name = name; return this; }
  /** @param {string} description */ setDescription(description) { this.description = description; return this; }
}

/**
 * The one file in `options.files`, or null. More than one throws: hub messages carry one file.
 * @param {any} options
 */
export function pickFile(options) {
  const files = options && typeof options === "object" ? options.files : undefined;
  if (!files?.length) return null;
  if (files.length > 1) {
    throw new XiveUnsupportedError("More than one file per message", "send one file per message");
  }
  return files[0];
}

/**
 * Bytes and a filename for any accepted input.
 * @param {any} input
 * @returns {Promise<{ data: Uint8Array, name: string }>}
 */
export async function resolveFile(input) {
  const src = input instanceof AttachmentBuilder || (input && typeof input === "object" && "attachment" in input)
    ? input.attachment
    : input;
  const given = input && typeof input === "object" && "name" in input ? input.name : null;

  if (typeof src === "string") {
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`xive.js: could not fetch ${src} (${res.status})`);
      const name = given ?? (basename(new URL(src).pathname) || "file");
      return { data: new Uint8Array(await res.arrayBuffer()), name };
    }
    return { data: await readFile(src), name: given ?? basename(src) };
  }
  if (src instanceof Uint8Array) return { data: src, name: given ?? "file" };
  throw new TypeError("xive.js: a file must be a Buffer, a path, an http(s) URL, or { attachment, name }");
}
