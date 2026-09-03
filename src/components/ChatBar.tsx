"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import { ChatIcon } from "@/components/Icons";

/**
 * Persistent but de-emphasized chat entry point (spec §5: "a control
 * surface, not the product"). Lives in the authed shell so it's reachable
 * from every screen without becoming the visual centerpiece.
 */
export function ChatBar() {
  const pathname = usePathname();
  const onChat = pathname === "/chat";
  if (onChat) return null;

  return (
    <Link
      href="/chat"
      className={cn(
        "fixed bottom-5 right-5 z-30 hidden items-center gap-2.5 rounded-full border border-hairline-strong bg-kraft-soft px-4 py-2.5 text-sm font-medium text-ink shadow-lg transition hover:border-ink-faint lg:flex",
      )}
    >
      <ChatIcon className="h-4 w-4" aria-hidden />
      Ask Kora
      <kbd className="rounded border border-hairline-strong bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
        ⌘K
      </kbd>
    </Link>
  );
}
