import { cn } from "@/lib/ui";

/**
 * Section label as a coffee "in-tray" band with a typewriter caption — the
 * "IN-TRAY — 3 LETTERS" strip from the desk design. An optional count badge
 * rides on the right.
 */
export function SectionHeader({ title, count, tone = "quiet" }: { title: string; count?: number; tone?: "quiet" | "warm" }) {
  return (
    <div className="desk-band mb-3 flex items-center justify-between gap-2 px-3 py-1.5">
      <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.09em] text-[color:var(--color-band-ink)]">
        {title}
      </h2>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            tone === "warm"
              ? "bg-accent-soft text-accent"
              : "bg-[color:var(--color-band-ink)]/20 text-[color:var(--color-band-ink)]",
          )}
        >
          {count}
        </span>
      )}
    </div>
  );
}
