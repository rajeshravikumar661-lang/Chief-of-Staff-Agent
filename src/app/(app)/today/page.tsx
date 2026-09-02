"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { nowHHMM } from "@/lib/agenda";
import { AgentRunCard } from "@/components/AgentRunCard";
import { DateStrip } from "@/components/DateStrip";
import { AgendaTimeline } from "@/components/AgendaTimeline";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/ui";
import type { NeedsAttentionItem, TodayResponse } from "@/lib/types";

function buildDaySummary(today: TodayResponse | undefined): string {
  if (!today) return "";

  const meetingCount = today.agenda.length;
  const criticalCount = today.needsAttention.filter((a) => a.priority === "CRITICAL").length;
  const attentionCount = today.needsAttention.length;
  const commitmentCount = today.followUps.length;

  const parts: string[] = [];

  if (meetingCount > 0) {
    const next = [...today.agenda].sort((a, b) => a.time.localeCompare(b.time))[0];
    parts.push(`you have ${meetingCount} meeting${meetingCount === 1 ? "" : "s"} today, starting with ${next.title} at ${next.time}`);
  } else {
    parts.push("your calendar is clear today");
  }

  if (criticalCount > 0) {
    parts.push(`${criticalCount} item${criticalCount === 1 ? " needs" : "s need"} a decision`);
  } else if (attentionCount > 0) {
    parts.push("a few things could use a look");
  }

  if (commitmentCount > 0) {
    parts.push(`${commitmentCount} commitment${commitmentCount === 1 ? "" : "s"} coming due`);
  }

  const sentence = parts.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

const WEEKDAY = new Date().toLocaleDateString(undefined, { weekday: "long" }).toLowerCase();

/** A pinned reminder — a tilted sticky note with a strip of tape. */
function StickyNote({ item, alt }: { item: NeedsAttentionItem; alt?: boolean }) {
  return (
    <div className={cn("sticky-note w-[170px] text-[15px] leading-snug", alt && "sticky-note--alt")}>
      <span className="sticky-note__tape" aria-hidden />
      {item.text}
    </div>
  );
}

export default function TodayPage() {
  const { data: today, error: todayError, isLoading: todayLoading, mutate: mutateToday } = useSWR("today", api.today);
  const [startedRunIds, setStartedRunIds] = useState<string[]>([]);

  async function runSuggestedAction(goal: string | undefined) {
    if (!goal) return;
    const { runId } = await api.createRun(goal);
    setStartedRunIds((prev) => [runId, ...prev]);
    mutateToday();
  }

  if (todayError) {
    return (
      <div className="card-paper p-8 text-center">
        <p className="text-sm text-ink">Couldn&apos;t load your day.</p>
        <p className="mt-1 text-sm text-ink-faint">{todayError instanceof Error ? todayError.message : "Something went wrong."}</p>
        <button
          onClick={() => mutateToday()}
          className="mt-3 rounded border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper-raised"
        >
          Try again
        </button>
      </div>
    );
  }

  const agenda = today?.agenda ?? [];
  const attention = today?.needsAttention ?? [];
  const followUps = today?.followUps ?? [];
  const suggestedActions = today?.suggestedActions ?? [];
  const recentRuns = today?.recentRuns ?? [];

  const now = nowHHMM();
  const sortedAgenda = [...agenda].sort((a, b) => a.time.localeCompare(b.time));
  const nextEvent = sortedAgenda.find((e) => e.time >= now) ?? sortedAgenda[0];

  // Pinned notes = the loud items (critical/high), max 3. The rest become letters.
  const pinned = attention.filter((a) => a.priority === "CRITICAL" || a.priority === "HIGH").slice(0, 3);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const criticalCount = attention.filter((a) => a.priority === "CRITICAL").length;

  const letters: { id: string; label: string; text: string; refUrl?: string; seal?: boolean }[] = [
    ...attention
      .filter((a) => !pinnedIds.has(a.id))
      .map((a) => ({ id: a.id, label: a.priority === "CRITICAL" ? "NEEDS A DECISION" : "TO LOOK AT", text: a.text, refUrl: a.refUrl, seal: a.priority === "CRITICAL" })),
    ...followUps.map((f) => ({ id: f.id, label: "FOLLOW-UP", text: f.text })),
  ];

  return (
    <div className="pb-4">
      {/* Header — "your desk, {weekday}" + the one-line brief */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="hand text-[2rem] font-bold leading-none text-ink sm:text-[2.4rem]">
          {todayLoading ? (
            <span className="inline-block h-8 w-56 animate-pulse rounded bg-paper-raised/60" />
          ) : (
            <>your desk, {WEEKDAY}</>
          )}
        </h1>
        <span className="mono-label !text-ink-soft">
          {criticalCount > 0 ? `${criticalCount} sealed urgent · ` : ""}
          {pinned.length} pinned
        </span>
      </div>
      {!todayLoading && (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{buildDaySummary(today)}</p>
      )}

      {/* Mobile-only 7-day strip */}
      <div className="mt-4 lg:hidden">
        <DateStrip />
      </div>

      {/* Row: pinned notes + the ROLODEX "next up" card */}
      <div className="mt-6 flex flex-wrap items-start gap-6">
        {pinned.length > 0 && (
          <div className="flex flex-wrap items-start gap-4 pt-2">
            {pinned.map((item, i) => (
              <StickyNote key={item.id} item={item} alt={i % 2 === 1} />
            ))}
          </div>
        )}

        <div className="card-paper w-[260px] max-w-full px-[18px] py-4">
          <p className="mono-label">Rolodex · Next up</p>
          {nextEvent ? (
            <>
              <p className="mt-2 font-serif text-base font-semibold text-ink">{nextEvent.title}</p>
              <p className="mt-1 font-serif text-[12.5px] text-ink-soft">{nextEvent.time}</p>
            </>
          ) : (
            <p className="mt-2 font-serif text-[13px] text-ink-soft">Nothing else on the calendar today.</p>
          )}
        </div>
      </div>

      {/* IN-TRAY — the letters */}
      <div className="in-tray mt-6">
        <p className="mono-label mb-2.5">
          In-tray — {letters.length} letter{letters.length === 1 ? "" : "s"}
        </p>
        {todayLoading ? (
          <div className="grid gap-3.5 pb-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="letter-card h-16 animate-pulse" />
            ))}
          </div>
        ) : letters.length === 0 ? (
          <p className="pb-3.5 font-serif text-[13px] text-[color:var(--color-band-ink)]/80">
            In-tray is empty — nothing waiting on you.
          </p>
        ) : (
          <div className="grid gap-3.5 pb-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {letters.map((l, i) => {
              const body = (
                <div className="letter-card h-full">
                  {l.seal && i === 0 && <span className="wax-seal" aria-hidden />}
                  <p className="mono-label !text-[9.5px]">{l.label}</p>
                  <p className="mt-1.5 pr-6 font-serif text-[13.5px] font-semibold leading-snug text-ink">{l.text}</p>
                </div>
              );
              return l.refUrl ? (
                <a key={l.id} href={l.refUrl} target="_blank" rel="noreferrer" className="block">
                  {body}
                </a>
              ) : (
                <div key={l.id}>{body}</div>
              );
            })}
          </div>
        )}
      </div>

      {/* Today's agenda */}
      <section id="agenda-timeline" className="mt-8">
        <SectionHeader title="Today's agenda" />
        <AgendaTimeline agenda={agenda} attention={attention} loading={todayLoading} />
      </section>

      {/* Suggested actions */}
      <section className="mt-8">
        <SectionHeader title="Suggested actions" />
        {todayLoading ? (
          <div className="h-8 animate-pulse rounded border border-hairline bg-paper-raised" />
        ) : suggestedActions.length === 0 ? (
          <p className="font-serif text-sm text-ink-faint">No suggestions right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suggestedActions.map((action) => (
              <button
                key={action.id}
                onClick={() => runSuggestedAction(action.goal)}
                disabled={!action.goal}
                className="card-paper px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {startedRunIds.length > 0 && (
          <div className="mt-3 space-y-2">
            {startedRunIds.map((id) => (
              <AgentRunCard key={id} runId={id} collapsedByDefault />
            ))}
          </div>
        )}
      </section>

      {/* Recent agent activity */}
      {recentRuns.length > 0 && (
        <section className="mt-8 border-t border-hairline-strong/60 pt-6">
          <SectionHeader title="Agent activity" />
          <div className="space-y-2">
            {recentRuns.map((r) => (
              <AgentRunCard key={r.id} runId={r.id} collapsedByDefault linkToDetail />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
