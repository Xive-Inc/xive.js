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
   * @param {{ body?: unknown, query?: Record<string, string | number | undefined> }} [options]
   * @returns {Promise<any>} the response body, without `success`
   */
  async request(method, path, { body, query } = {}) {
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
      const res = await this.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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

  /** @param {string} path @param {unknown} [body] */
  post(path, body) {
    return this.request("POST", path, { body });
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
