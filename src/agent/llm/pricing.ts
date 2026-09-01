/**
 * Rough USD list pricing per 1M tokens, keyed by a substring of the model id.
 * Used only for cost metering and run-cap enforcement (spec §7, §8) — the
 * numbers are approximate and intentionally cheap to maintain.
 */

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

/** Checked in order; the first substring contained in the model id wins. */
const TABLE: ReadonlyArray<readonly [string, ModelPrice]> = [
  ["claude-haiku", { inputPer1M: 1, outputPer1M: 5 }],
  ["claude-sonnet", { inputPer1M: 3, outputPer1M: 15 }],
  ["claude-opus", { inputPer1M: 5, outputPer1M: 25 }],
  // gpt-4o-mini must precede gpt-4o ("gpt-4o" is a substring of "gpt-4o-mini").
  ["gpt-4o-mini", { inputPer1M: 0.15, outputPer1M: 0.6 }],
  ["gpt-4o", { inputPer1M: 2.5, outputPer1M: 10 }],
  // gemini — flash-lite must precede flash.
  ["gemini-2.5-flash-lite", { inputPer1M: 0.1, outputPer1M: 0.4 }],
  ["gemini-2.0-flash-lite", { inputPer1M: 0.075, outputPer1M: 0.3 }],
  ["flash", { inputPer1M: 0.3, outputPer1M: 2.5 }],
  ["gemini-2.5-pro", { inputPer1M: 1.25, outputPer1M: 10 }],
  // groq (OpenAI-compatible) — more specific ids first.
  ["llama-3.1-8b", { inputPer1M: 0.05, outputPer1M: 0.08 }],
  ["llama-3.3-70b", { inputPer1M: 0.59, outputPer1M: 0.79 }],
  ["llama-4-scout", { inputPer1M: 0.11, outputPer1M: 0.34 }],
  ["llama-4-maverick", { inputPer1M: 0.2, outputPer1M: 0.6 }],
  ["gpt-oss-120b", { inputPer1M: 0.15, outputPer1M: 0.75 }],
  ["gpt-oss-20b", { inputPer1M: 0.1, outputPer1M: 0.5 }],
  ["kimi-k2", { inputPer1M: 1, outputPer1M: 3 }],
  ["llama", { inputPer1M: 0.2, outputPer1M: 0.4 }],
];

/** Fallback when the model id matches nothing in the table. */
export const DEFAULT_PRICE: ModelPrice = { inputPer1M: 3, outputPer1M: 15 };

export function priceFor(model: string): ModelPrice {
  const id = model.toLowerCase();
  for (const [needle, price] of TABLE) {
    if (id.includes(needle)) return price;
  }
  return DEFAULT_PRICE;
}

/** Estimated USD cost for a completed call. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = priceFor(model);
  const cost =
    (Math.max(0, inputTokens) / 1_000_000) * price.inputPer1M +
    (Math.max(0, outputTokens) / 1_000_000) * price.outputPer1M;
  return Number(cost.toFixed(6));
}
