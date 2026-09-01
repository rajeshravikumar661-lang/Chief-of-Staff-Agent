"use client";

import Link from "next/link";
import { PriorityBadge } from "@/components/PriorityBadge";
import { formatRelativeTime } from "@/lib/ui";
import type { BriefingItem, BriefingResponse } from "@/lib/types";

const KIND_LABEL: Record<BriefingItem["kind"], string> = {
  meeting: "Meeting",
  email: "Email",
  pr: "PR",
  commitment: "Commitment",
  task: "Task",
  follow_up: "Follow-up",
};

/**
 * Renders GET /api/briefing/today. Spec §9: keep it short, scannable, ~10
 * items — if the payload is longer that's a backend signal, not a reason to
 * add a "show more" accordion, so this deliberately does not paginate.
 */
export function BriefingView({
  briefing,
  onRunAction,
}: {
  briefing: BriefingResponse;
  onRunAction?: (goal: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs text-ink-faint">Generated {formatRelativeTime(briefing.generatedAt)}</p>
      <ul className="space-y-2">
        {briefing.items.map((item) => (
          <li key={item.id} className="rounded-lg border border-hairline bg-paper-raised p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{KIND_LABEL[item.kind]}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <p className="mt-1 text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{item.detail}</p>
              </div>
              {item.refUrl && (
                <Link href={item.refUrl} className="shrink-0 text-xs text-brand underline decoration-dotted">
                  Open
                </Link>
              )}
            </div>
            {item.suggestedActions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.suggestedActions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => a.goal && onRunAction?.(a.goal)}
                    className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
        {briefing.items.length === 0 && <p className="text-sm text-ink-faint">Nothing urgent — a quiet morning.</p>}
      </ul>
    </div>
  );
}
