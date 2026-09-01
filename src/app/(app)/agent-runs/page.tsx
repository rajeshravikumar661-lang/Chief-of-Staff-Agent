"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { StatusPill } from "@/components/StatusPill";
import { formatRelativeTime } from "@/lib/ui";

/**
 * List view of every agent run (spec §6) — the entry point into the
 * trust-building timeline. Includes a lightweight "start a run" form so a
 * goal can be kicked off without going through chat.
 */
export default function AgentRunsPage() {
  const { data: runs, isLoading, mutate } = useSWR("agent-runs", api.listRuns);
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { runId } = await api.createRun(trimmed);
      mutate();
      router.push(`/agent-runs/${runId}`);
    } catch {
      setError("Couldn't start that run. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Agent runs</h1>
          <p className="mt-1 text-sm text-ink-soft">Every task your Chief of Staff has worked on, live and past.</p>
        </div>
      </div>

      <form onSubmit={startRun} className="mb-8 flex items-center gap-2 rounded-lg border border-hairline bg-paper-raised p-3">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Give it a goal, e.g. “Prepare a briefing for tomorrow's board meeting”"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || !goal.trim()}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start run"}
        </button>
      </form>
      {error && <p className="-mt-6 mb-6 text-xs text-critical">{error}</p>}

      {isLoading && <p className="text-sm text-ink-soft">Loading runs…</p>}

      {!isLoading && runs?.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">No runs yet. Give it a goal above to get started.</p>
        </div>
      )}

      {runs && runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/agent-runs/${run.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-paper-raised px-4 py-3 transition hover:border-hairline-strong"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{run.goal}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {run.stepCount} step{run.stepCount === 1 ? "" : "s"} · {formatRelativeTime(run.startedAt)}
                  </p>
                </div>
                <StatusPill status={run.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
