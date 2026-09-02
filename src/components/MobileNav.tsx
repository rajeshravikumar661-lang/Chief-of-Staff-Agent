"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/ui";
import { MORE_NAV } from "@/lib/nav";
import { useNavBadges } from "@/lib/useNavBadges";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChatIcon, NavIcon, SignOutIcon, type NavIconName } from "@/components/Icons";

const BAR_LEFT: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/inbox", label: "Inbox", icon: "mail" },
];
const BAR_RIGHT: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/planner", label: "Planner", icon: "calendar" },
];

function barItem(item: { href: string; label: string; icon: NavIconName }, active: boolean, count: number) {
  return (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition",
        active ? "text-brand-ink" : "text-ink-faint",
      )}
    >
      <span className="relative" aria-hidden>
        <NavIcon name={item.icon} className="h-5 w-5" />
        {count > 0 && <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      {item.label}
    </Link>
  );
}

/**
 * Fixed bottom nav for < lg. Five slots: Today, Inbox, a distinct central
 * "Ask" action (chat) in the true middle, Planner, and "More" which opens a
 * bottom sheet with everything else — never a long scrolling menu of every
 * page.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const badges = useNavBadges();

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  const moreActive = MORE_NAV.some((item) => isActive(item.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}

      {moreOpen && (
        <div
          role="dialog"
          aria-label="More"
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-hairline bg-paper pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-lg lg:hidden"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-hairline-strong" aria-hidden />
          <nav className="space-y-0.5 px-3 pb-2">
            {MORE_NAV.map((item) => {
              const count = item.href === "/activity" ? badges.activity : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition",
                    isActive(item.href) ? "bg-brand-soft font-medium text-brand-ink" : "text-ink-soft hover:bg-paper-raised",
                  )}
                >
                  <NavIcon name={item.icon} className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
            <ThemeToggle className="px-3 py-2.5" />
            <Link
              href="/api/auth/signout"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-faint hover:bg-paper-raised"
            >
              <SignOutIcon className="h-4 w-4 shrink-0" aria-hidden />
              Sign out
            </Link>
          </nav>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-hairline bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
        {BAR_LEFT.map((item) => barItem(item, isActive(item.href), 0))}

        <Link
          href="/chat"
          aria-label="Ask Kora"
          className="-mt-4 flex flex-1 flex-col items-center justify-end gap-0.5 pb-2 text-[11px] text-brand-ink"
        >
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-md transition",
              isActive("/chat") && "ring-2 ring-brand-soft",
            )}
            aria-hidden
          >
            <ChatIcon className="h-5 w-5" />
          </span>
          Ask
        </Link>

        {BAR_RIGHT.map((item) => barItem(item, isActive(item.href), item.href === "/planner" ? badges.planner : 0))}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More"
          aria-expanded={moreOpen}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition",
            moreOpen || moreActive ? "text-brand-ink" : "text-ink-faint",
          )}
        >
          <NavIcon name="more" className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
