"use client";

import { formatCountdown, minutesUntil, relatedActions, relatedAttention } from "@/lib/agenda";
import { TargetIcon, WarningIcon } from "@/components/Icons";
import type { AgendaItem, NeedsAttentionItem, SuggestedAction } from "@/lib/types";

function scrollToAgenda() {
  const el = document.getElementById("agenda-timeline");
  if (!el) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/**
 * Hero card for the next meeting/task (mockup's "Focus Now"). Soft blue,
 * front and center on both mobile and desktop. Buttons are real actions:
 * a matched suggested-action kicks off an agent run exactly like the
 * Suggested actions list does; the other jumps to the full timeline.
 */
export function FocusNowCard({
  event,
  attention,
  suggestedActions,
  onRunAction,
  loading,
}: {
  event: AgendaItem | undefined;
  attention: NeedsAttentionItem[];
  suggestedActions: SuggestedAction[];
  onRunAction: (goal: string | undefined) => void;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-hairline bg-paper-raised" />;
  }

  if (!event) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-5 text-center">
        <p className="text-sm text-ink-soft">Nothing else on your calendar today.</p>
      </div>
    );
  }

  const minutes = minutesUntil(event.time);
  const related = relatedAttention(event.title, attention);
  const matchedAction = relatedActions(event.title, suggestedActions)[0];

  return (
    <div className="rounded-2xl border border-focus/30 bg-focus px-5 py-4 text-white shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">Focus now</p>
        <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium tabular-nums">
          {formatCountdown(minutes)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15" aria-hidden>
          <TargetIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-lg font-semibold">{event.title}</p>
          <p className="text-sm text-white/80">{event.time}</p>
        </div>
      </div>

      {related.length > 0 && (
        <ul className="mt-2 space-y-1">
          {related.map((r) => (
            <li key={r.id} className="flex items-start gap-1.5 text-sm text-white/90">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {matchedAction && (
          <button
            onClick={() => onRunAction(matchedAction.goal)}
            disabled={!matchedAction.goal}
            className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-[#1f3a52] transition hover:opacity-90 disabled:opacity-50"
          >
            {matchedAction.label}
          </button>
        )}
        <button
          onClick={scrollToAgenda}
          className="rounded-full border border-white/40 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
        >
          View full agenda
        </button>
      </div>
    </div>
  );
}
