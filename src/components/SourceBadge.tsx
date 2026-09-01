import { cn } from "@/lib/ui";

const LABELS: Record<string, string> = {
  gmail: "Gmail",
  calendar: "Calendar",
  drive: "Drive",
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
  google: "Google",
};

/**
 * Additive per SHARED spec §6 milestone 6 — new providers only need an entry
 * above, never a redesign of the row/card that renders it.
 */
export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const label = LABELS[source] ?? source;
  return (
    <span className={cn("inline-flex items-center rounded border border-hairline-strong px-1.5 py-0.5 text-[11px] text-ink-soft", className)}>
      {label}
    </span>
  );
}
