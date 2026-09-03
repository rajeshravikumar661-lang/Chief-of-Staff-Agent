import { cn } from "@/lib/ui";
import { EventIcon, WarningIcon, type EventIconName } from "@/components/Icons";
import { eventIcon } from "@/lib/agenda";
import type { NeedsAttentionItem } from "@/lib/types";

const CATEGORY_TONE: Record<EventIconName, string> = {
  wellness: "bg-success-soft text-success",
  focus: "bg-focus-soft text-focus",
  people: "bg-accent-soft text-accent",
  food: "bg-paper text-ink-faint",
  calendar: "bg-paper text-ink-faint",
};

/**
 * One row of the vertical agenda timeline. `isNext` gets the focus
 * treatment (soft blue, filled dot) so the next meeting is unmistakable;
 * `isPast` gets a quiet done/checked treatment (soft green) so the day
 * reads as progress, not just a flat list. `related` surfaces prep prompts
 * or warnings for this specific event, pulled from needsAttention.
 */
export function AgendaItem({
  time,
  title,
  isNext,
  isPast,
  isLast,
  related,
}: {
  time: string;
  title: string;
  isNext: boolean;
  isPast: boolean;
  isLast: boolean;
  related: NeedsAttentionItem[];
}) {
  const category = eventIcon(title);

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!isLast && <span className="absolute left-[27px] top-6 h-full w-px bg-hairline" aria-hidden />}

      <div className="flex w-14 shrink-0 flex-col items-center pt-0.5">
        <span className={cn("text-xs tabular-nums", isNext ? "font-semibold text-focus-ink" : "text-ink-soft")}>{time}</span>
        <span
          className={cn(
            "mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2",
            isNext && "border-focus bg-focus",
            !isNext && isPast && "border-success bg-success",
            !isNext && !isPast && "border-hairline-strong bg-paper",
          )}
          aria-hidden
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 rounded-2xl border px-4 py-2.5 transition-colors",
          isNext && "border-focus/30 bg-focus-soft",
          !isNext && isPast && "border-success/25 bg-success-soft",
          !isNext && !isPast && "border-hairline bg-transparent hover:border-hairline-strong",
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", CATEGORY_TONE[category])} aria-hidden>
            <EventIcon name={category} className="h-4 w-4" />
          </span>
          <p
            className={cn(
              "text-sm",
              isNext ? "font-semibold text-focus-ink" : isPast ? "text-ink-soft line-through decoration-success/50" : "font-medium text-ink",
            )}
          >
            {title}
          </p>
          {isNext && (
            <span className="shrink-0 rounded-full bg-focus px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Focus now
            </span>
          )}
          {!isNext && isPast && (
            <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
              Done
            </span>
          )}
        </div>

        {related.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {related.map((r) => (
              <li key={r.id} className="flex items-start gap-1.5 text-xs text-accent">
                <WarningIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
