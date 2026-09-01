"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAgentRunStream } from "@/lib/useAgentRunStream";
import { AgentStepRow } from "@/components/AgentStepRow";
import { StatusPill } from "@/components/StatusPill";
import type { AgentRunDTO } from "@/lib/types";
import { cn } from "@/lib/ui";

/**
 * The trust-building component (spec §6) — one generic timeline reused on
 * the dashboard, in chat, and on /agent-runs/:id. Collapsed by default in
 * chat: goal + status + step count; expandable to the full timeline.
 * Live-updates from the SSE stream so a run visibly does work.
 */
export function AgentRunCard({
  runId,
  initial,
  collapsedByDefault = false,
  linkToDetail = true,
}: {
  runId: string;
  initial?: AgentRunDTO;
  collapsedByDefault?: boolean;
  linkToDetail?: boolean;
}) {
  const { run } = useAgentRunStream(runId, initial);
  const [expanded, setExpanded] = useState(!collapsedByDefault);

  if (!run) {
    return (
      <div className="rounded-lg border border-hairline bg-paper-raised p-4">
        <p className="text-sm text-ink-soft">Starting run…</p>
      </div>
    );
  }

  const doneSteps = run.steps.filter((s) => s.status === "succeeded").length;

  async function approve(stepId: string) {
    await api.approveStep(run!.id, stepId);
  }
  async function reject(stepId: string) {
    await api.rejectStep(run!.id, stepId);
  }

  return (
    <div className="rounded-lg border border-hairline bg-paper-raised">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{run.goal}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {doneSteps}/{run.steps.length} steps
            {run.summary ? ` · ${run.summary}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={run.status} />
          <span className={cn("text-ink-faint transition-transform", expanded && "rotate-180")}>⌄</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-hairline px-4 py-2">
          <ul className="divide-y divide-hairline">
            {run.steps.map((step) => (
              <AgentStepRow key={step.id} step={step} onApprove={approve} onReject={reject} />
            ))}
          </ul>
          {linkToDetail && (
            <Link href={`/agent-runs/${run.id}`} className="mt-1 inline-block pb-2 text-xs text-brand underline decoration-dotted">
              Open full run →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
