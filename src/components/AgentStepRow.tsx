import { cn } from "@/lib/ui";
import type { AgentStepDTO } from "@/lib/types";
import { ApprovalCard } from "@/components/ApprovalCard";

const ICON: Record<AgentStepDTO["status"], string> = {
  pending: "○",
  running: "◐",
  succeeded: "✓",
  failed: "✗",
  awaiting_approval: "⚠",
  rejected: "✗",
  skipped: "–",
};

const ICON_COLOR: Record<AgentStepDTO["status"], string> = {
  pending: "text-ink-faint",
  running: "text-brand animate-spin",
  succeeded: "text-success",
  failed: "text-critical",
  awaiting_approval: "text-high",
  rejected: "text-ink-faint",
  skipped: "text-ink-faint",
};

/**
 * One row of the run timeline (spec §6). States map 1:1 to AgentStepDTO.status:
 * pending greyed, running spinner, succeeded check, failed error+message,
 * awaiting_approval inline approve/reject, rejected struck through.
 */
export function AgentStepRow({
  step,
  onApprove,
  onReject,
}: {
  step: AgentStepDTO;
  onApprove?: (stepId: string) => Promise<void> | void;
  onReject?: (stepId: string) => Promise<void> | void;
}) {
  const dimmed = step.status === "pending";
  const struck = step.status === "rejected";

  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 w-4 shrink-0 text-center text-sm", ICON_COLOR[step.status])} aria-hidden>
          {ICON[step.status]}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm text-ink", dimmed && "text-ink-faint", struck && "text-ink-faint line-through")}>{step.title}</p>
          {step.summary && !dimmed && <p className="mt-0.5 text-xs text-ink-soft">{step.summary}</p>}
          {step.status === "failed" && step.verification?.detail && (
            <p className="mt-0.5 text-xs text-critical">{step.verification.detail}</p>
          )}
          {step.status === "awaiting_approval" && onApprove && onReject && (
            <div className="mt-2">
              <ApprovalCard step={step} onApprove={() => onApprove(step.id)} onReject={() => onReject(step.id)} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
