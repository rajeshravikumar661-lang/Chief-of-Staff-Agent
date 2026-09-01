import { AgendaItem } from "@/components/AgendaItem";
import type { AgendaItem as AgendaItemDTO, NeedsAttentionItem } from "@/lib/types";

const STOPWORDS = new Set(["the", "with", "and", "for", "today", "meeting", "call", "review", "standup", "product"]);

/** Best-effort match: does a needs-attention item mention a word from this event's title? */
function relatedTo(eventTitle: string, attention: NeedsAttentionItem[]): NeedsAttentionItem[] {
  const keywords = eventTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (keywords.length === 0) return [];
  return attention.filter((a) => keywords.some((k) => a.text.toLowerCase().includes(k)));
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Vertical, time-led agenda (spec: "main working area"). Sorted by time,
 * next meeting visually emphasized, with prep prompts/warnings surfaced
 * inline when a needs-attention item can be matched to that event.
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
          <li key={i} className="h-16 animate-pulse rounded-lg border border-hairline bg-paper-raised" />
        ))}
      </ul>
    );
  }

  if (agenda.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
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
          isLast={i === sorted.length - 1}
          related={relatedTo(event.title, attention)}
        />
      ))}
    </ul>
  );
}
