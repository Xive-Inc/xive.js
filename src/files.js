import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { XiveUnsupportedError } from "./errors.js";

/**
 * A file to send — discord.js's `AttachmentBuilder`. Pass it, a Buffer, a file path, an http(s)
 * URL, or `{ attachment, name }` in `files`. Xive takes up to MAX_FILES (10) files per message.
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

/** The most files one message carries. */
export const MAX_FILES = 10;

/**
 * The files in `options.files`, in order — `[]` when there are none. More than MAX_FILES throws.
 * @param {any} options
 * @returns {any[]}
 */
export function pickFiles(options) {
  const files = options && typeof options === "object" ? options.files : undefined;
  if (!files?.length) return [];
  checkFileCount(files.length);
  return [...files];
}

/** @param {number} count */
export function checkFileCount(count) {
  if (count > MAX_FILES) {
    throw new XiveUnsupportedError(`More than ${MAX_FILES} files per message`, `send at most ${MAX_FILES} files per message`);
  }
}

/**
 * Every file in `options.files`, resolved in order — `[]` when there are none.
 * @param {any} options
 * @returns {Promise<{ data: Uint8Array, name: string }[]>}
 */
export function resolveFiles(options) {
  return Promise.all(pickFiles(options).map(resolveFile));
}

/**
 * A file on a received message — discord.js's `Attachment`. Built from one entry of the message's
 * `attachments` array (`{ id, url, type, filename, size }`).
 */
export class Attachment {
  /** @param {{ id?: string | null, url: string, type?: string | null, filename?: string | null, size?: number | null }} data */
  constructor(data) {
    /** The attachment's id; null on a message sent before attachments had ids. */
    this.id = data.id ?? null;
    this.url = data.url;
    /** Xive serves files from where they are stored, so this is `url`. */
    this.proxyURL = data.url;
    this.contentType = data.type ?? null;
    /** The filename, or the last part of the URL when the message has none. */
    this.name = data.filename ?? (String(data.url).split("?")[0].split("/").pop() || "file");
    /** Bytes, or null when unknown. */
    this.size = data.size ?? null;
    /** Xive has no spoiler files. */
    this.spoiler = false;
  }
}

/**
 * A message's `attachments` array (or, from an older server, its single `attachment`) as
 * `[key, Attachment]` pairs: keyed by id, or by position when the id is null.
 * @param {any} data message JSON
 * @returns {[string, Attachment][]}
 */
export function attachmentEntries(data) {
  const list = Array.isArray(data?.attachments)
    ? data.attachments
    : data?.attachment?.url ? [{ id: null, url: data.attachment.url, type: data.attachment.type ?? null }] : [];
  return list
    .filter((/** @type {any} */ a) => a && typeof a.url === "string")
    .map((/** @type {any} */ a, /** @type {number} */ i) => {
      const att = new Attachment(a);
      return /** @type {[string, Attachment]} */ ([att.id ?? String(i), att]);
    });
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
