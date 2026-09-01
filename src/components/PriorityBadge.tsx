import { cn } from "@/lib/ui";
import type { Priority } from "@/lib/types";

const STYLES: Record<Priority, string> = {
  CRITICAL: "bg-critical-soft text-critical",
  HIGH: "bg-high-soft text-high",
  MEDIUM: "bg-medium-soft text-medium",
  LOW: "bg-low-soft text-low",
};

const LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tracking-wide",
        STYLES[priority],
        className,
      )}
    >
      {LABELS[priority]}
    </span>
  );
}
