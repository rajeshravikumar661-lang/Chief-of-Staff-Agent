import type { Tool, ToolContext, ToolResult, VerificationResult } from "@/agent/tools/types";

/**
 * Verification step (spec §4 "Verification", hard rule #4).
 * After a WRITE/DESTRUCTIVE action we must re-check the source of truth before a
 * step may be marked `succeeded`. READ/DRAFT actions have no external side effect
 * and are considered verified by construction.
 */
export async function verifyStep(
  tool: Tool,
  input: unknown,
  result: ToolResult,
  ctx: ToolContext,
): Promise<VerificationResult> {
  if (typeof tool.verify === "function") {
    try {
      return await tool.verify(input, result, ctx);
    } catch (err) {
      return {
        verified: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (tool.permission === "READ" || tool.permission === "DRAFT") {
    return { verified: true, detail: "no external side effect" };
  }

  return { verified: false, detail: "no verification implemented" };
}
