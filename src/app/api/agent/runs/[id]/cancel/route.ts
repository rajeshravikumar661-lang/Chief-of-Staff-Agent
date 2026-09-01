import { isResponse, ok, requireUser } from "@/lib/http";
import { cancelRun } from "@/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await requireUser("agent/runs/cancel");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id } = await params;
  await cancelRun(userId, id);
  return ok({ cancelled: true });
}
