import { cn } from "@/lib/ui";
import type { RunStatusDTO } from "@/lib/types";

const STYLES: Record<RunStatusDTO, string> = {
  pending: "bg-low-soft text-low",
  planning: "bg-medium-soft text-medium",
  in_progress: "bg-brand-soft text-brand-ink",
  awaiting_approval: "bg-high-soft text-high",
  verifying: "bg-brand-soft text-brand-ink",
  succeeded: "bg-success-soft text-success",
  failed: "bg-critical-soft text-critical",
  partial: "bg-medium-soft text-medium",
  cancelled: "bg-low-soft text-low",
};

const LABELS: Record<RunStatusDTO, string> = {
  pending: "Queued",
  planning: "Planning",
  in_progress: "In progress",
  awaiting_approval: "Needs approval",
  verifying: "Verifying",
  succeeded: "Done",
  failed: "Failed",
  partial: "Partial",
  cancelled: "Cancelled",
};

export function StatusPill({ status, className }: { status: RunStatusDTO; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", STYLES[status], className)}>
      {status === "in_progress" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {LABELS[status]}
    </span>
  );
}
