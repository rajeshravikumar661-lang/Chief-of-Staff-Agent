import type { LLM, LLMRequest, LLMResult, LLMUsage } from "./provider";

/**
 * Wraps an LLM so every call's cost is reported to `onSpend`. The orchestrator
 * uses this to meter a whole run (planner + retriever + tools + synthesis all
 * receive the same wrapped instance) and enforce AGENT_MAX_COST_USD (spec §8).
 */
export function meteredLLM(base: LLM, onSpend: (usd: number, usage: LLMUsage) => void): LLM {
  const report = (usage: LLMUsage | undefined) => {
    if (usage && Number.isFinite(usage.costUsd)) onSpend(usage.costUsd, usage);
  };
  return {
    name: `metered(${base.name})`,
    async complete(req: LLMRequest): Promise<LLMResult> {
      const r = await base.complete(req);
      report(r.usage);
      return r;
    },
    async json<T>(req: LLMRequest) {
      const r = await base.json<T>(req);
      report(r.usage);
      return r;
    },
  };
}
