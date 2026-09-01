/**
 * Push the daily digest to WhatsApp for every user who has linked their number
 * from the dashboard. Composition of the tuned briefing pipeline + the per-user
 * WhatsApp channel — runs on the worker (or any persistent server), not Vercel.
 */
import { endOfDay, startOfDay } from "date-fns";
import { prisma, scopedDb } from "@/lib/db";
import { normalizeTz } from "@/lib/tz";
import { generateBriefing } from "@/jobs/morningBriefing";
import { formatDigest } from "@/integrations/whatsapp/format";
import { isWhatsAppEnabled, isLinked, sendToUser } from "@/integrations/whatsapp/client";

export async function sendWhatsAppDigest(userId: string): Promise<{ sent: boolean; reason?: string }> {
  if (!isWhatsAppEnabled()) return { sent: false, reason: "WHATSAPP_ENABLED != true" };
  if (!isLinked(userId)) return { sent: false, reason: "WhatsApp not linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, timezone: true },
  });
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
    name: user?.name ?? null,
    date: now,
    timezone: normalizeTz(user?.timezone),
    agenda: events.map((e) => ({
      start: e.startTime,
      title: e.title ?? "(untitled)",
      attendees: Array.isArray(e.attendees) ? (e.attendees as unknown[]).length : 0,
    })),
    items: briefing.items,
  });

  await sendToUser(userId, text);
  return { sent: true };
}

export async function sendWhatsAppDigestAllUsers(): Promise<void> {
  if (!isWhatsAppEnabled()) {
    console.info("[jobs/whatsappDigest] WHATSAPP_ENABLED != true — skipping");
    return;
  }
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of users) {
    if (!isLinked(id)) continue;
    try {
      const r = await sendWhatsAppDigest(id);
      console.info(`[jobs/whatsappDigest] user ${id}: ${r.sent ? "sent" : `skipped (${r.reason})`}`);
    } catch (err) {
      console.error(`[jobs/whatsappDigest] user ${id} failed:`, err);
    }
  }
}
