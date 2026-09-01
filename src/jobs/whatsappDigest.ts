/**
 * Push the daily digest to WhatsApp for every user who has linked a number
 * (`User.whatsappJid`). Composition of the tuned briefing pipeline + the
 * WhatsApp channel — runs on the worker, not on Vercel.
 */
import { endOfDay, startOfDay } from "date-fns";
import { prisma, scopedDb } from "@/lib/db";
import { generateBriefing } from "@/jobs/morningBriefing";
import { formatDigest } from "@/integrations/whatsapp/format";
import { isWhatsAppEnabled, sendText } from "@/integrations/whatsapp/client";

export async function sendWhatsAppDigest(userId: string): Promise<{ sent: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, whatsappJid: true },
  });
  if (!user?.whatsappJid) return { sent: false, reason: "no whatsappJid" };
  if (!isWhatsAppEnabled()) return { sent: false, reason: "WHATSAPP_ENABLED != true" };

  const db = scopedDb(userId);
  const now = new Date();

  const [briefing, events] = await Promise.all([
    generateBriefing(userId),
    db.calendarEvent.findMany({
      where: { startTime: { gte: startOfDay(now), lte: endOfDay(now) } },
      orderBy: { startTime: "asc" },
      take: 12,
    }),
  ]);

  const text = formatDigest({
    name: user.name,
    date: now,
    agenda: events.map((e) => ({
      start: e.startTime,
      title: e.title ?? "(untitled)",
      attendees: Array.isArray(e.attendees) ? (e.attendees as unknown[]).length : 0,
    })),
    items: briefing.items,
  });

  await sendText(user.whatsappJid, text);
  return { sent: true };
}

export async function sendWhatsAppDigestAllUsers(): Promise<void> {
  if (!isWhatsAppEnabled()) {
    console.info("[jobs/whatsappDigest] WHATSAPP_ENABLED != true — skipping");
    return;
  }
  const users = await prisma.user.findMany({
    where: { whatsappJid: { not: null } },
    select: { id: true },
  });
  for (const { id } of users) {
    try {
      const r = await sendWhatsAppDigest(id);
      console.info(`[jobs/whatsappDigest] user ${id}: ${r.sent ? "sent" : `skipped (${r.reason})`}`);
    } catch (err) {
      console.error(`[jobs/whatsappDigest] user ${id} failed:`, err);
    }
  }
}
