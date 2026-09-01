import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

import { estimateCost } from "./pricing";
import type {
  LLMProvider,
  LLMRequest,
  LLMResult,
  ModelTier,
} from "./provider";

const JSON_SYSTEM_INSTRUCTION =
  "You must respond with a single raw JSON object and nothing else. " +
  "Do not wrap it in markdown, code fences, or prose. Emit only the object.";

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Claude implementation of {@link LLMProvider}. Agent code must reach this only
 * through `getLLM()` — never by importing the Anthropic SDK directly.
 */
export class ClaudeProvider implements LLMProvider {
  public readonly name = "claude";

  private client: Anthropic | undefined;

  private sdk(): Anthropic {
    if (!this.client) {
      const apiKey = env.anthropicApiKey();
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set — the Claude LLM provider is unavailable.",
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  private modelFor(tier: ModelTier): string {
    return tier === "cheap" ? env.cheapModel() : env.strongModel();
  }

  public async complete(req: LLMRequest): Promise<LLMResult> {
    const tier: ModelTier = req.tier ?? "strong";
    const model = this.modelFor(tier);

    // Anthropic keeps system prompts out of the message list. Pull every
    // system-role message (typically a single leading one) into `system`.
    const systemParts: string[] = [];
    const messages: Anthropic.MessageParam[] = [];
    for (const m of req.messages) {
      if (m.role === "system") {
        systemParts.push(m.content);
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    if (req.json) systemParts.push(JSON_SYSTEM_INSTRUCTION);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
    };
    if (systemParts.length > 0) params.system = systemParts.join("\n\n");

    // Prefer a low temperature for JSON, but only forward `temperature` when it
    // is actually provided: current Claude models reject an explicit
    // temperature and return a 400. JSON reliability therefore rests on the
    // system instruction above plus defensive parsing by the caller.
    const temperature = req.temperature ?? (req.json ? 0 : undefined);
    if (typeof temperature === "number") params.temperature = temperature;

    const res = await this.sdk().messages.create(params);

    const text = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;
    const resolvedModel = res.model || model;

    return {
      text,
      model: resolvedModel,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: estimateCost(resolvedModel, inputTokens, outputTokens),
      },
    };
  }
}
