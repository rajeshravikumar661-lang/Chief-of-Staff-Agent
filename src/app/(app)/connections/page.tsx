"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, ApiError } from "@/lib/api";
import { ConnectionCard } from "@/components/ConnectionCard";

const GOOGLE_PROVIDERS = new Set(["gmail", "calendar", "drive"]);

export default function ConnectionsPage() {
  const { data: connections, isLoading, mutate } = useSWR("connections", api.connections);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const google = connections?.filter((c) => GOOGLE_PROVIDERS.has(c.provider)) ?? [];
  const others = connections?.filter((c) => !GOOGLE_PROVIDERS.has(c.provider)) ?? [];
  const hasConnectedGoogle = google.some((c) => c.status === "connected");

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const counts = await api.syncNow();
      setSyncResult(
        `Pulled ${counts.gmail} emails, ${counts.calendar} calendar events, ${counts.drive} documents.`,
      );
      await mutate();
    } catch (e) {
      setSyncError(e instanceof ApiError ? e.message : "Sync failed. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Connections</h1>
          <p className="mt-1 text-sm text-ink-soft">
            One Google consent covers Gmail, Calendar, and Drive together — connect once to unlock all three.
          </p>
        </div>
        {hasConnectedGoogle && (
          <button
            onClick={syncNow}
            disabled={syncing}
            className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>

      {syncResult && <p className="mb-4 text-sm text-success">{syncResult}</p>}
      {syncError && <p className="mb-4 text-sm text-critical">{syncError}</p>}

      {isLoading && <p className="text-sm text-ink-soft">Loading connections…</p>}

      {connections && (
        <div className="space-y-8">
          {google.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Google</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {google.map((c) => (
                  <ConnectionCard key={c.provider} connection={c} onChange={() => mutate()} />
                ))}
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Coming soon</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((c) => (
                  <ConnectionCard key={c.provider} connection={c} onChange={() => mutate()} />
                ))}
              </div>
            </section>
          )}

          {connections.length === 0 && (
            <div className="rounded-lg border border-dashed border-hairline p-8 text-center">
              <p className="text-sm text-ink-soft">No connections available yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
