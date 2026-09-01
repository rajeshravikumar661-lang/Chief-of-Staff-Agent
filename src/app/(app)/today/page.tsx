"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { AgentRunCard } from "@/components/AgentRunCard";
import { ChiefOfStaffSummary } from "@/components/ChiefOfStaffSummary";
import { AttentionList } from "@/components/AttentionList";
import { AgendaTimeline } from "@/components/AgendaTimeline";
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
      <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
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

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Chief-of-Staff Summary */}
      <ChiefOfStaffSummary
        greeting={today?.greeting ?? "Good morning"}
        summary={buildDaySummary(today)}
        stats={{ meetings: agenda.length, attention: attention.length, commitments: followUps.length }}
        loading={todayLoading}
      />

      {/* 2. Needs Your Decision */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Needs your decision</h2>
        <AttentionList items={attention} loading={todayLoading} />
      </section>

      {/* 3 & 4. Agenda (main) + Follow-ups / Suggested actions (side on desktop) */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Today&apos;s agenda</h2>
          <AgendaTimeline agenda={agenda} attention={attention} loading={todayLoading} />
        </section>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Follow-ups</h2>
            {todayLoading ? (
              <div className="h-12 animate-pulse rounded-lg border border-hairline bg-paper-raised" />
            ) : followUps.length === 0 ? (
              <p className="text-sm text-ink-faint">No open follow-ups — you&apos;re all caught up.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((item) => (
                  <li key={item.id} className="rounded-lg border border-hairline bg-paper-raised p-3 text-sm text-ink">
                    {item.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Suggested actions</h2>
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
                    className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper-raised disabled:opacity-50"
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
        </div>
      </div>

      {/* 5. Recent agent activity — secondary, low visual weight */}
      {recentRuns.length > 0 && (
        <section className="border-t border-hairline pt-6 opacity-90">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Recent agent activity</h2>
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
