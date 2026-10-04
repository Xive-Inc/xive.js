import { XiveAPIError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://api.thexive.com";

const MAX_RATE_LIMIT_RETRIES = 5;

/**
 * The HTTP layer: the application's Bearer secret on every call, the `{success, error}` envelope
 * unwrapped, and a 429 waited out for its `Retry-After` rather than surfaced.
 */
export class REST {
  /**
   * @param {{ token: string, baseURL?: string, fetch?: typeof fetch }} options
   */
  constructor({ token, baseURL = DEFAULT_BASE_URL, fetch: fetchImpl = globalThis.fetch }) {
    if (!token) throw new TypeError("xive.js: an application secret (token) is required");
    this.token = token;
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.fetch = fetchImpl;
  }

  /**
   * @param {string} method
   * @param {string} path  e.g. `/hubs/my-hub/app/channels`
   * @param {{ body?: unknown, query?: Record<string, string | number | undefined>, files?: { data: Uint8Array, name: string }[] | null, file?: { data: Uint8Array, name: string } | null }} [options]
   *   Non-empty `files` sends multipart/form-data: the body as `payload_json`, the files as
   *   `files[0]`…`files[9]` in order — Discord's shape, which the API takes on message sends,
   *   replies and follow-ups. `file` (one file) is still taken, as `files: [file]`.
   * @returns {Promise<any>} the response body, without `success`
   */
  async request(method, path, { body, query, files = null, file = null } = {}) {
    if (!files?.length && file) files = [file];
    const multipart = Array.isArray(files) && files.length > 0;
    let url = this.baseURL + path;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    for (let attempt = 0; ; attempt++) {
      /** @type {any} */
      let payload = body !== undefined ? JSON.stringify(body) : undefined;
      if (multipart) {
        // Rebuilt per attempt: a FormData body is consumed by the request that sends it.
        payload = new FormData();
        payload.append("payload_json", JSON.stringify(body ?? {}));
        files.forEach((f, i) => payload.append(`files[${i}]`, new Blob([f.data]), f.name));
      }
      const res = await this.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          // Multipart sets its own Content-Type, boundary included.
          ...(body !== undefined && !multipart ? { "Content-Type": "application/json" } : {}),
        },
        body: payload,
      });

      if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const wait = Number(res.headers.get("Retry-After")) || 1;
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      const text = await res.text();
      /** @type {any} */
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { success: false, error: { type: "SystemError", message: text.slice(0, 200) } };
      }
      if (!res.ok || json.success === false) {
        throw new XiveAPIError(json.error ?? {}, res.status, method, path);
      }
      delete json.success;
      return json;
    }
  }

  /** @param {string} path @param {Record<string, string | number | undefined>} [query] */
  get(path, query) {
    return this.request("GET", path, { query });
  }

  /**
   * @param {string} path @param {unknown} [body]
   * @param {{ data: Uint8Array, name: string }[] | { data: Uint8Array, name: string } | null} [files]
   *   up to 10 files (a single file is taken too), sent as multipart
   */
  post(path, body, files = null) {
    return this.request("POST", path, { body, files: files && !Array.isArray(files) ? [files] : files });
  }

  /** @param {string} path @param {unknown} [body] */
  put(path, body) {
    return this.request("PUT", path, { body });
  }

  /** @param {string} path @param {unknown} [body] */
  patch(path, body) {
    return this.request("PATCH", path, { body });
  }

  /** @param {string} path @param {unknown} [body] */
  delete(path, body) {
    return this.request("DELETE", path, { body });
  }
}

/** Path-segment encoding, so a hub slug or id can never escape its segment. */
export const enc = encodeURIComponent;
