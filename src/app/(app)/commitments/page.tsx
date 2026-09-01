"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { SourceBadge } from "@/components/SourceBadge";
import { cn, formatRelativeTime } from "@/lib/ui";
import type { CommitmentDTO } from "@/lib/types";

const FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
  { value: "overdue", label: "Overdue" },
  { value: "all", label: "All" },
];

export default function CommitmentsPage() {
  const [status, setStatus] = useState("open");
  const apiStatus = status === "all" ? undefined : status;
  const { data: commitments, isLoading, mutate } = useSWR(["commitments", status], () => api.commitments(apiStatus));

  async function markDone(id: string) {
    await api.updateCommitment(id, { status: "done" });
    mutate();
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">Commitments</h1>
        <p className="mt-1 text-sm text-ink-soft">What you and others have promised — tracked so nothing slips.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition",
              status === f.value ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-paper-raised",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading commitments…</p>}

      {!isLoading && (!commitments || commitments.length === 0) && (
        <p className="text-sm text-ink-faint">No commitments here.</p>
      )}

      {commitments && commitments.length > 0 && (
        <ul className="space-y-2">
          {commitments.map((c) => (
            <CommitmentRow key={c.id} commitment={c} onMarkDone={() => markDone(c.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommitmentRow({ commitment, onMarkDone }: { commitment: CommitmentDTO; onMarkDone: () => void }) {
  const c = commitment;
  return (
    <li className="rounded-lg border border-hairline bg-paper-raised p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{c.person}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{c.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <span>{c.deadline ? formatRelativeTime(c.deadline) : "no deadline"}</span>
            <span>·</span>
            {c.sourceUrl ? (
              <a href={c.sourceUrl} className="text-brand underline decoration-dotted">
                <SourceBadge source={c.source} />
              </a>
            ) : (
              <SourceBadge source={c.source} />
            )}
            <span>·</span>
            <span>{Math.round(c.confidence * 100)}% confidence</span>
          </div>
        </div>
        {c.status === "open" || c.status === "overdue" ? (
          <button
            onClick={onMarkDone}
            className="shrink-0 rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper"
          >
            Mark done
          </button>
        ) : null}
      </div>
    </li>
  );
}
