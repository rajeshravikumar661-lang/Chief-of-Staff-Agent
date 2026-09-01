import { err, isResponse, ok, requireUser } from "@/lib/http";
import { scopedDb } from "@/lib/db";
import { logAction } from "@/security/auditLog";
import { isKnownProvider } from "@/app/api/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const u = await requireUser("connections/disconnect");
  if (isResponse(u)) return u;
  const { userId } = u;

  const { provider } = await params;
  if (!isKnownProvider(provider)) {
    return err("BAD_REQUEST", `Unknown provider: ${provider}`, 400);
  }

  const db = scopedDb(userId);
  // deleteMany is user-scoped by scopedDb; google-family rows are per-provider
  // so a single provider can be disconnected without touching the others.
  const { count } = await db.connection.deleteMany({ where: { provider } });

  await logAction({
    userId,
    action: "connection.disconnect",
    result: { provider, removed: count },
  });

  return ok({ disconnected: true });
}
