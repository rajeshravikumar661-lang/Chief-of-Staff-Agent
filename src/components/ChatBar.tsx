"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

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
        "fixed bottom-5 right-5 flex items-center gap-2 rounded-full border border-hairline-strong bg-paper-raised px-4 py-2.5 text-sm text-ink-soft shadow-sm transition hover:text-ink hover:shadow-md",
      )}
    >
      <span aria-hidden>💬</span>
      Ask your Chief of Staff
    </Link>
  );
}
