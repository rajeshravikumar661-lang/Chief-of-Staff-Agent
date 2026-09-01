import { scopedDb } from "@/lib/db";
import { listEvents } from "./client";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pull the user's calendar events from -7d to +30d and upsert them into the
 * `CalendarEvent` table (spec §7). Per-item failures are logged and skipped so
 * one bad event can't abort the whole sync. Returns the number of events
 * successfully upserted.
 */
export async function syncCalendar(userId: string): Promise<number> {
  const now = Date.now();
  const timeMin = new Date(now - 7 * DAY_MS).toISOString();
  const timeMax = new Date(now + 30 * DAY_MS).toISOString();

  const events = await listEvents(userId, { timeMin, timeMax, max: 2500 });
  const db = scopedDb(userId);

  let count = 0;
  for (const e of events) {
    if (!e.id || !e.start || !e.end) continue;
    const startTime = new Date(e.start);
    const endTime = new Date(e.end);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      continue;
    }
    try {
      await db.calendarEvent.upsert({
        where: { userId_externalId: { userId, externalId: e.id } },
        create: {
          userId,
          externalId: e.id,
          title: e.title,
          startTime,
          endTime,
          attendees: e.attendees,
          location: e.location,
          conferenceUrl: e.conferenceUrl,
        },
        update: {
          title: e.title,
          startTime,
          endTime,
          attendees: e.attendees,
          location: e.location,
          conferenceUrl: e.conferenceUrl,
        },
      });
      count += 1;
    } catch (err) {
      console.error("[calendar/sync] skipping event", e.id, err);
    }
  }

  try {
    await db.connection.updateMany({
      where: { provider: "calendar" },
      data: { lastSyncAt: new Date() },
    });
  } catch (err) {
    console.error("[calendar/sync] failed to update lastSyncAt", err);
  }

  return count;
}
