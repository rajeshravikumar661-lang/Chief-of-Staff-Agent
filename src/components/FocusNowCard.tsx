"use client";

import { formatCountdown, minutesUntil, relatedActions, relatedAttention } from "@/lib/agenda";
import { WarningIcon } from "@/components/Icons";
import type { AgendaItem, NeedsAttentionItem, SuggestedAction } from "@/lib/types";

function scrollToAgenda() {
  const el = document.getElementById("agenda-timeline");
  if (!el) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/**
 * "UP NEXT" — ivory card for the next meeting/task (mockup's "Focus Now").
 * Front and center on both mobile and desktop. The primary button is a real
 * action: a matched suggested-action kicks off an agent run exactly like the
 * Suggested actions list does; otherwise it jumps to the full timeline.
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
    return <div className="h-48 animate-pulse rounded-2xl border border-surface-hairline bg-surface/60" />;
  }

  if (!event) {
    return (
      <div className="card-paper flex h-full min-h-[190px] flex-col items-center justify-center p-6 text-center">
        <p className="mono-label !text-surface-ink-faint">UP NEXT</p>
        <p className="mt-2 text-sm text-surface-ink-soft">Nothing else on your calendar today.</p>
      </div>
    );
  }

  const minutes = minutesUntil(event.time);
  const related = relatedAttention(event.title, attention);
  const matchedAction = relatedActions(event.title, suggestedActions)[0];

  return (
    <div className="card-paper relative flex h-full min-h-[190px] flex-col overflow-hidden p-6">
      <span className="absolute right-5 top-5 shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white shadow-sm">
        {formatCountdown(minutes)}
      </span>

      <img
        src="/kora/focus-vase.webp"
        alt=""
        className="pointer-events-none absolute -bottom-6 -right-6 h-40 w-40 rounded-2xl object-cover opacity-90 sm:h-48 sm:w-48"
        width={480}
        height={320}
        aria-hidden
      />

      <div className="relative z-[1] max-w-[75%] sm:max-w-[65%]">
        <p className="mono-label !text-accent">Up next</p>
        <p className="mt-2 font-serif text-2xl font-semibold leading-tight text-surface-ink">{event.title}</p>
        <p className="mt-1 text-sm text-surface-ink-soft">{event.time}</p>

        {related.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {related.map((r) => (
              <li key={r.id} className="flex items-start gap-1.5 text-sm text-surface-ink-soft">
                <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => (matchedAction ? onRunAction(matchedAction.goal) : scrollToAgenda())}
          disabled={matchedAction ? !matchedAction.goal : false}
          className="mt-4 text-sm font-medium text-accent transition hover:opacity-80 disabled:opacity-50"
        >
          {matchedAction ? matchedAction.label : "Open brief"} →
        </button>
      </div>
    </div>
  );
}
