"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/ui";
import type { ConnectionDTO } from "@/lib/types";

const LABELS: Record<string, string> = {
  gmail: "Gmail",
  calendar: "Calendar",
  drive: "Drive",
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
  linear: "Linear",
  gworkspace: "Google Workspace",
};

const DESCRIPTIONS: Record<string, string> = {
  gmail: "Read + draft replies in your inbox.",
  calendar: "See your schedule and prep for meetings.",
  drive: "Search and reference your documents.",
  slack: "Bring channel context into briefings.",
  github: "Track PRs and issues assigned to you.",
  notion: "Reference pages and docs.",
  linear: "Track issues and cycles you own.",
  gworkspace: "Covered by your Google connection.",
};

export function ConnectionCard({ connection, onChange }: { connection: ConnectionDTO; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const { provider, status } = connection;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { redirectUrl } = await api.connect(provider);
      window.location.href = redirectUrl;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 501 || e.code === "NOT_CONFIGURED")) {
        setNotConfigured(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Could not start connection");
      }
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.disconnect(provider);
      onChange?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  const dot =
    status === "connected" ? "bg-success" : status === "error" ? "bg-critical" : "bg-ink-faint";
  const statusLabel =
    status === "connected" ? "Connected" : status === "error" ? "Needs reconnect" : "Not connected";

  return (
    <div className="rounded-lg border border-hairline bg-paper-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{LABELS[provider] ?? provider}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{DESCRIPTIONS[provider] ?? "Connect this provider."}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
          {statusLabel}
        </span>
      </div>

      {connection.connectedAt && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Connected {formatRelativeTime(connection.connectedAt)}
          {connection.lastSyncAt ? ` · last synced ${formatRelativeTime(connection.lastSyncAt)}` : ""}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}
      {notConfigured && (
        <p className="mt-2 text-xs text-ink-faint">Not configured on this server</p>
      )}

      <div className="mt-3">
        {status === "connected" ? (
          <button
            onClick={disconnect}
            disabled={busy}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-paper disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={busy || notConfigured}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Connecting…" : status === "error" ? "Reconnect" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
