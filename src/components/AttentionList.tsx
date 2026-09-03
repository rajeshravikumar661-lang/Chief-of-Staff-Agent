import Link from "next/link";
import { cn } from "@/lib/ui";
import { ChevronRightIcon, DotIcon, WarningIcon } from "@/components/Icons";
import type { NeedsAttentionItem, Priority } from "@/lib/types";

const PRIORITY_ORDER: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: "Needs a decision",
  HIGH: "Needs a decision",
  MEDIUM: "To look at",
  LOW: "To look at",
};

/** Coral for urgent (critical/high), quiet neutral for medium/low. */
const ICON_TONE: Record<Priority, string> = {
  CRITICAL: "bg-accent-soft text-accent",
  HIGH: "bg-accent-soft text-accent",
  MEDIUM: "bg-surface-deep text-surface-ink-faint",
  LOW: "bg-surface-deep text-surface-ink-faint",
};

/**
 * "INBOX PRIORITY" — the ivory card summarizing items that need attention or
 * a decision (spec: "stand out without being stressful"). Shows up to 3
 * items, highest priority first, with a link into the full inbox for the
 * rest. Rows use the surface (ivory-card) text tokens throughout since this
 * card is always light regardless of the dark canvas theme.
 */
export function AttentionList({
  items,
  loading,
  max = 3,
}: {
  items: NeedsAttentionItem[];
  loading?: boolean;
  max?: number;
}) {
  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-surface-hairline bg-surface/60" />;
  }

  const sorted = [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const shown = sorted.slice(0, max);

  return (
    <div className="card-paper flex h-full min-h-[190px] flex-col p-6">
      <p className="mono-label !text-accent">Inbox priority</p>
      <p className="mt-2 font-serif text-xl font-semibold text-surface-ink">
        {items.length === 0 ? "Nothing needs your attention" : `${items.length} item${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} your attention`}
      </p>

      {shown.length > 0 && (
        <ul className="mt-3 flex-1 space-y-2">
          {shown.map((item) => {
            const row = (
              <div className="flex items-center gap-3 rounded-xl border border-surface-hairline bg-surface-raised px-3 py-2.5 transition hover:border-surface-ink-faint/40">
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
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-ink-faint">
                    {PRIORITY_LABEL[item.priority]}
                  </p>
                  <p className="truncate text-sm text-surface-ink">{item.text}</p>
                </div>
                {item.refUrl && <ChevronRightIcon className="h-4 w-4 shrink-0 text-surface-ink-faint" aria-hidden />}
              </div>
            );
            return <li key={item.id}>{item.refUrl ? <Link href={item.refUrl}>{row}</Link> : row}</li>;
          })}
        </ul>
      )}

      <Link href="/inbox" className="mt-4 inline-block text-sm font-medium text-accent transition hover:opacity-80">
        Open inbox →
      </Link>
    </div>
  );
}
