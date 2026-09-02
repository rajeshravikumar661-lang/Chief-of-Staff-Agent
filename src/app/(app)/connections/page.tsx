"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, ApiError } from "@/lib/api";
import { ConnectionCard } from "@/components/ConnectionCard";

const GOOGLE_PROVIDERS = new Set(["gmail", "calendar", "drive"]);
const M6_PROVIDERS = ["slack", "github", "notion", "linear"];

const PROVIDER_LABELS: Record<string, string> = {
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
  linear: "Linear",
  gworkspace: "Google Workspace",
};

export default function ConnectionsPage() {
  const { data: connections, isLoading, mutate } = useSWR("connections", api.connections);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const errored = searchParams.get("error");
    if (!connected && !errored) return;
    if (connected) {
      setBanner({ kind: "success", text: `${PROVIDER_LABELS[connected] ?? connected} connected.` });
    } else if (errored) {
      setBanner({
        kind: "error",
        text: `Couldn't finish connecting ${PROVIDER_LABELS[errored] ?? errored}. Try again.`,
      });
    }
    mutate();
    router.replace(pathname);
  }, [searchParams, router, pathname, mutate]);

  const google = connections?.filter((c) => GOOGLE_PROVIDERS.has(c.provider)) ?? [];
  const m6 =
    connections?.filter((c) => M6_PROVIDERS.includes(c.provider)) ??
    M6_PROVIDERS.map((provider) => ({
      provider,
      status: "disconnected" as const,
      scopes: [],
      connectedAt: null,
      lastSyncAt: null,
    }));
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

      {banner && (
        <p className={`mb-4 text-sm ${banner.kind === "success" ? "text-success" : "text-critical"}`}>
          {banner.text}
        </p>
      )}
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

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Integrations</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {m6.map((c) => (
                <ConnectionCard key={c.provider} connection={c} onChange={() => mutate()} />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              Google Workspace is covered by your Google connection above.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
