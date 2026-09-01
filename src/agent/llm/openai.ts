import OpenAI from "openai";

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
 * OpenAI implementation of {@link LLMProvider}. Agent code must reach this only
 * through `getLLM()` — never by importing the OpenAI SDK directly.
 */
export class OpenAIProvider implements LLMProvider {
  public readonly name = "openai";

  private client: OpenAI | undefined;

  private sdk(): OpenAI {
    if (!this.client) {
      const apiKey = env.openaiApiKey();
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set — the OpenAI LLM provider is unavailable.",
        );
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  private modelFor(tier: ModelTier): string {
    return tier === "cheap" ? env.cheapModel() : env.strongModel();
  }

  public async complete(req: LLMRequest): Promise<LLMResult> {
    const tier: ModelTier = req.tier ?? "strong";
    const model = this.modelFor(tier);

    // OpenAI accepts system-role messages inline, so pass the list through.
    // `LLMMessage.role` is a strict subset of OpenAI's role union with an
    // identical `{ role, content: string }` shape.
    const messages: OpenAI.ChatCompletionMessageParam[] = req.messages.map(
      (m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam,
    );
    if (req.json) {
      messages.unshift({ role: "system", content: JSON_SYSTEM_INSTRUCTION });
    }

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    const temperature = req.temperature ?? (req.json ? 0 : undefined);
    if (typeof temperature === "number") params.temperature = temperature;
    if (req.json) params.response_format = { type: "json_object" };

    const res = await this.sdk().chat.completions.create(params);

    const text = res.choices[0]?.message?.content ?? "";
    const inputTokens = res.usage?.prompt_tokens ?? 0;
    const outputTokens = res.usage?.completion_tokens ?? 0;
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
