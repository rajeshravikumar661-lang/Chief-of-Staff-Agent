import { prisma } from "@/lib/db";

/**
 * Single choke point for the audit trail (spec §9, §12, §26).
 * Call for every WRITE/DESTRUCTIVE action and every approve/reject decision.
 */
export async function logAction(input: {
  userId: string;
  action: string; // e.g. "tool.execute" | "step.approve" | "step.reject" | "connection.disconnect"
  tool?: string | null;
  runId?: string | null;
  stepId?: string | null;
  result?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        tool: input.tool ?? null,
        runId: input.runId ?? null,
        stepId: input.stepId ?? null,
        result: (input.result ?? null) as object,
      },
    });
  } catch (err) {
    // Never let audit failure abort the primary action; surface to logs.
    console.error("[auditLog] failed to write entry", err);
  }
}
