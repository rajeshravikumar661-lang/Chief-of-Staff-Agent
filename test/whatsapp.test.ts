import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  SAFE_USER_ID,
  assertSafeUserId,
  normalizeNumber,
  toJid,
  jidToDigits,
  authDir,
} from "@/integrations/whatsapp/client";

/**
 * Unit tests for the pure helpers + the multi-tenant isolation guard.
 * No live sockets — Baileys is imported transitively but never dialed.
 */

describe("assertSafeUserId / SAFE_USER_ID", () => {
  it("accepts flat alphanumeric ids (with _ and -) and returns the id", () => {
    for (const id of ["abc123", "user_1", "a-b-c", "ULID01ARZ3NDEKTSV4RRFFQ69G5FAV", "x"]) {
      expect(assertSafeUserId(id)).toBe(id);
      expect(SAFE_USER_ID.test(id)).toBe(true);
    }
  });

  it("rejects path-traversal and separator characters", () => {
    for (const bad of [
      "..",
      ".",
      "../other",
      "../../etc/passwd",
      "a/b",
      "a\\b",
      "foo/../bar",
      "foo.bar",
      "with space",
      "tab\tid",
      "nul\0byte",
      "emoji😀",
      "semi;colon",
      "",
    ]) {
      expect(() => assertSafeUserId(bad)).toThrow(/invalid userId/);
      expect(SAFE_USER_ID.test(bad)).toBe(false);
    }
  });

  it("rejects non-strings and over-long ids", () => {
    // @ts-expect-error deliberate wrong type
    expect(() => assertSafeUserId(undefined)).toThrow();
    // @ts-expect-error deliberate wrong type
    expect(() => assertSafeUserId(123)).toThrow();
    expect(() => assertSafeUserId("a".repeat(129))).toThrow();
  });
});

describe("authDir (isolation guard)", () => {
  it("puts each user in their own subdirectory", () => {
    const a = authDir("userA");
    const b = authDir("userB");
    expect(a).not.toBe(b);
    expect(path.basename(a)).toBe("userA");
    expect(path.basename(b)).toBe("userB");
    // sibling dirs under a shared root
    expect(path.dirname(a)).toBe(path.dirname(b));
  });

  it("never escapes the auth root", () => {
    const root = path.dirname(authDir("anchor"));
    const resolved = path.resolve(authDir("userA"));
    expect(resolved.startsWith(path.resolve(root) + path.sep)).toBe(true);
  });

  it("throws on any traversal attempt instead of building an escaping path", () => {
    for (const bad of ["../victim", "..", "a/../../b", "/etc", "./x"]) {
      expect(() => authDir(bad)).toThrow(/invalid userId/);
    }
  });
});

describe("normalizeNumber", () => {
  it("strips spaces, punctuation, +, and leading zeros", () => {
    expect(normalizeNumber("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizeNumber("00447911123456")).toBe("447911123456");
    expect(normalizeNumber(" 49 30 1234 ")).toBe("49301234");
  });

  it("returns empty string for input with no digits", () => {
    expect(normalizeNumber("abc")).toBe("");
    expect(normalizeNumber("")).toBe("");
    // @ts-expect-error deliberate wrong type
    expect(normalizeNumber(null)).toBe("");
  });
});

describe("toJid", () => {
  it("builds a user JID from a raw number", () => {
    expect(toJid("+1 415 555 0100")).toBe("14155550100@s.whatsapp.net");
    expect(toJid("447911123456")).toBe("447911123456@s.whatsapp.net");
  });

  it("passes an existing JID through and drops the device suffix", () => {
    expect(toJid("14155550100@s.whatsapp.net")).toBe("14155550100@s.whatsapp.net");
    expect(toJid("14155550100:6@s.whatsapp.net")).toBe("14155550100@s.whatsapp.net");
    expect(toJid("12345@g.us")).toBe("12345@g.us");
  });

  it("throws on empty or non-numeric input", () => {
    expect(() => toJid("")).toThrow();
    expect(() => toJid("   ")).toThrow();
    expect(() => toJid("not-a-number")).toThrow(/valid WhatsApp number/);
  });
});

describe("jidToDigits", () => {
  it("extracts digits from a JID", () => {
    expect(jidToDigits("14155550100@s.whatsapp.net")).toBe("14155550100");
    expect(jidToDigits("14155550100:2@s.whatsapp.net")).toBe("14155550100");
  });

  it("returns null when there is nothing to extract", () => {
    expect(jidToDigits(null)).toBeNull();
    expect(jidToDigits(undefined)).toBeNull();
    expect(jidToDigits("")).toBeNull();
    expect(jidToDigits("@s.whatsapp.net")).toBeNull();
  });

  it("round-trips with toJid", () => {
    expect(jidToDigits(toJid("+1 415 555 0100"))).toBe("14155550100");
  });
});
