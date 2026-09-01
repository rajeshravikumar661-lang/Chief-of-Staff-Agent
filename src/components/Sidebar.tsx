"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/today", label: "Today", icon: "☀" },
  { href: "/inbox", label: "Inbox", icon: "✉" },
  { href: "/calendar", label: "Calendar", icon: "▤" },
  { href: "/tasks", label: "Tasks", icon: "☑" },
  { href: "/commitments", label: "Commitments", icon: "◈" },
  { href: "/people", label: "People", icon: "◍" },
  { href: "/documents", label: "Documents", icon: "▣" },
  { href: "/agent-runs", label: "Agent Runs", icon: "⟡" },
  { href: "/connections", label: "Connections", icon: "⇄" },
  { href: "/whatsapp", label: "WhatsApp", icon: "▨" },
  { href: "/audit-log", label: "Audit Log", icon: "≣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on route change so it never stays open behind a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar — sidebar lives off-canvas below lg, opened from here. */}
      <div className="flex items-center justify-between border-b border-hairline bg-paper px-4 py-3 lg:hidden">
        <p className="font-serif text-lg font-semibold text-ink">Chief of Staff</p>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md border border-hairline-strong px-2.5 py-1.5 text-sm text-ink-soft"
        >
          ☰
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 -translate-x-full flex-col border-r border-hairline bg-paper transition-transform duration-200",
          "lg:static lg:z-auto lg:w-56 lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          <div>
            <p className="font-serif text-lg font-semibold text-ink">Chief of Staff</p>
            {userName && <p className="mt-0.5 text-xs text-ink-faint">{userName}</p>}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-md px-2 py-1 text-ink-faint lg:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-hairline p-3">
          <Link href="/api/auth/signout" className="block rounded-md px-2.5 py-1.5 text-xs text-ink-faint hover:bg-paper-raised">
            Sign out
          </Link>
        </div>
      </aside>
    </>
  );
}
