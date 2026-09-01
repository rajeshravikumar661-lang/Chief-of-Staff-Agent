/**
 * LLM provider abstraction (spec §2, §28). Agent code NEVER imports the
 * Anthropic/OpenAI SDK directly — it goes through `getLLM()`.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ModelTier = "cheap" | "strong";

export interface LLMRequest {
  messages: LLMMessage[];
  tier?: ModelTier; // default "strong"
  maxTokens?: number;
  temperature?: number;
  /** When set, the provider is asked to return a single JSON object. */
  json?: boolean;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LLMResult {
  text: string;
  model: string;
  usage: LLMUsage;
}

export interface LLMProvider {
  name: string;
  complete(req: LLMRequest): Promise<LLMResult>;
}

/**
 * Convenience wrapper the agent uses. `json<T>()` parses and returns typed data
 * plus usage so the orchestrator can meter cost per run (spec §8).
 */
export interface LLM extends LLMProvider {
  json<T>(req: LLMRequest): Promise<{ data: T; usage: LLMUsage; model: string }>;
}

export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("LLM did not return valid JSON");
  }
}
