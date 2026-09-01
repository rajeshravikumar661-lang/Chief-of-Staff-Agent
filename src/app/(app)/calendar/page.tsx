"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { cn } from "@/lib/ui";
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

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

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

  const days = useMemo(() => {
    const list: { label: string; key: string; events: CalendarEventDTO[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      d.setHours(12, 0, 0, 0);
      list.push({
        key: ymd(d, tz),
        label: new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: tz,
        }).format(d),
        events: [],
      });
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

  function shiftWeek(weeks: number) {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + weeks * 7);
      return d;
    });
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink-soft">Your week at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper-raised"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper-raised"
          >
            This week
          </button>
          <button
            onClick={() => shiftWeek(1)}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper-raised"
          >
            Next →
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-faint">Times shown in {tz}</p>

      {isLoading && <p className="text-sm text-ink-faint">Loading events…</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((day) => (
            <div key={day.key} className="rounded-lg border border-hairline bg-paper-raised p-3">
              <p className="text-xs font-semibold text-ink-soft">{day.label}</p>
              <ul className="mt-2 space-y-2">
                {day.events.length === 0 && <li className="text-xs text-ink-faint">—</li>}
                {day.events.map((ev) => (
                  <li key={ev.id} className="rounded-md border border-hairline bg-paper p-2">
                    {ev.allDay ? (
                      <span className="inline-block rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-ink">
                        all day
                      </span>
                    ) : (
                      <p className="text-[11px] font-medium tabular-nums text-ink-faint">
                        {fmtTime.format(new Date(ev.start))}–{fmtTime.format(new Date(ev.end))}
                      </p>
                    )}
                    <p className={cn("text-xs text-ink", ev.allDay ? "mt-1" : "mt-0.5")}>{ev.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!isLoading && (data?.events?.length ?? 0) === 0 && (
        <p className="text-sm text-ink-faint">Nothing scheduled this week.</p>
      )}
    </div>
  );
}
