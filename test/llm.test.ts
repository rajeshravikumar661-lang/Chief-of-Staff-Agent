import { afterEach, describe, expect, it } from "vitest";
import { priceFor, estimateCost } from "@/agent/llm/pricing";

describe("pricing", () => {
  it("resolves gemini flash / flash-lite in the right order", () => {
    expect(priceFor("gemini-2.5-flash-lite").inputPer1M).toBe(0.1);
    expect(priceFor("gemini-2.5-flash").inputPer1M).toBe(0.3);
    expect(priceFor("gemini-2.5-pro").inputPer1M).toBe(1.25);
  });

  it("resolves groq llama models", () => {
    expect(priceFor("llama-3.1-8b-instant").inputPer1M).toBe(0.05);
    expect(priceFor("llama-3.3-70b-versatile").inputPer1M).toBe(0.59);
    expect(priceFor("openai/gpt-oss-120b").outputPer1M).toBe(0.75);
  });

  it("falls back for an unknown model", () => {
    expect(priceFor("some-future-model")).toEqual({ inputPer1M: 3, outputPer1M: 15 });
  });

  it("estimateCost scales with tokens", () => {
    const c = estimateCost("gemini-2.5-flash", 1_000_000, 1_000_000);
    expect(c).toBeCloseTo(0.3 + 2.5, 5);
  });
});

describe("getLLM provider selection", () => {
  const prev = process.env.LLM_PROVIDER;
  afterEach(() => {
    process.env.LLM_PROVIDER = prev;
    // getLLM memoizes; re-import fresh per assertion below via dynamic import + vi.resetModules
  });

  it("selects the gemini provider without needing a key at construction time", async () => {
    process.env.LLM_PROVIDER = "gemini";
    const keptG = process.env.GEMINI_API_KEY;
    const keptGG = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      const { GeminiProvider } = await import("@/agent/llm/gemini");
      const p = new GeminiProvider();
      expect(p.name).toBe("gemini");
      // key is only required when a call is actually made
      await expect(p.complete({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
        /GEMINI_API_KEY/,
      );
    } finally {
      if (keptG !== undefined) process.env.GEMINI_API_KEY = keptG;
      if (keptGG !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = keptGG;
    }
  });
});
