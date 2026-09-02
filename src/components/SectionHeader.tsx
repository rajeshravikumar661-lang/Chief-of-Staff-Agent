import { cn } from "@/lib/ui";

/** Small uppercase section label with an optional count badge — used across /today's sections. */
export function SectionHeader({ title, count, tone = "quiet" }: { title: string; count?: number; tone?: "quiet" | "warm" }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-faint">{title}</h2>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            tone === "warm" ? "bg-accent-soft text-accent" : "bg-paper-raised text-ink-soft",
          )}
        >
          {count}
        </span>
      )}
    </div>
  );
}
