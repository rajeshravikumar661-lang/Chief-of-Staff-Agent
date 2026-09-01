import { describe, expect, it } from "vitest";
import { CANDIDATE_RE } from "@/agent/commitmentDetection";

// CANDIDATE_RE is a stateless (no /g) pre-filter, safe to reuse across cases.

describe("CANDIDATE_RE", () => {
  const hits = [
    "I'll send the pricing proposal tomorrow.",
    "I will get back to you by Friday.",
    "Let's schedule a call next week.",
    "I'm going to circle back on this.",
    "Can you send over the deck? I'll follow up after.",
    "I'll have it done by end of week.",
  ];
  const misses = [
    "Thanks for the update, looks great.",
    "The meeting is confirmed for 3pm.",
    "Here is the report you asked for.",
    "No changes needed on my end.",
  ];

  it.each(hits)("flags a commitment cue: %s", (s) => {
    expect(CANDIDATE_RE.test(s)).toBe(true);
  });

  it.each(misses)("ignores a non-commitment: %s", (s) => {
    expect(CANDIDATE_RE.test(s)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(CANDIDATE_RE.test("I WILL GET BACK TO YOU BY MONDAY")).toBe(true);
  });
});
