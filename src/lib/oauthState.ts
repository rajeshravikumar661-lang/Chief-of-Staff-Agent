import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Signed OAuth `state` values for the M6 provider connect/callback flow.
 *
 * The value format is `state:<provider>:<nonce>`; the cookie stores
 * `<value>.<hmac>` where the HMAC is SHA-256 over the value keyed by
 * AUTH_SECRET. The authorize URL carries just `<value>`; the callback
 * recomputes the signature over the cookie and checks it matches, then
 * checks the query `state` equals the cookie value.
 */

/** Name of the short-lived, httpOnly cookie that carries the signed state. */
export const OAUTH_STATE_COOKIE = "oauth_state";

/** Lifetime of the state cookie, in seconds (10 minutes). */
export const OAUTH_STATE_TTL_SECONDS = 600;

function hmac(value: string): string {
  return crypto
    .createHmac("sha256", env.authSecret())
    .update(value)
    .digest("base64url");
}

/** Build a fresh unsigned state value for `provider`. */
export function makeStateValue(provider: string): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  return `state:${provider}:${nonce}`;
}

/** Produce the `<value>.<hmac>` string to store in the cookie. */
export function signState(value: string): string {
  return `${value}.${hmac(value)}`;
}

/**
 * Verify a cookie payload (`<value>.<hmac>`). Returns the bare value when the
 * signature is valid and the embedded provider matches, else `null`.
 */
export function verifyState(
  cookieValue: string | undefined | null,
  provider: string,
): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = cookieValue.slice(0, idx);
  const sig = cookieValue.slice(idx + 1);
  const expected = hmac(value);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  if (!value.startsWith(`state:${provider}:`)) return null;
  return value;
}
