import { ok, requireUser, isResponse } from "@/lib/http";
import { unlink } from "@/integrations/whatsapp/client";
import { logAction } from "@/security/auditLog";

export const dynamic = "force-dynamic";

/** POST /api/whatsapp/unlink — log out and forget this user's WhatsApp session. */
export async function POST() {
  const u = await requireUser("whatsapp/unlink");
  if (isResponse(u)) return u;
  await unlink(u.userId);
  await logAction({ userId: u.userId, action: "whatsapp.unlink" });
  return ok({ ok: true });
}
