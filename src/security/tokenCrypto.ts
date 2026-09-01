import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM envelope encryption for OAuth tokens at rest (spec §5, §9, §26).
 * Format: base64( iv[12] | authTag[16] | ciphertext ).
 * Plaintext tokens live in memory only for the duration of a single API call.
 */
const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = Buffer.from(env.tokenEncryptionKey(), "base64");
  if (k.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return k;
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptToken(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function encryptTokenOrNull(v: string | null | undefined): string | null {
  return v ? encryptToken(v) : null;
}
export function decryptTokenOrNull(v: string | null | undefined): string | null {
  return v ? decryptToken(v) : null;
}
