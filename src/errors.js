/**
 * A refusal from the Xive API, carrying the envelope's `error.type` and `error.code` — the fields
 * the API asks clients to branch on, rather than the HTTP status.
 */
export class XiveAPIError extends Error {
  /**
   * @param {{ type?: string, code?: string, message?: string, requestId?: string }} error
   * @param {number} status
   * @param {string} method
   * @param {string} path
   */
  constructor(error, status, method, path) {
    super(`${error.message ?? "Request failed"} (${method} ${path} → ${status})`);
    this.name = "XiveAPIError";
    this.type = error.type ?? "SystemError";
    this.code = error.code ?? null;
    this.status = status;
    this.requestId = error.requestId ?? null;
    this.method = method;
    this.path = path;
  }
}

/**
 * Something Xive does not do — thrown at the call, by name, so a bot ported from elsewhere fails at
 * the line that needs changing rather than quietly doing nothing.
 */
export class XiveUnsupportedError extends Error {
  /** @param {string} feature @param {string} [hint] */
  constructor(feature, hint) {
    super(`${feature} is not supported on Xive${hint ? ` — ${hint}` : ""}.`);
    this.name = "XiveUnsupportedError";
    this.feature = feature;
  }
}
