import { isResponse, ok, requireUser } from "@/lib/http";
import { syncAll } from "@/jobs/sync";

export const dynamic = "force-dynamic";

// Manual sync trigger for dev/demo — the scheduled job is the real path.
export async function POST() {
  const u = await requireUser("sync", { limit: 10, windowMs: 60_000 });
  if (isResponse(u)) return u;
  const { userId } = u;

  const counts = await syncAll(userId);
  return ok(counts);
}
