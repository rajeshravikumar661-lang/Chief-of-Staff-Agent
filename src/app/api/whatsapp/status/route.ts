import QRCode from "qrcode";
import { ok, requireUser, isResponse } from "@/lib/http";
import { getState, isLinked, isWhatsAppEnabled } from "@/integrations/whatsapp/client";

export const dynamic = "force-dynamic";

/** GET /api/whatsapp/status — current pairing state + QR (when one is pending). */
export async function GET() {
  const u = await requireUser("whatsapp/status");
  if (isResponse(u)) return u;

  const s = getState(u.userId);
  const qrDataUrl = s.qr ? await QRCode.toDataURL(s.qr, { margin: 1, width: 260 }) : null;

  return ok({
    enabled: isWhatsAppEnabled(),
    linked: isLinked(u.userId),
    status: s.status, // unpaired | qr | connecting | connected
    number: s.number ?? null,
    qrDataUrl,
  });
}
