"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { nowHHMM } from "@/lib/agenda";
import { AgentRunCard } from "@/components/AgentRunCard";
import { KoraSummary } from "@/components/KoraSummary";
import { DateStrip } from "@/components/DateStrip";
import { FocusNowCard } from "@/components/FocusNowCard";
import { AttentionList } from "@/components/AttentionList";
import { AgendaTimeline } from "@/components/AgendaTimeline";
import { SectionHeader } from "@/components/SectionHeader";
import { CircleIcon } from "@/components/Icons";
import type { TodayResponse } from "@/lib/types";

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
      <div className="rounded-2xl border border-dashed border-hairline p-8 text-center">
        <p className="text-sm text-ink">Couldn&apos;t load your day.</p>
        <p className="mt-1 text-sm text-ink-faint">{todayError instanceof Error ? todayError.message : "Something went wrong."}</p>
        <button
          onClick={() => mutateToday()}
          className="mt-3 rounded-md border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper-raised"
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
  const nextEvent = [...agenda].sort((a, b) => a.time.localeCompare(b.time)).find((e) => e.time >= now);

  return (
    <div className="pb-16">
      {/* 1. Date label, greeting, one concise daily briefing */}
      <KoraSummary greeting={today?.greeting ?? "Good morning"} summary={buildDaySummary(today)} loading={todayLoading} />

      {/* 2. Horizontal 7-day date selector — mobile only, per design direction */}
      <div className="mt-5 lg:hidden">
        <DateStrip />
      </div>

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-10">
        {/* Main column: Focus Now + agenda timeline */}
        <div className="space-y-8">
          {/* 3. Focus Now card */}
          <FocusNowCard
            event={nextEvent}
            attention={attention}
            suggestedActions={suggestedActions}
            onRunAction={runSuggestedAction}
            loading={todayLoading}
          />

          {/* 4. Agenda timeline */}
          <section id="agenda-timeline">
            <SectionHeader title="Today's agenda" />
            <AgendaTimeline agenda={agenda} attention={attention} loading={todayLoading} />
          </section>
        </div>

        {/* Right column on desktop; stacks below the agenda on mobile */}
        <div className="mt-8 space-y-8 lg:mt-0">
          {/* 5. Needs your decision (compact) */}
          <section>
            <SectionHeader title="Needs your decision" count={attention.length} tone="warm" />
            <AttentionList items={attention} loading={todayLoading} />
          </section>

          <section>
            <SectionHeader title="Follow-ups" count={followUps.length} />
            {todayLoading ? (
              <div className="h-12 animate-pulse rounded-2xl border border-hairline bg-paper-raised" />
            ) : followUps.length === 0 ? (
              <p className="text-sm text-ink-faint">No open follow-ups — you&apos;re all caught up.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-paper-raised px-3 py-2.5 text-sm text-ink shadow-sm"
                  >
                    <CircleIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    {item.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader title="Suggested actions" />
            {todayLoading ? (
              <div className="h-8 animate-pulse rounded-md border border-hairline bg-paper-raised" />
            ) : suggestedActions.length === 0 ? (
              <p className="text-sm text-ink-faint">No suggestions right now.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestedActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => runSuggestedAction(action.goal)}
                    disabled={!action.goal}
                    className="rounded-full border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper-raised disabled:opacity-50"
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

          {/* Recent agent activity — secondary, low visual weight */}
          {recentRuns.length > 0 && (
            <section className="border-t border-hairline pt-6 opacity-90">
              <SectionHeader title="Agent activity" />
              <div className="space-y-2">
                {recentRuns.map((r) => (
                  <AgentRunCard key={r.id} runId={r.id} collapsedByDefault linkToDetail />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
