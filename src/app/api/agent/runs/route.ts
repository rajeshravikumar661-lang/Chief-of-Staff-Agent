import { z } from "zod";
import { err, isResponse, ok, requireUser } from "@/lib/http";
import { listRunDTOs, startRun } from "@/agent/orchestrator";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  goal: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const u = await requireUser("agent/runs");
  if (isResponse(u)) return u;
  const { userId } = u;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const { runId } = await startRun(userId, parsed.data.goal);
  return ok({ runId }, { status: 201 });
}

export async function GET() {
  const u = await requireUser("agent/runs");
  if (isResponse(u)) return u;
  const { userId } = u;

  const runs = await listRunDTOs(userId);
  return ok(runs);
}
