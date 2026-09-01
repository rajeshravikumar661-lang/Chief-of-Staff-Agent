"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { whatsappApi, type WhatsAppStatus } from "@/lib/whatsapp-api";

/**
 * Link your WhatsApp: tap Connect → scan the QR from WhatsApp → Linked devices.
 * Once linked, the daily digest is sent to your own number.
 */
export function WhatsAppConnect() {
  const [state, setState] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await whatsappApi.status());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed to load status");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [refresh]);

  // While a QR is showing (or we're mid-connect), poll until connected.
  useEffect(() => {
    const s = state?.status;
    if (s === "qr" || s === "connecting") {
      if (!poll.current) poll.current = setInterval(() => void refresh(), 2500);
    } else if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  }, [state?.status, refresh]);

  const startPairing = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await whatsappApi.pair();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "could not start pairing");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await whatsappApi.unlink();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await whatsappApi.test();
      setMsg("Sent — check WhatsApp.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "send failed");
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return <div className="rounded-lg border border-line bg-paper-raised p-4 text-sm text-ink-soft">Loading…</div>;
  }

  if (!state.enabled) {
    return (
      <div className="rounded-lg border border-line bg-paper-raised p-4 text-sm text-ink-soft">
        WhatsApp delivery is turned off on this server (<code>WHATSAPP_ENABLED</code>).
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-paper-raised p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink">WhatsApp digest</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Get your morning brief — agenda, what needs attention, replies you owe — on WhatsApp.
          </p>
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (state.status === "connected"
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800")
          }
        >
          {state.status === "connected" ? "Connected" : state.status}
        </span>
      </div>

      <div className="mt-4">
        {state.status === "connected" ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Linked to <span className="font-medium">+{state.number}</span>. The digest lands in your
              own chat every morning.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={sendTest}
                disabled={busy}
                className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
              >
                Send a test now
              </button>
              <button
                onClick={unlink}
                disabled={busy}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft disabled:opacity-50"
              >
                Unlink
              </button>
            </div>
          </div>
        ) : state.qrDataUrl ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.qrDataUrl}
              alt="WhatsApp linking QR code"
              width={220}
              height={220}
              className="rounded-md border border-line bg-white p-2"
            />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>Open WhatsApp on your phone.</li>
              <li>
                <span className="text-ink">Settings → Linked devices → Link a device</span>
              </li>
              <li>Point it at this code.</li>
              <li>Waiting for scan… this updates automatically.</li>
            </ol>
          </div>
        ) : state.status === "connecting" ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">Reconnecting to WhatsApp… this updates automatically.</p>
            <button
              onClick={startPairing}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft disabled:opacity-50"
            >
              {busy ? "Working…" : "Re-link instead"}
            </button>
          </div>
        ) : (
          <button
            onClick={startPairing}
            disabled={busy}
            className="rounded-md bg-ink px-3.5 py-2 text-sm text-paper disabled:opacity-50"
          >
            {busy ? "Starting…" : "Connect WhatsApp"}
          </button>
        )}
      </div>

      {msg && <p className="mt-3 text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
