"use client";

import { useState } from "react";
import Link from "next/link";
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
import { NavIcon } from "@/components/Icons";
import { useNavBadges } from "@/lib/useNavBadges";
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
  const badges = useNavBadges();

  async function runSuggestedAction(goal: string | undefined) {
    if (!goal) return;
    const { runId } = await api.createRun(goal);
    setStartedRunIds((prev) => [runId, ...prev]);
    mutateToday();
  }

  if (todayError) {
    return (
      <div className="card-paper p-8 text-center">
        <p className="text-sm text-surface-ink">Couldn&apos;t load your day.</p>
        <p className="mt-1 text-sm text-surface-ink-faint">{todayError instanceof Error ? todayError.message : "Something went wrong."}</p>
        <button
          onClick={() => mutateToday()}
          className="mt-3 rounded border border-surface-hairline px-3 py-1.5 text-sm font-medium text-surface-ink-soft transition hover:bg-surface-deep"
        >
          Try again
        </button>
      </div>
    );
  }

  const agenda = today?.agenda ?? [];
  const attention = today?.needsAttention ?? [];
  const suggestedActions = today?.suggestedActions ?? [];
  const recentRuns = today?.recentRuns ?? [];

  const now = nowHHMM();
  const sortedAgenda = [...agenda].sort((a, b) => a.time.localeCompare(b.time));
  const nextEvent = sortedAgenda.find((e) => e.time >= now);

  return (
    <div className="pb-4">
      {/* Header — real greeting + one-line brief, over the desk photo */}
      <KoraSummary
        greeting={today?.greeting ?? "Good morning."}
        summary={buildDaySummary(today)}
        loading={todayLoading}
      />

      {/* Quiet entry points to sections that no longer have a nav slot */}
      <div className="mt-3 flex items-center gap-4">
        <Link href="/inbox" className="mono-label flex items-center gap-1.5 transition hover:!text-ink">
          <NavIcon name="mail" className="h-3.5 w-3.5" aria-hidden />
          Inbox
        </Link>
        <Link href="/activity" className="mono-label flex items-center gap-1.5 transition hover:!text-ink">
          <NavIcon name="activity" className="h-3.5 w-3.5" aria-hidden />
          Activity
          {badges.activity > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {badges.activity}
            </span>
          )}
        </Link>
      </div>

      {/* Mobile-only 7-day strip */}
      <div className="mt-4 lg:hidden">
        <DateStrip />
      </div>

      {/* UP NEXT + INBOX PRIORITY — side by side on desktop */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FocusNowCard
          event={nextEvent}
          attention={attention}
          suggestedActions={suggestedActions}
          onRunAction={runSuggestedAction}
          loading={todayLoading}
        />
        <AttentionList items={attention} loading={todayLoading} />
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
          <div className="h-8 animate-pulse rounded border border-hairline bg-white/10" />
        ) : suggestedActions.length === 0 ? (
          <p className="font-serif text-sm text-ink-faint">No suggestions right now.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {suggestedActions.map((action) => (
              <button
                key={action.id}
                onClick={() => runSuggestedAction(action.goal)}
                disabled={!action.goal}
                className="card-paper px-3 py-1.5 text-sm font-medium text-surface-ink-soft transition hover:text-surface-ink disabled:opacity-50"
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

      {/* KORA AGENT UPDATE — real recent runs */}
      {recentRuns.length > 0 && (
        <section className="mt-8">
          <div className="card-paper relative overflow-hidden p-6">
            <div className="max-w-md">
              <p className="mono-label !text-accent">Kora agent update</p>
              <p className="mt-2 font-serif text-xl font-semibold text-surface-ink">
                I&apos;ve been preparing for your day.
              </p>
              <p className="mt-1 text-sm text-surface-ink-soft">
                {recentRuns.length} run{recentRuns.length === 1 ? "" : "s"} completed recently.
              </p>
            </div>
            <img
              src="/kora/agent-botanical.webp"
              alt=""
              aria-hidden
              className="pointer-events-none absolute -right-4 top-0 hidden h-full w-32 object-cover opacity-80 sm:block"
            />
            <Link href="/agent-runs" className="relative mt-4 inline-block text-sm font-medium text-accent">
              See all agent runs →
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {recentRuns.map((r) => (
              <AgentRunCard key={r.id} runId={r.id} collapsedByDefault linkToDetail />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
