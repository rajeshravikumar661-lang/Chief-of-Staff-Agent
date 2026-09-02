"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

export type TabItem = { href: string; label: string; badge?: number };

/** Pill-style sub-navigation for merged pages (Planner, Workspace, Activity, Settings). */
export function TabNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b border-hairline pb-3">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition",
              active ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-paper-raised",
            )}
          >
            {tab.label}
            {typeof tab.badge === "number" && tab.badge > 0 && (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
