"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import { ConnectionCard } from "@/components/ConnectionCard";
import type { ConnectionDTO } from "@/lib/types";

const GOOGLE_PROVIDERS = new Set(["gmail", "calendar", "drive"]);

export default function ConnectionsPage() {
  const { data: connections, isLoading, mutate } = useSWR("connections", api.connections);

  const google = connections?.filter((c) => GOOGLE_PROVIDERS.has(c.provider)) ?? [];
  const others = connections?.filter((c) => !GOOGLE_PROVIDERS.has(c.provider)) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-ink">Connections</h1>
        <p className="mt-1 text-sm text-ink-soft">
          One Google consent covers Gmail, Calendar, and Drive together — connect once to unlock all three.
        </p>
      </div>

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
