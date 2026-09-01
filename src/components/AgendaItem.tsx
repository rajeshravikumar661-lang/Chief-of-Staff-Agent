import { cn } from "@/lib/ui";
import type { NeedsAttentionItem } from "@/lib/types";

/**
 * One row of the vertical agenda timeline. `isNext` gets the visual
 * emphasis (filled dot, brand-colored time, highlighted card) so the next
 * meeting is unmistakable at a glance. `related` surfaces prep prompts or
 * warnings for this specific event, pulled from needsAttention — the same
 * data as the decision section above, just re-shown in context.
 */
export function AgendaItem({
  time,
  title,
  isNext,
  isLast,
  related,
}: {
  time: string;
  title: string;
  isNext: boolean;
  isLast: boolean;
  related: NeedsAttentionItem[];
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!isLast && <span className="absolute left-[27px] top-6 h-full w-px bg-hairline" aria-hidden />}

      <div className="flex w-14 shrink-0 flex-col items-center pt-0.5">
        <span className={cn("text-xs tabular-nums", isNext ? "font-semibold text-brand-ink" : "text-ink-soft")}>{time}</span>
        <span
          className={cn(
            "mt-1.5 h-3 w-3 shrink-0 rounded-full border-2",
            isNext ? "border-brand bg-brand" : "border-hairline-strong bg-paper",
          )}
          aria-hidden
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg border px-4 py-2.5",
          isNext ? "border-brand/30 bg-brand-soft" : "border-hairline bg-paper-raised",
        )}
      >
        <div className="flex items-center gap-2">
          <p className={cn("text-sm", isNext ? "font-semibold text-brand-ink" : "font-medium text-ink")}>{title}</p>
          {isNext && (
            <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Next up
            </span>
          )}
        </div>

        {related.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {related.map((r) => (
              <li key={r.id} className="flex items-start gap-1.5 text-xs text-accent">
                <span aria-hidden>⚠</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
