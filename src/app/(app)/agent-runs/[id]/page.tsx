"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { AgentRunCard } from "@/components/AgentRunCard";
import { StatusPill } from "@/components/StatusPill";

const CANCELLABLE_STATUSES = new Set(["pending", "planning", "in_progress", "awaiting_approval", "verifying"]);

/**
 * Dedicated run detail page (spec §6) — same AgentRunCard timeline used on
 * the dashboard and in chat, just expanded and given a page shell.
 */
export default function AgentRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: initial } = useSWR(`agent-run-${id}`, () => api.getRun(id));
  const [cancelling, setCancelling] = useState(false);

  const status = initial?.status;
  const canCancel = status ? CANCELLABLE_STATUSES.has(status) : false;

  async function cancel() {
    if (!canCancel || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelRun(id);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div>
      <Link href="/agent-runs" className="text-xs text-ink-soft underline decoration-dotted hover:text-ink">
        ← All runs
      </Link>

      <div className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold text-ink">{initial?.goal ?? "Agent run"}</h1>
          <div className="mt-2 flex items-center gap-2">
            {status && <StatusPill status={status} />}
          </div>
        </div>
        <button
          onClick={cancel}
          disabled={!canCancel || cancelling}
          className="shrink-0 rounded-md border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cancelling ? "Cancelling…" : "Cancel run"}
        </button>
      </div>

      <AgentRunCard runId={id} initial={initial} collapsedByDefault={false} linkToDetail={false} />
    </div>
  );
}
