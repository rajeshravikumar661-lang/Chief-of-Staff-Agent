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
 *
 * The session flag is only set on success. A failed attempt (cold start,
 * transient token/API error) is retried on the next dashboard load instead
 * of silently giving up for the rest of the browser session.
 */
export function AutoSync() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;

    api
      .syncNow()
      .then(() => {
        sessionStorage.setItem(SESSION_FLAG, "1");
        mutate("today");
        mutate("connections");
        mutate("briefing-today");
      })
      .catch(() => {
        // Silent: no connected source, expired token, or a cold start.
        // Flag stays unset, so this retries on the next dashboard load.
        // The manual "Sync now" button on /connections covers immediate retry.
      });
  }, [mutate]);

  return null;
}
