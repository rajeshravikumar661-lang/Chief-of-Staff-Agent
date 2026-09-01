import Link from "next/link";
import { PriorityBadge } from "@/components/PriorityBadge";
import { cn } from "@/lib/ui";
import type { NeedsAttentionItem, Priority } from "@/lib/types";

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const RAIL_COLOR: Record<Priority, string> = {
  CRITICAL: "before:bg-critical",
  HIGH: "before:bg-high",
  MEDIUM: "before:bg-medium",
  LOW: "before:bg-low",
};

/**
 * "Needs Your Decision" — the highest-priority content on the page.
 * Critical/high items sort first; priority is signalled with a thin colored
 * rail + badge, not a loud background fill, so the whole section stays
 * scannable rather than alarming (spec: "stand out without being stressful").
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
          <li key={i} className="h-14 animate-pulse rounded-lg border border-hairline bg-paper-raised" />
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-hairline p-5 text-center">
        <p className="text-sm text-ink-soft">Nothing needs a decision right now.</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return (
    <ul className="space-y-2">
      {sorted.map((item) => (
        <li
          key={item.id}
          className={cn(
            "relative flex items-start gap-3 overflow-hidden rounded-lg border border-hairline bg-paper-raised py-3 pl-4 pr-3",
            "before:absolute before:inset-y-0 before:left-0 before:w-1",
            RAIL_COLOR[item.priority],
          )}
        >
          <PriorityBadge priority={item.priority} className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm text-ink">{item.text}</p>
          {item.refUrl && (
            <Link href={item.refUrl} className="shrink-0 self-center text-xs font-medium text-brand underline decoration-dotted">
              Review
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
