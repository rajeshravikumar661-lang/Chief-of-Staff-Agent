"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { PRIMARY_NAV, SETTINGS_NAV } from "@/lib/nav";
import { useNavBadges } from "@/lib/useNavBadges";
import { NavIcon, SearchIcon, SignOutIcon } from "@/components/Icons";

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

const BADGE_KEY: Record<string, "planner" | "activity"> = {
  "/planner": "planner",
};

/**
 * Desktop-only horizontal nav (hidden below `lg`; mobile uses BottomNav
 * instead — see MobileNav). Kora wordmark, the three primary destinations,
 * a search entry point, and the account avatar — the Kora Desktop design's
 * top bar sitting directly on the dark canvas, no sidebar.
 */
export function TopNav({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const badges = useNavBadges();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <header className="sticky top-0 z-20 hidden border-b border-hairline bg-paper lg:block">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/today" className="font-hand text-2xl font-bold text-ink">
            Kora
          </Link>
          <nav className="flex items-center gap-6">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(item.href);
              const count = BADGE_KEY[item.href] ? badges[BADGE_KEY[item.href]] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 pb-1 text-[15px] font-medium transition",
                    active ? "text-ink" : "text-ink-faint hover:text-ink-soft",
                  )}
                >
                  {item.label}
                  {count > 0 && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -bottom-[9px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={SETTINGS_NAV.href}
            aria-label="Settings"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition",
              isActive(SETTINGS_NAV.href) ? "bg-brand-soft text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            <NavIcon name={SETTINGS_NAV.icon} className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition hover:text-ink"
          >
            <SearchIcon className="h-4.5 w-4.5" aria-hidden />
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-ink"
            title={userName ?? undefined}
          >
            {initialsOf(userName)}
          </div>
          <Link
            href="/api/auth/signout"
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint transition hover:text-ink"
          >
            <SignOutIcon className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
