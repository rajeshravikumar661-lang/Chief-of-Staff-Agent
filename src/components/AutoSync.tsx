"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";

const SESSION_FLAG = "cos-auto-synced";

/**
 * Silently pulls in Gmail/Calendar/Drive once per browser session, the
 * moment the dashboard loads — no button, no visible loading state. This
 * exists because connecting a Google account only grants access; nothing
 * previously called the sync endpoint automatically, so newly connected
 * accounts sat empty until a user found and clicked a manual button.
 * Renders nothing. Failures are swallowed — a stale dashboard is better
 * than a broken one, and the manual "Sync now" on /connections still
 * exists as a fallback and for re-syncing on demand.
 */
export function AutoSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;
    sessionStorage.setItem(SESSION_FLAG, "1");

    api
      .syncNow()
      .then(() => {
        mutate("today");
        mutate("connections");
        mutate("briefing-today");
      })
      .catch(() => {
        // Silent: no connected source, expired token, or a cold start.
        // The manual "Sync now" button on /connections covers retry.
      });
  }, [mutate]);

  return null;
}
