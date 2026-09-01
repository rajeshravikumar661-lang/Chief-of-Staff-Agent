import { env } from "@/lib/env";

import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";
import {
  extractJson,
  type LLM,
  type LLMProvider,
  type LLMRequest,
} from "./provider";

export * from "./provider";
export { ClaudeProvider } from "./claude";
export { OpenAIProvider } from "./openai";
export { estimateCost, priceFor, DEFAULT_PRICE } from "./pricing";
export type { ModelPrice } from "./pricing";

let singleton: LLM | undefined;

function makeProvider(): LLMProvider {
  return env.llmProvider() === "openai"
    ? new OpenAIProvider()
    : new ClaudeProvider();
}

/**
 * The single entry point agent code uses to talk to an LLM. Picks the provider
 * from `LLM_PROVIDER`, wraps it with a typed `json<T>()` helper, and memoizes
 * the result so every caller shares one client.
 */
export function getLLM(): LLM {
  if (singleton) return singleton;

  const provider = makeProvider();

  singleton = {
    name: provider.name,
    complete: (req: LLMRequest) => provider.complete(req),
    async json<T>(req: LLMRequest) {
      const result = await provider.complete({ ...req, json: true });
      const data = extractJson(result.text) as T;
      return { data, usage: result.usage, model: result.model };
    },
  };

  return singleton;
}
