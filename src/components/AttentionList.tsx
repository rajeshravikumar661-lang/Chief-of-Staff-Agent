import Link from "next/link";
import { cn } from "@/lib/ui";
import { ChevronRightIcon, DotIcon, WarningIcon } from "@/components/Icons";
import type { NeedsAttentionItem, Priority } from "@/lib/types";

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Coral for urgent (critical/high), quiet neutral for medium/low — matches the mockup's icon-square rows. */
const ICON_TONE: Record<Priority, string> = {
  CRITICAL: "bg-accent-soft text-accent",
  HIGH: "bg-accent-soft text-accent",
  MEDIUM: "bg-paper text-ink-faint",
  LOW: "bg-paper text-ink-faint",
};

/**
 * "Needs Your Decision" — the highest-priority content on the page.
 * Critical/high items sort first; priority is signalled with a small
 * colored icon square, not a loud background fill, so the whole section
 * stays scannable rather than alarming (spec: "stand out without being
 * stressful"). Compact rows so this reads well even on mobile.
 */
export function AttentionList({
  items,
  loading,
}: {
  items: NeedsAttentionItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <ul className="space-y-2">
        {[0, 1].map((i) => (
          <li key={i} className="h-14 animate-pulse rounded-2xl border border-hairline bg-paper-raised" />
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-5 text-center">
        <p className="text-sm text-ink-soft">Nothing needs a decision right now.</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return (
    <ul className="space-y-2">
      {sorted.map((item) => {
        const row = (
          <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-paper-raised px-3 py-2.5 shadow-sm transition hover:border-hairline-strong">
            <span
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE[item.priority])}
              aria-hidden
            >
              {item.priority === "CRITICAL" || item.priority === "HIGH" ? (
                <WarningIcon className="h-4 w-4" />
              ) : (
                <DotIcon className="h-4 w-4" />
              )}
            </span>
            <p className="min-w-0 flex-1 text-sm text-ink">{item.text}</p>
            {item.refUrl && <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />}
          </div>
        );
        return <li key={item.id}>{item.refUrl ? <Link href={item.refUrl}>{row}</Link> : row}</li>;
      })}
    </ul>
  );
}
