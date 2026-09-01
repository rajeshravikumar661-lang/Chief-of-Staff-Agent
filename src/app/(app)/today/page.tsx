"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { BriefingView } from "@/components/BriefingView";
import { AgentRunCard } from "@/components/AgentRunCard";
import { PriorityBadge } from "@/components/PriorityBadge";
import type { Priority } from "@/lib/types";

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export default function TodayPage() {
  const { data: today, isLoading: todayLoading, mutate: mutateToday } = useSWR("today", api.today);
  const { data: briefing, isLoading: briefingLoading, mutate: mutateBriefing } = useSWR("briefing-today", api.briefingToday);
  const [refreshing, setRefreshing] = useState(false);
  const [startedRunIds, setStartedRunIds] = useState<string[]>([]);

  async function refreshBriefing() {
    setRefreshing(true);
    try {
      await api.briefingGenerate();
      await mutateBriefing();
    } finally {
      setRefreshing(false);
    }
  }

  async function runSuggestedAction(goal: string | undefined) {
    if (!goal) return;
    const { runId } = await api.createRun(goal);
    setStartedRunIds((prev) => [runId, ...prev]);
    mutateToday();
  }

  const sortedAgenda = today?.agenda ? [...today.agenda].sort((a, b) => a.time.localeCompare(b.time)) : [];
  const sortedAttention = today?.needsAttention
    ? [...today.needsAttention].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    : [];

  return (
    <div className="space-y-10 pb-16">
      {/* Greeting */}
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">
          {todayLoading ? "Good morning" : today?.greeting ?? "Good morning"}
        </h1>
      </div>

      {/* Briefing */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-faint">Briefing</h2>
          <button
            onClick={refreshBriefing}
            disabled={refreshing}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper-raised disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {briefingLoading && <p className="text-sm text-ink-faint">Preparing your briefing…</p>}
        {briefing && (
          <BriefingView briefing={briefing} onRunAction={(goal) => runSuggestedAction(goal)} />
        )}
      </section>

      {/* Agenda */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Today&apos;s agenda</h2>
        {sortedAgenda.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing on the calendar today.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
            {sortedAgenda.map((item, i) => (
              <li key={item.eventId ?? `${item.time}-${i}`} className="flex items-baseline gap-4 px-4 py-3">
                <span className="w-14 shrink-0 text-sm tabular-nums text-ink-soft">{item.time}</span>
                <span className="text-sm text-ink">{item.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Needs attention */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Needs attention</h2>
        {sortedAttention.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing urgent right now.</p>
        ) : (
          <ul className="space-y-2">
            {sortedAttention.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-lg border border-hairline bg-paper-raised p-3">
                <PriorityBadge priority={item.priority} className="mt-0.5 shrink-0" />
                <p className="min-w-0 flex-1 text-sm text-ink">{item.text}</p>
                {item.refUrl && (
                  <a href={item.refUrl} className="shrink-0 text-xs text-brand underline decoration-dotted">
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Follow-ups */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Follow-ups</h2>
        {!today?.followUps || today.followUps.length === 0 ? (
          <p className="text-sm text-ink-faint">No open follow-ups — you&apos;re all caught up.</p>
        ) : (
          <ul className="space-y-2">
            {today.followUps.map((item) => (
              <li key={item.id} className="rounded-lg border border-hairline bg-paper-raised p-3 text-sm text-ink">
                {item.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suggested actions */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Suggested actions</h2>
        {!today?.suggestedActions || today.suggestedActions.length === 0 ? (
          <p className="text-sm text-ink-faint">No suggestions right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {today.suggestedActions.map((action) => (
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

      {/* Recent agent activity */}
      {today?.recentRuns && today.recentRuns.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-faint">Recent agent activity</h2>
          <div className="space-y-2">
            {today.recentRuns.map((r) => (
              <AgentRunCard key={r.id} runId={r.id} collapsedByDefault linkToDetail />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
