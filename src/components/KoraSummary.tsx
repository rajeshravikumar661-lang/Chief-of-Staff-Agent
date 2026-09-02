/**
 * Top-of-page briefing (spec: "feel like a personal briefing, not a metrics
 * dashboard"). A small date label, a warm serif greeting, and one human
 * sentence about the day — no tiles, no stat chips competing for attention.
 * (Counts now live as small badges on the section headers they describe.)
 */
export function KoraSummary({
  greeting,
  summary,
  loading,
}: {
  greeting: string;
  summary: string;
  loading?: boolean;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section>
      <p className="desk-label">{dateLabel}</p>

      <h1 className="mt-1 font-hand text-[2.75rem] font-bold leading-[1.1] text-ink sm:text-5xl">
        {loading ? <span className="inline-block h-9 w-64 animate-pulse rounded bg-paper-raised" /> : greeting}
      </h1>

      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        {loading ? (
          <span className="inline-block h-5 w-full max-w-md animate-pulse rounded bg-paper-raised" />
        ) : (
          summary
        )}
      </p>
    </section>
  );
}
