"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

/**
 * Only today's agenda is available (GET /api/today → .agenda) — there's no
 * events-listing endpoint yet, so this is a single-day "Today" view rather
 * than a full calendar with navigation.
 */
export default function CalendarPage() {
  const { data, isLoading } = useSWR("today-agenda", api.today);
  const agenda = data?.agenda ? [...data.agenda].sort((a, b) => a.time.localeCompare(b.time)) : undefined;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Calendar</h1>
        <p className="mt-1 text-sm text-ink-soft">Today's schedule.</p>
        <p className="mt-1 text-xs text-ink-faint">
          Only today's events are available in this milestone — a multi-day view is coming later.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-soft">Loading schedule…</p>}

      {agenda && agenda.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">Nothing on your calendar today.</p>
        </div>
      )}

      {agenda && agenda.length > 0 && (
        <ol className="relative border-l border-hairline pl-6">
          {agenda.map((item, i) => (
            <li key={item.eventId ?? `${item.time}-${i}`} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-brand" />
              <p className="text-xs font-medium text-ink-faint">{item.time}</p>
              <p className="mt-0.5 text-sm text-ink">{item.title}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
