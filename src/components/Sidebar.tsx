"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/audit-log", label: "Audit Log", icon: "≣" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ userName }: { userName?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-hairline bg-paper">
      <div className="px-4 py-5">
        <p className="font-serif text-lg font-semibold text-ink">Chief of Staff</p>
        {userName && <p className="mt-0.5 text-xs text-ink-faint">{userName}</p>}
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
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
  );
}
