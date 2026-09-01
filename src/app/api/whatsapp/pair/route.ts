import QRCode from "qrcode";
import { ok, err, requireUser, isResponse } from "@/lib/http";
import { startPairing, isWhatsAppEnabled } from "@/integrations/whatsapp/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/pair — begin linking this user's WhatsApp.
 * Returns as soon as a QR is ready (or the session is already connected).
 * The client then polls GET /api/whatsapp/status until status === "connected".
 */
export async function POST() {
  const u = await requireUser("whatsapp/pair", { limit: 10, windowMs: 60_000 });
  if (isResponse(u)) return u;
  if (!isWhatsAppEnabled()) {
    return err("DISABLED", "WhatsApp is not enabled on this server (WHATSAPP_ENABLED)", 400);
  }

  try {
    const { status, qr } = await startPairing(u.userId);
    const qrDataUrl = qr ? await QRCode.toDataURL(qr, { margin: 1, width: 260 }) : null;
    return ok({ status, qrDataUrl });
  } catch (e) {
    console.error("[whatsapp/pair] failed", e);
    return err("PAIR_FAILED", e instanceof Error ? e.message : "could not start pairing", 502);
  }
}
