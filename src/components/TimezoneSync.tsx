"use client";

import { useEffect, useRef } from "react";

/**
 * Detects the browser's IANA timezone on mount and, if it differs from the
 * timezone currently stored on the user's profile, persists it once via
 * PUT /api/settings/profile. Renders nothing.
 */
export function TimezoneSync({ currentTz }: { currentTz: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;

    let browserTz: string;
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!browserTz || browserTz === currentTz) return;

    sent.current = true;
    void fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: browserTz }),
    }).catch(() => {
      sent.current = false;
    });
  }, [currentTz]);

  return null;
}

export default TimezoneSync;
