/**
 * Header band — sits directly on the dark canvas, no card. A wide banner
 * photo with a dark gradient for legibility, a large serif greeting in
 * cream, and one human sentence about the day underneath (spec: "feel like
 * a personal briefing, not a metrics dashboard" — no tiles, no stat chips).
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
    <section className="relative max-h-64 w-full overflow-hidden rounded-2xl">
      <img
        src="/kora/today-header.webp"
        alt=""
        className="h-64 w-full object-cover"
        width={1200}
        height={800}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <p className="mono-label !text-ink-soft">{dateLabel}</p>

        <h1 className="mt-1 font-serif text-4xl font-semibold leading-[1.1] text-ink md:text-5xl">
          {loading ? (
            <span className="inline-block h-9 w-64 animate-pulse rounded bg-white/15" />
          ) : (
            greeting
          )}
        </h1>

        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          {loading ? (
            <span className="inline-block h-5 w-full max-w-md animate-pulse rounded bg-white/10" />
          ) : (
            summary
          )}
        </p>
      </div>
    </section>
  );
}
