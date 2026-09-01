import type { Permission, ToolContext, ToolResult, VerificationResult } from "@/agent/tools/types";
import { getTool } from "@/agent/tools/registry";
import { verifyStep } from "@/agent/verification";
import { logAction } from "@/security/auditLog";

/**
 * Action Manager (spec §4, §6, hard rule #1).
 * The ONLY code path allowed to run a tool. Permission is enforced here in code,
 * never in prompt text.
 */

/** WRITE and DESTRUCTIVE tools require an approved AgentStep before they run. */
export function needsApproval(permission: Permission): boolean {
  return permission === "WRITE" || permission === "DESTRUCTIVE";
}

/**
 * Look up, validate, execute and (for WRITE/DESTRUCTIVE) verify a single tool call.
 * Never throws for the common failure modes — returns a non-ok ToolResult instead
 * so the orchestrator can persist it as a failed step.
 */
export async function executeTool(
  toolName: string,
  args: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; verification: VerificationResult }> {
  const tool = getTool(toolName);
  if (!tool) {
    return {
      result: { ok: false, summary: "unknown tool " + toolName, error: "unknown_tool" },
      verification: { verified: false, detail: "n/a" },
    };
  }

  // Hard rule #3 — validate every model-generated argument before it touches a connector.
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return {
      result: {
        ok: false,
        summary: `invalid arguments for ${toolName}`,
        error: message,
      },
      verification: { verified: false, detail: "input validation failed" },
    };
  }

  let result: ToolResult;
  try {
    result = await tool.execute(parsed.data, ctx);
  } catch (err) {
    result = {
      ok: false,
      summary: `tool ${toolName} threw`,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const isWrite = tool.permission === "WRITE" || tool.permission === "DESTRUCTIVE";

  let verification: VerificationResult;
  if (isWrite && result.ok) {
    verification = await verifyStep(tool, parsed.data, result, ctx);
  } else if (result.ok) {
    verification = { verified: true, detail: "no verification required" };
  } else {
    verification = { verified: false, detail: "tool execution failed" };
  }

  // Hard rule #8 — audit every WRITE/DESTRUCTIVE action.
  if (isWrite) {
    await logAction({
      userId: ctx.userId,
      action: "tool.execute",
      tool: toolName,
      runId: ctx.runId,
      result: { ok: result.ok, verified: verification.verified },
    });
  }

  return { result, verification };
}
