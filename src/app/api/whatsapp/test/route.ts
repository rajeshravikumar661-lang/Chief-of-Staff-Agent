import { ok, err, requireUser, isResponse } from "@/lib/http";
import { sendWhatsAppDigest } from "@/jobs/whatsappDigest";

export const dynamic = "force-dynamic";

/** POST /api/whatsapp/test — send today's digest to the signed-in user right now. */
export async function POST() {
  const u = await requireUser("whatsapp/test", { limit: 5, windowMs: 60_000 });
  if (isResponse(u)) return u;
  try {
    const r = await sendWhatsAppDigest(u.userId);
    if (!r.sent) return err("NOT_SENT", r.reason ?? "not sent", 400);
    return ok({ sent: true });
  } catch (e) {
    return err("SEND_FAILED", e instanceof Error ? e.message : "send failed", 502);
  }
}
