import { isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = await requireUser("audit-logs");
  if (isResponse(u)) return u;
  const { userId } = u;

  const runId = new URL(request.url).searchParams.get("runId")?.trim() || undefined;

  const db = scopedDb(userId);
  const rows = await db.auditLog.findMany({
    where: runId ? { runId } : {},
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  const logs = rows.map((r) => ({
    id: r.id,
    action: r.action,
    tool: r.tool ?? null,
    runId: r.runId ?? null,
    stepId: r.stepId ?? null,
    result: r.result ?? null,
    timestamp: r.timestamp.toISOString(),
  }));

  return ok(logs);
}
