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
export interface OpenAICompatibleOptions {
  /** Provider label surfaced in run logs / metering. */
  name?: string;
  /** Override base URL for OpenAI-compatible gateways (e.g. Groq). */
  baseURL?: string;
  /** Key resolver + the env var name to cite when it is missing. */
  apiKey?: () => string;
  keyEnvName?: string;
}

/**
 * OpenAI implementation of {@link LLMProvider}, also used for any OpenAI-compatible
 * gateway (Groq) via {@link OpenAICompatibleOptions}. Agent code must reach this
 * only through `getLLM()` — never by importing the OpenAI SDK directly.
 */
export class OpenAIProvider implements LLMProvider {
  public readonly name: string;

  private client: OpenAI | undefined;
  private readonly baseURL?: string;
  private readonly resolveKey: () => string;
  private readonly keyEnvName: string;

  constructor(opts: OpenAICompatibleOptions = {}) {
    this.name = opts.name ?? "openai";
    this.baseURL = opts.baseURL;
    this.resolveKey = opts.apiKey ?? (() => env.openaiApiKey());
    this.keyEnvName = opts.keyEnvName ?? "OPENAI_API_KEY";
  }

  private sdk(): OpenAI {
    if (!this.client) {
      const apiKey = this.resolveKey();
      if (!apiKey) {
        throw new Error(
          `${this.keyEnvName} is not set — the ${this.name} LLM provider is unavailable.`,
        );
      }
      this.client = new OpenAI({ apiKey, ...(this.baseURL ? { baseURL: this.baseURL } : {}) });
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
