import { err, isResponse, ok, requireUser } from "@/lib/http";
import { getRunDTO } from "@/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("agent/runs/detail");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { id } = await params;
  const run = await getRunDTO(userId, id);
  if (!run) return err("NOT_FOUND", "Run not found", 404);

  return ok(run);
}
