/**
 * Push the daily digest to WhatsApp for every user who has linked their number
 * from the dashboard. Composition of the tuned briefing pipeline + the per-user
 * WhatsApp channel — runs on the worker (or any persistent server), not Vercel.
 */
import { endOfDay, startOfDay } from "date-fns";
import { prisma, scopedDb } from "@/lib/db";
import { normalizeTz, formatDay, formatTime } from "@/lib/tz";
import { generateBriefing } from "@/jobs/morningBriefing";
import { formatDigest } from "@/integrations/whatsapp/format";
import { isWhatsAppEnabled, isLinked, sendToUser } from "@/integrations/whatsapp/client";

export async function sendWhatsAppDigest(userId: string): Promise<{ sent: boolean; reason?: string }> {
  if (!isWhatsAppEnabled()) return { sent: false, reason: "WHATSAPP_ENABLED != true" };
  if (!(await isLinked(userId))) return { sent: false, reason: "WhatsApp not linked" };

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

  const tz = normalizeTz(user?.timezone);
  const firstName = user?.name ? user.name.split(/\s+/)[0] : null;

  let text: string;
  if (briefing.items.length === 0 && events.length === 0) {
    // Nothing ranked and nothing on the calendar — don't ship an empty-looking
    // digest. Fall back to a one-line status (unread count + next few events) so
    // the message still earns its open, and nudge the user to reply: the
    // self-chat is now a two-way "Ask Kora" surface.
    const [unread, upcoming] = await Promise.all([
      db.message.count({ where: { unread: true } }),
      db.calendarEvent.findMany({
        where: { startTime: { gte: now } },
        orderBy: { startTime: "asc" },
        take: 3,
      }),
    ]);
    const hi = firstName ? `, ${firstName}` : "";
    const parts = [
      `Good morning${hi}. Nothing scheduled today.`,
      `You have ${unread} unread message${unread === 1 ? "" : "s"}.`,
    ];
    if (upcoming.length) {
      const next = upcoming
        .map((e) => `${e.title ?? "(untitled)"} on ${formatDay(e.startTime, tz)} at ${formatTime(e.startTime, tz)}`)
        .join(", ");
      parts.push(`Next up: ${next}.`);
    }
    parts.push("Reply here to ask me anything — about your inbox, calendar, docs or people.");
    text = parts.join(" ");
  } else {
    text = formatDigest({
      name: user?.name ?? null,
      date: now,
      timezone: tz,
      agenda: events.map((e) => ({
        start: e.startTime,
        title: e.title ?? "(untitled)",
        attendees: Array.isArray(e.attendees) ? (e.attendees as unknown[]).length : 0,
      })),
      items: briefing.items,
    });
  }

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
    if (!(await isLinked(id))) continue;
    try {
      const r = await sendWhatsAppDigest(id);
      console.info(`[jobs/whatsappDigest] user ${id}: ${r.sent ? "sent" : `skipped (${r.reason})`}`);
    } catch (err) {
      console.error(`[jobs/whatsappDigest] user ${id} failed:`, err);
    }
  }
}
