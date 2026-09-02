/**
 * WhatsApp event reminders — sends a day-before (T-24h) and an hour-before
 * (T-1h) nudge for each of a user's upcoming calendar events. Runs on the
 * worker every ~10 minutes; the 26h look-ahead means a single tick after a
 * reminder moment still catches it. Idempotent via the EventReminder table so
 * a reminder is never sent twice, even across restarts or overlapping ticks.
 */
import { Prisma, type CalendarEvent } from "@prisma/client";

import { prisma, scopedDb } from "@/lib/db";
import { normalizeTz, formatDay, formatTime } from "@/lib/tz";
import { isWhatsAppEnabled, isLinked, sendToUser } from "@/integrations/whatsapp/client";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const HOUR_MS = 60 * 60 * 1000;
/** endTime - startTime at or above this reads as an all-day event. */
const ALL_DAY_MS = 23 * HOUR_MS;

type ReminderKind = "day_before" | "hour_before";
const KINDS: readonly ReminderKind[] = ["day_before", "hour_before"];

/** Compose the WhatsApp text for one reminder (plain text, *bold* via asterisks). */
function buildText(kind: ReminderKind, e: CalendarEvent, title: string, tz: string): string {
  const time = formatTime(e.startTime, tz);
  let text: string;
  if (kind === "day_before") {
    const n = Array.isArray(e.attendees) ? (e.attendees as unknown[]).length : 0;
    // Attendee clause is dropped entirely when there's nobody else on the invite.
    const who = n > 0 ? ` ${n} attendee${n === 1 ? "" : "s"}.` : "";
    text = `📅 Tomorrow: *${title}* at ${time} (${formatDay(e.startTime, tz)}).${who}`;
  } else {
    text = `⏰ In ~1 hour: *${title}* at ${time}.`;
  }
  if (e.location) text += `\nLocation: ${e.location}`;
  if (e.conferenceUrl) text += `\nJoin: ${e.conferenceUrl}`;
  return text;
}

/** Was this exact reminder already recorded as sent? */
async function alreadySent(userId: string, eventId: string, kind: ReminderKind): Promise<boolean> {
  const row = await prisma.eventReminder.findUnique({
    where: { userId_eventId_kind: { userId, eventId, kind } },
  });
  return row !== null;
}

/** Send day-before (T-24h) and hour-before (T-1h) WhatsApp reminders for a user's
 *  upcoming calendar events. Idempotent via the EventReminder table. Returns the
 *  number of reminders sent. Never throws. */
export async function runEventReminders(userId: string): Promise<number> {
  if (!isWhatsAppEnabled()) return 0;
  if (!(await isLinked(userId))) return 0;

  let sent = 0;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = normalizeTz(user?.timezone);

    const db = scopedDb(userId);
    const now = new Date();

    // Next ~26h so both a T-24h and a T-1h window are catchable on a ~10-min tick.
    const events = await db.calendarEvent.findMany({
      where: { startTime: { gte: now, lte: new Date(now.getTime() + 26 * HOUR_MS) } },
      orderBy: { startTime: "asc" },
    });

    for (const e of events) {
      const title = e.title?.trim();
      if (!title) continue;

      // One bad event must not stop the rest.
      try {
        const allDay = e.endTime.getTime() - e.startTime.getTime() >= ALL_DAY_MS;

        for (const kind of KINDS) {
          // hour_before makes no sense for an all-day block; day_before is fine.
          if (kind === "hour_before" && allDay) continue;

          const offsetMs = kind === "day_before" ? 24 * HOUR_MS : HOUR_MS;
          const reminderAt = new Date(e.startTime.getTime() - offsetMs);
          // Fire on the first tick past the reminder moment, but only while the
          // event is still in the future.
          if (now < reminderAt || now >= e.startTime) continue;

          if (await alreadySent(userId, e.id, kind)) continue;

          await sendToUser(userId, buildText(kind, e, title, tz));

          try {
            await prisma.eventReminder.create({ data: { userId, eventId: e.id, kind } });
            sent++;
          } catch (err) {
            // A concurrent tick recorded the same reminder first — the send is
            // already out, so swallow the unique-constraint race and don't count it.
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
              console.warn(`[jobs/eventReminders] race on ${e.id}/${kind} for ${userId} — not counted`);
            } else {
              throw err;
            }
          }
        }
      } catch (err) {
        console.error(`[jobs/eventReminders] event ${e.id} for ${userId} failed: ${errMsg(err)}`);
      }
    }
  } catch (err) {
    // Contract: never throws — a DB blip or bad user just yields the count so far.
    console.error(`[jobs/eventReminders] run for ${userId} failed: ${errMsg(err)}`);
  }

  return sent;
}

/** Run runEventReminders for every user with WhatsApp linked. Never throws. */
export async function runEventRemindersAllUsers(): Promise<void> {
  if (!isWhatsAppEnabled()) {
    console.info("[jobs/eventReminders] WHATSAPP_ENABLED != true — skipping");
    return;
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  let total = 0;
  for (const { id } of users) {
    try {
      total += await runEventReminders(id);
    } catch (err) {
      console.error(`[jobs/eventReminders] user ${id} failed: ${errMsg(err)}`);
    }
  }
  console.info(`[jobs/eventReminders] sent ${total} reminder(s) across ${users.length} user(s)`);
}
