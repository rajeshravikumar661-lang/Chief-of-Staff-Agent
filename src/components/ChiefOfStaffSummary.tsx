import { cn } from "@/lib/ui";

interface SummaryStats {
  meetings: number;
  attention: number;
  commitments: number;
}

/**
 * Top-of-page briefing (spec: "feel like a personal briefing, not a metrics
 * dashboard"). A warm greeting, one human sentence about the day, and three
 * quiet stat chips — no tiles, no big numbers competing for attention.
 */
export function ChiefOfStaffSummary({
  greeting,
  summary,
  stats,
  loading,
}: {
  greeting: string;
  summary: string;
  stats: SummaryStats;
  loading?: boolean;
}) {
  return (
    <section>
      <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">
        {loading ? <span className="inline-block h-9 w-64 animate-pulse rounded bg-paper-raised" /> : greeting}
      </h1>

      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        {loading ? (
          <span className="inline-block h-5 w-full max-w-md animate-pulse rounded bg-paper-raised" />
        ) : (
          summary
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatChip label="Meetings today" value={stats.meetings} loading={loading} />
        <StatChip label="Needs attention" value={stats.attention} loading={loading} tone={stats.attention > 0 ? "warm" : "quiet"} />
        <StatChip label="Commitments due" value={stats.commitments} loading={loading} />
      </div>
    </section>
  );
}

function StatChip({
  label,
  value,
  loading,
  tone = "quiet",
}: {
  label: string;
  value: number;
  loading?: boolean;
  tone?: "quiet" | "warm";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
        tone === "warm" && value > 0 ? "border-accent/30 bg-accent-soft text-accent" : "border-hairline bg-paper-raised text-ink-soft",
      )}
    >
      {loading ? (
        <span className="inline-block h-4 w-16 animate-pulse rounded bg-hairline" />
      ) : (
        <>
          <span className="font-semibold tabular-nums text-ink">{value}</span>
          <span>{label}</span>
        </>
      )}
    </div>
  );
}
