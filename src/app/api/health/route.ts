import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

// Liveness probe — no auth.
export async function GET() {
  return ok({ status: "ok" });
}
