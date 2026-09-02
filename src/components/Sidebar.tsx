"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { PRIMARY_NAV, SETTINGS_NAV } from "@/lib/nav";
import { useNavBadges } from "@/lib/useNavBadges";

const BADGE_KEY: Record<string, "planner" | "activity"> = {
  "/planner": "planner",
  "/activity": "activity",
};

/**
 * Desktop-only sidebar (hidden below `lg`; mobile uses BottomNav instead).
 * Five primary items, flat — no expandable groups. Settings is pinned above
 * the profile/sign-out footer rather than mixed into the primary list.
 */
export function Sidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const badges = useNavBadges();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-hairline bg-paper lg:flex">
      <div className="px-4 py-5">
        <p className="font-serif text-lg font-semibold text-ink">Chief of Staff</p>
        {userName && <p className="mt-0.5 truncate text-xs text-ink-faint">{userName}</p>}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href);
          const count = BADGE_KEY[item.href] ? badges[BADGE_KEY[item.href]] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
                active ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-soft hover:bg-paper-raised hover:text-ink",
              )}
            >
              <span className="w-4 text-center text-ink-faint" aria-hidden>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-hairline p-2">
        <Link
          href={SETTINGS_NAV.href}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
            isActive(SETTINGS_NAV.href)
              ? "bg-brand-soft font-medium text-brand-ink"
              : "text-ink-soft hover:bg-paper-raised hover:text-ink",
          )}
        >
          <span className="w-4 text-center text-ink-faint" aria-hidden>
            {SETTINGS_NAV.icon}
          </span>
          {SETTINGS_NAV.label}
        </Link>
      </div>

      <div className="border-t border-hairline p-3">
        <Link href="/api/auth/signout" className="block rounded-md px-2.5 py-1.5 text-xs text-ink-faint hover:bg-paper-raised">
          Sign out
        </Link>
      </div>
    </aside>
  );
}
