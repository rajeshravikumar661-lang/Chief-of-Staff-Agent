"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/ui";
import { MoonIcon, SunIcon } from "@/components/Icons";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* private browsing / storage disabled — theme just won't persist */
  }
}

/**
 * Light is the default look (see globals.css); this is the only way to get
 * dark. State starts "light" on every render (matching what the server
 * sends) and is corrected in an effect after mount — reading localStorage
 * during render would desync from the server-rendered HTML and trigger a
 * hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft transition hover:bg-paper-raised hover:text-ink",
        className,
      )}
    >
      {dark ? (
        <MoonIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      ) : (
        <SunIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      )}
      <span className="flex-1 text-left">{dark ? "Dark mode" : "Light mode"}</span>
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full border border-hairline-strong transition-colors",
          dark ? "bg-brand" : "bg-paper-raised",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform",
            dark ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
