import { createHmac, timingSafeEqual } from "node:crypto";

/** How far a delivery's timestamp may be from now before it is treated as a replay. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Check a delivery's signature.
 *
 * Xive signs `eventId + timestamp + rawBody` with HMAC-SHA256 under the subscription's secret and
 * sends `Xive-Signature: sha256=<hex>`. The body MUST be the raw bytes received — re-serialising
 * parsed JSON changes them and the check fails.
 *
 * @param {{
 *   secret: string,
 *   eventId: string | undefined,
 *   timestamp: string | undefined,
 *   signature: string | undefined,
 *   body: string | Buffer,
 *   toleranceSeconds?: number,
 *   now?: number,
 * }} input
 * @returns {boolean}
 */
export function verifySignature({
  secret,
  eventId,
  timestamp,
  signature,
  body,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Date.now(),
}) {
  if (!secret || !eventId || !timestamp || !signature) return false;

  const sent = Date.parse(timestamp);
  if (Number.isNaN(sent) || Math.abs(now - sent) > toleranceSeconds * 1000) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(eventId + timestamp)
      .update(body)
      .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
