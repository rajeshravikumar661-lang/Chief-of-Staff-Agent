import { ok, err, requireUser, isResponse } from "@/lib/http";
import { unlink } from "@/integrations/whatsapp/client";
import { logAction } from "@/security/auditLog";

export const dynamic = "force-dynamic";

/** POST /api/whatsapp/unlink — log out and forget this user's WhatsApp session. */
export async function POST() {
  const u = await requireUser("whatsapp/unlink", { limit: 20, windowMs: 60_000 });
  if (isResponse(u)) return u;
  try {
    await unlink(u.userId);
    await logAction({ userId: u.userId, action: "whatsapp.unlink" });
    return ok({ ok: true });
  } catch (e) {
    console.error("[whatsapp/unlink] failed", e);
    return err("UNLINK_FAILED", e instanceof Error ? e.message : "could not unlink", 500);
  }
}
