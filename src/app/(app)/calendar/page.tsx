"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { cn } from "@/lib/ui";
import { formatCountdown } from "@/lib/agenda";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/Icons";
import type { CalendarEventDTO } from "@/lib/types";

/** Monday 00:00 (local) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (m.getDay() + 6) % 7; // 0 = Monday
  m.setDate(m.getDate() - dow);
  return m;
}

function ymd(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(d);
}

type DayBucket = { key: string; date: Date; events: CalendarEventDTO[] };

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const from = weekStart.toISOString();
  const to = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }, [weekStart]);

  const { data, isLoading } = useSWR(["calendar", from, to], () => api.calendarEvents(from, to));
  const tz = data?.timezone ?? "UTC";

  const fmtTime = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      }),
    [tz],
  );
  const fmtWeekday = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }),
    [tz],
  );
  const fmtDay = useMemo(() => new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: tz }), [tz]);
  const fmtFullDay = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }),
    [tz],
  );

  const days: DayBucket[] = useMemo(() => {
    const list: DayBucket[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      d.setHours(12, 0, 0, 0);
      list.push({ key: ymd(d, tz), date: d, events: [] });
    }
    for (const ev of data?.events ?? []) {
      const bucket = list.find((x) => x.key === ymd(new Date(ev.start), tz));
      if (bucket) bucket.events.push(ev);
    }
    for (const day of list) {
      day.events.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.localeCompare(b.start);
      });
    }
    return list;
  }, [data, weekStart, tz]);

  const todayKey = ymd(new Date(), tz);

  // Keep the selected day valid as the visible week changes — default to
  // today if it's in this week, otherwise the first day of the week.
  useEffect(() => {
    if (days.length === 0) return;
    if (selectedKey && days.some((d) => d.key === selectedKey)) return;
    const todays = days.find((d) => d.key === todayKey);
    setSelectedKey((todays ?? days[0]).key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const selectedDay = days.find((d) => d.key === selectedKey) ?? days[0];

  function shiftWeek(weeks: number) {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + weeks * 7);
      return d;
    });
  }

  function daySummary(events: CalendarEventDTO[]): string {
    if (events.length === 0) return "Quiet";
    const meetings = events.filter((e) => !e.allDay).length;
    const holds = events.length - meetings;
    const parts: string[] = [];
    if (meetings > 0) parts.push(`${meetings} meeting${meetings === 1 ? "" : "s"}`);
    if (holds > 0) parts.push(`${holds} hold${holds === 1 ? "" : "s"}`);
    return parts.join(" · ") || "Quiet";
  }

  // FOCUS NOW — only meaningful when today is in the visible week: the next
  // event (today's events, chronological) whose start hasn't passed yet.
  const now = new Date();
  const todayBucket = days.find((d) => d.key === todayKey);
  const nextEvent = todayBucket?.events
    .filter((e) => !e.allDay)
    .find((e) => new Date(e.end).getTime() > now.getTime());
  const nextEventMinutes = nextEvent ? Math.round((new Date(nextEvent.start).getTime() - now.getTime()) / 60000) : 0;

  // THIS WEEK stats — honest, directly derivable from the fetched events.
  const weekEvents = data?.events ?? [];
  const timedEvents = weekEvents.filter((e) => !e.allDay);
  const totalMinutes = timedEvents.reduce(
    (sum, e) => sum + Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000),
    0,
  );
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  return (
    <div className="space-y-8 pb-16">
      {/* Header — on the dark canvas, no card. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink-soft">Your week at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="flex items-center gap-1 rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-ink/10"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
            Prev
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-ink/10"
          >
            This week
          </button>
          <button
            onClick={() => shiftWeek(1)}
            className="flex items-center gap-1 rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-ink/10"
          >
            Next
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {tz && <p className="-mt-4 text-xs text-ink-faint">Times shown in {tz}.</p>}

      {isLoading && <p className="text-sm text-ink-faint">Loading events…</p>}

      {!isLoading && (
        <>
          {/* 7-day week strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {days.map((day) => {
              const isSelected = day.key === selectedDay?.key;
              const isToday = day.key === todayKey;
              return (
                <button
                  key={day.key}
                  onClick={() => setSelectedKey(day.key)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left shadow-card transition",
                    isSelected
                      ? "border-accent bg-accent text-white"
                      : "border-surface-hairline bg-surface text-surface-ink hover:bg-surface-raised",
                  )}
                >
                  <p
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      isSelected ? "text-white/75" : "text-surface-ink-faint",
                    )}
                  >
                    {fmtWeekday.format(day.date)}
                  </p>
                  <p className={cn("mt-1 font-serif text-xl font-semibold tabular-nums", isSelected ? "text-white" : "text-surface-ink")}>
                    {fmtDay.format(day.date)}
                    {isToday && (
                      <span
                        className={cn(
                          "ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle",
                          isSelected ? "bg-white" : "bg-accent",
                        )}
                        aria-hidden
                      />
                    )}
                  </p>
                  <p className={cn("mt-1 text-xs", isSelected ? "text-white/85" : "text-surface-ink-soft")}>
                    {daySummary(day.events)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* FOCUS NOW + THIS WEEK stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {nextEvent && (
              <div className="card-paper p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-ink-faint">Focus now</p>
                <p className="mt-2 font-serif text-lg font-semibold text-surface-ink">{nextEvent.title}</p>
                <p className="mt-1 text-sm text-surface-ink-soft">
                  {fmtTime.format(new Date(nextEvent.start))}–{fmtTime.format(new Date(nextEvent.end))} ·{" "}
                  {formatCountdown(nextEventMinutes)}
                </p>
              </div>
            )}

            <div className="card-paper p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-ink-faint">This week</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-surface-ink-soft">Meetings</span>
                  <span className="font-serif text-base font-semibold tabular-nums text-surface-ink">
                    {timedEvents.length}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-surface-ink-soft">Scheduled hours</span>
                  <span className="font-serif text-base font-semibold tabular-nums text-surface-ink">
                    {totalHours}h
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink">{fmtFullDay.format(selectedDay.date)}</h2>
              <p className="mt-1 text-sm text-ink-soft">{daySummaryLong(selectedDay.events)}</p>

              {selectedDay.events.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-hairline p-8 text-center">
                  <p className="text-sm text-ink-soft">Nothing scheduled this day.</p>
                </div>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {selectedDay.events.map((ev) => (
                    <li key={ev.id} className="card-paper flex items-start gap-4 p-4">
                      <div className="w-24 shrink-0">
                        {ev.allDay ? (
                          <span className="inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                            All day
                          </span>
                        ) : (
                          <p className="text-xs font-medium tabular-nums text-surface-ink-faint">
                            {fmtTime.format(new Date(ev.start))}
                            <br />
                            {fmtTime.format(new Date(ev.end))}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-surface-ink">{ev.title}</p>
                        <p className="mt-0.5 truncate text-xs text-surface-ink-soft">
                          {[
                            ev.location,
                            ev.attendees.length > 0
                              ? `${ev.attendees.length} attendee${ev.attendees.length === 1 ? "" : "s"}`
                              : null,
                            !ev.allDay ? durationLabel(ev) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No further details"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {!isLoading && weekEvents.length === 0 && <p className="text-sm text-ink-faint">Nothing scheduled this week.</p>}
    </div>
  );
}

function daySummaryLong(events: CalendarEventDTO[]): string {
  if (events.length === 0) return "Nothing on the books.";
  const meetings = events.filter((e) => !e.allDay).length;
  const holds = events.length - meetings;
  const parts: string[] = [];
  if (meetings > 0) parts.push(`${meetings} meeting${meetings === 1 ? "" : "s"}`);
  if (holds > 0) parts.push(`${holds} hold${holds === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function durationLabel(ev: CalendarEventDTO): string {
  const minutes = Math.max(0, Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
