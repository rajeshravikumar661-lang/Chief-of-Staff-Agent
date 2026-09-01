import type { ZodType } from "zod";
import type { LLM } from "@/agent/llm/provider";

export type Permission = "READ" | "DRAFT" | "WRITE" | "DESTRUCTIVE";

export interface ToolContext {
  userId: string;
  runId?: string;
  llm: LLM;
}

export interface ToolResult {
  ok: boolean;
  /** Structured payload for the reasoning step / UI. */
  data?: unknown;
  /** One-line human summary shown in the run timeline. */
  summary: string;
  error?: string;
}

export interface VerificationResult {
  verified: boolean;
  detail: string;
}

export interface Tool<I = unknown> {
  name: string; // "gmail.send"
  description: string;
  inputSchema: ZodType<I>;
  permission: Permission;
  execute: (input: I, ctx: ToolContext) => Promise<ToolResult>;
  /** Required for WRITE/DESTRUCTIVE tools — re-checks the external source of truth. */
  verify?: (input: I, result: ToolResult, ctx: ToolContext) => Promise<VerificationResult>;
}

/**
 * Authoring helper: keeps full input typing inside the definition, but returns
 * the erased `Tool` so connectors can collect them into `Tool[]` without casts
 * (`Tool<I>` is invariant in `I` under strictFunctionTypes).
 */
export function defineTool<I>(t: Tool<I>): Tool {
  return t as Tool;
}
