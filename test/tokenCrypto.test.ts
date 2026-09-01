import { describe, expect, it } from "vitest";
import {
  encryptToken,
  decryptToken,
  encryptTokenOrNull,
  decryptTokenOrNull,
} from "@/security/tokenCrypto";

describe("tokenCrypto", () => {
  it("round-trips a token", () => {
    const secret = "ya29.a0Af" + "x".repeat(120);
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptToken("same-value");
    const b = encryptToken("same-value");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it("rejects a tampered payload (GCM auth tag)", () => {
    const enc = encryptToken("integrity-protected");
    const raw = Buffer.from(enc, "base64");
    raw[raw.length - 1] ^= 0x01;
    expect(() => decryptToken(raw.toString("base64"))).toThrow();
  });

  it("null helpers pass null through", () => {
    expect(encryptTokenOrNull(null)).toBeNull();
    expect(encryptTokenOrNull(undefined)).toBeNull();
    expect(decryptTokenOrNull(null)).toBeNull();
    const e = encryptTokenOrNull("v");
    expect(e).toBeTypeOf("string");
    expect(decryptTokenOrNull(e)).toBe("v");
  });
});
