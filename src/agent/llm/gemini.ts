import { env } from "@/lib/env";
import { estimateCost } from "./pricing";
import type { LLMProvider, LLMRequest, LLMResult } from "./provider";

/**
 * Google Gemini provider (AI Studio / Generative Language API). Dependency-free —
 * talks to the REST endpoint directly. Selected with `LLM_PROVIDER=gemini`;
 * key from `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`).
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private key(): string {
    const k = env.geminiApiKey();
    if (!k) {
      throw new Error("GEMINI_API_KEY is not set (LLM_PROVIDER=gemini)");
    }
    return k;
  }

  async complete(req: LLMRequest): Promise<LLMResult> {
    const model =
      req.tier === "cheap" ? env.cheapModel() : env.strongModel();

    const systemText = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
      .trim();

    const contents = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: req.maxTokens ?? 4096,
    };
    if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
    if (req.json) generationConfig.responseMimeType = "application/json";

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.key(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 500)}`);
    }

    const data = (await res.json()) as GeminiResponse;

    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      text,
      model,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: estimateCost(model, inputTokens, outputTokens),
      },
    };
  }
}
