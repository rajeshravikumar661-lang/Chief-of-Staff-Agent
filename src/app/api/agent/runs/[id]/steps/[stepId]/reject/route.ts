import { isResponse, ok, requireUser } from "@/lib/http";
import { decideStep } from "@/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const u = await requireUser("agent/runs/steps/reject");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id, stepId } = await params;
  const run = await decideStep(userId, id, stepId, "reject");
  return ok(run);
}
