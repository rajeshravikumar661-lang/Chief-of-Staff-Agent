"use client";

import { useState } from "react";
import { cn } from "@/lib/ui";
import type { AgentStepDTO } from "@/lib/types";

function previewText(step: AgentStepDTO): { label: string; body: string } | null {
  const out = step.result as Record<string, unknown> | undefined;
  const args = step.arguments as Record<string, unknown> | undefined;
  if (step.tool?.includes("draft") || step.tool?.includes("send") || step.tool?.includes("email")) {
    const to = (out?.to ?? args?.to) as string | undefined;
    const subject = (out?.subject ?? args?.subject) as string | undefined;
    const body = (out?.body ?? args?.body) as string | undefined;
    return {
      label: "Draft preview",
      body: [to ? `To: ${to}` : null, subject ? `Subject: ${subject}` : null, "", body ?? "(no body)"]
        .filter((l) => l !== null)
        .join("\n"),
    };
  }
  if (step.tool?.includes("calendar") || step.tool?.includes("event")) {
    return { label: "Change preview", body: JSON.stringify(out ?? args ?? {}, null, 2) };
  }
  if (out || args) return { label: "Details", body: JSON.stringify(out ?? args, null, 2) };
  return null;
}

/**
 * Inline card per awaiting_approval step (spec §6). Shows exactly what will
 * happen — a draft preview for emails, a diff-style preview for calendar
 * changes — before Approve fires the WRITE/DESTRUCTIVE tool.
 */
export function ApprovalCard({
  step,
  onApprove,
  onReject,
}: {
  step: AgentStepDTO;
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [expanded, setExpanded] = useState(true);
  const preview = previewText(step);

  async function act(kind: "approve" | "reject") {
    setPending(kind);
    try {
      await (kind === "approve" ? onApprove() : onReject());
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-lg border border-high-soft bg-high-soft/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{step.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Requires your approval before it runs — {step.permission.toLowerCase()} action.</p>
        </div>
        {preview && (
          <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-xs text-ink-soft underline decoration-dotted">
            {expanded ? "Hide" : "Review"}
          </button>
        )}
      </div>

      {preview && expanded && (
        <div className="mt-3 rounded-md border border-hairline bg-paper-raised p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{preview.label}</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink">{preview.body}</pre>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => act("approve")}
          disabled={pending !== null}
          className={cn(
            "rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50",
          )}
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          onClick={() => act("reject")}
          disabled={pending !== null}
          className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-paper disabled:opacity-50"
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
