"use client";

import Link from "next/link";
import { cn } from "@/lib/ui";

function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (m.getDay() + 6) % 7; // 0 = Monday
  m.setDate(m.getDate() - dow);
  return m;
}

/**
 * Horizontal 7-day strip (mobile only — see Today page). Today is the only
 * day with real data here, so it's the only one rendered as "active"; the
 * other six are real navigation into the full calendar (Planner), not dead
 * decoration.
 */
export function DateStrip() {
  const today = new Date();
  const monday = mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="flex justify-between gap-1.5">
      {days.map((d) => {
        const isToday = d.toDateString() === today.toDateString();
        return (
          <Link
            key={d.toISOString()}
            href="/planner/calendar"
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "group flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs transition",
              isToday ? "bg-focus text-white shadow-sm" : "text-ink-soft hover:bg-surface",
            )}
          >
            <span
              className={cn(
                "uppercase tracking-wide",
                isToday ? "text-white/70" : "text-ink-faint group-hover:text-surface-ink-faint",
              )}
            >
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                isToday ? "text-white" : "text-ink group-hover:text-surface-ink",
              )}
            >
              {d.getDate()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
