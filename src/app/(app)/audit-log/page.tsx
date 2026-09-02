"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import { formatClock, formatRelativeTime } from "@/lib/ui";

/**
 * Transparency view (spec §8) — "you can trust what it says it did." A flat,
 * reverse-chronological record of every tool call, independent of the run
 * timeline UI. Supports ?runId= to scope to one run.
 */
export default function AuditLogPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") ?? undefined;

  const { data: logs, isLoading } = useSWR(["audit-logs", runId], () => api.auditLogs(runId));

  const sorted = logs ? [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : undefined;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-ink-soft">A complete record of what the agent actually did.</p>
      </div>

      {runId && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-ink-soft">
            Filtered to run <span className="font-mono text-xs text-ink">{runId}</span>
          </span>
          <Link href={pathname} className="text-xs text-brand underline decoration-dotted">
            Clear filter
          </Link>
        </div>
      )}

      {isLoading && <p className="text-sm text-ink-soft">Loading log…</p>}

      {!isLoading && sorted?.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
          <p className="text-sm text-ink-soft">Nothing logged yet.</p>
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-paper-raised">
          {sorted.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-ink">{entry.action}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {entry.tool && (
                    <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-ink">
                      {entry.tool}
                    </span>
                  )}
                  {entry.runId && (
                    <Link
                      href={`/agent-runs/${entry.runId}`}
                      className="text-[11px] text-ink-soft underline decoration-dotted hover:text-ink"
                    >
                      view run →
                    </Link>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-ink-soft">{formatClock(entry.timestamp)}</p>
                <p className="text-[11px] text-ink-faint">{formatRelativeTime(entry.timestamp)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
