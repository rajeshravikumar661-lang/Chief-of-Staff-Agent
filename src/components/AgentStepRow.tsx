import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/ui";
import type { AgentStepDTO } from "@/lib/types";
import { ApprovalCard } from "@/components/ApprovalCard";
import { CheckIcon, CircleIcon, LoaderIcon, MinusIcon, WarningIcon, XIcon } from "@/components/Icons";

const ICON: Record<AgentStepDTO["status"], ComponentType<SVGProps<SVGSVGElement>>> = {
  pending: CircleIcon,
  running: LoaderIcon,
  succeeded: CheckIcon,
  failed: XIcon,
  awaiting_approval: WarningIcon,
  rejected: XIcon,
  skipped: MinusIcon,
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
  const StepIcon = ICON[step.status];

  return (
    <li className="py-2">
      <div className="flex items-start gap-3">
        <StepIcon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLOR[step.status])} aria-hidden />
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
