import { isResponse, ok, requireUser } from "@/lib/http";
import { prisma, scopedDb } from "@/lib/db";
import { normalizeTz } from "@/lib/tz";
import type { CalendarEventDTO, CalendarEventsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 90 * DAY_MS;
const MAX_EVENTS = 500;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function isMidnightUtc(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function isAllDay(start: Date, end: Date, attendees: string[]): boolean {
  const span = end.getTime() - start.getTime();
  const spansWholeUtcDay = span > 0 && span % DAY_MS === 0;
  if (spansWholeUtcDay && attendees.length === 0) return true;
  return isMidnightUtc(start) && isMidnightUtc(end);
}

export async function GET(request: Request) {
  const u = await requireUser("calendar-events");
  if (isResponse(u)) return u;
  const { userId } = u;

  const params = new URL(request.url).searchParams;
  const now = new Date();

  let from = parseDate(params.get("from")) ?? new Date(now.getTime() - 7 * DAY_MS);
  let to = parseDate(params.get("to")) ?? new Date(now.getTime() + 30 * DAY_MS);

  if (to.getTime() < from.getTime()) {
    [from, to] = [to, from];
  }
  // Cap the requested window to 90 days.
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    to = new Date(from.getTime() + MAX_RANGE_MS);
  }

  const db = scopedDb(userId);
  const [rows, user] = await Promise.all([
    db.calendarEvent.findMany({
      where: { startTime: { gte: from, lte: to } },
      orderBy: { startTime: "asc" },
      take: MAX_EVENTS,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);

  const events: CalendarEventDTO[] = rows.map((e) => {
    const attendees = toStringArray(e.attendees);
    return {
      id: e.id,
      externalId: e.externalId,
      title: e.title ?? "(untitled)",
      start: e.startTime.toISOString(),
      end: e.endTime.toISOString(),
      allDay: isAllDay(e.startTime, e.endTime, attendees),
      attendees,
      location: e.location ?? null,
      conferenceUrl: e.conferenceUrl ?? null,
    };
  });

  const body: CalendarEventsResponse = {
    timezone: normalizeTz(user?.timezone),
    events,
  };
  return ok(body);
}
