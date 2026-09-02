import QRCode from "qrcode";
import { ok, err, requireUser, isResponse } from "@/lib/http";
import { getState, isLinked, isWhatsAppEnabled } from "@/integrations/whatsapp/client";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/status — current pairing state + QR (when one is pending). */
export async function GET() {
  const u = await requireUser("whatsapp/status", { limit: 60, windowMs: 60_000 });
  if (isResponse(u)) return u;

  try {
    const [s, linked] = await Promise.all([getState(u.userId), isLinked(u.userId)]);
    const qrDataUrl = s.qr ? await QRCode.toDataURL(s.qr, { margin: 1, width: 260 }) : null;

    return ok({
      enabled: isWhatsAppEnabled(),
      linked,
      status: s.status, // unpaired | qr | connecting | connected
      number: s.number ?? null,
      qrDataUrl,
    });
  } catch (e) {
    console.error("[whatsapp/status] failed", e);
    return err("STATUS_FAILED", e instanceof Error ? e.message : "could not read status", 500);
  }
}
