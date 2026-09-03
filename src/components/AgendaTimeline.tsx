import { AgendaItem } from "@/components/AgendaItem";
import { nowHHMM, relatedAttention } from "@/lib/agenda";
import type { AgendaItem as AgendaItemDTO, NeedsAttentionItem } from "@/lib/types";

/**
 * Vertical, time-led agenda (spec: "main working area"). Sorted by time,
 * the next meeting gets the focus treatment, past events are marked done,
 * with prep prompts/warnings surfaced inline when a needs-attention item
 * can be matched to that event.
 */
export function AgendaTimeline({
  agenda,
  attention,
  loading,
}: {
  agenda: AgendaItemDTO[];
  attention: NeedsAttentionItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <ul className="space-y-4">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-16 animate-pulse rounded-2xl border border-hairline bg-white/[0.04]" />
        ))}
      </ul>
    );
  }

  if (agenda.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-8 text-center">
        <p className="text-sm text-ink-soft">Nothing on the calendar today.</p>
      </div>
    );
  }

  const sorted = [...agenda].sort((a, b) => a.time.localeCompare(b.time));
  const now = nowHHMM();
  const nextTime = sorted.find((e) => e.time >= now)?.time;

  return (
    <ul>
      {sorted.map((event, i) => (
        <AgendaItem
          key={event.eventId ?? `${event.time}-${i}`}
          time={event.time}
          title={event.title}
          isNext={nextTime !== undefined && event.time === nextTime}
          isPast={event.time < now}
          isLast={i === sorted.length - 1}
          related={relatedAttention(event.title, attention)}
        />
      ))}
    </ul>
  );
}
