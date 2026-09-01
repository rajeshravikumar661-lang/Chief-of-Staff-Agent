"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { demoStore } from "@/lib/demoStore";
import type { AgentRunDTO, AgentStepDTO, RunStreamEvent } from "@/lib/types";

/**
 * Drives the run timeline off the SSE stream (contract §agent/runs/:id/stream).
 * Reducer keyed by step.id, per PERSON_B spec §7.4: update in place, never
 * re-fetch the whole run on every event. On stream error/close, falls back to
 * one GET so the final state always matches the server.
 *
 * In demo mode there's no server to stream from, so this subscribes directly
 * to the in-memory demoStore's pub-sub instead of opening an EventSource —
 * same external behavior (run state updates live), no network involved.
 */
export function useAgentRunStream(runId: string | null, initial?: AgentRunDTO) {
  const [run, setRun] = useState<AgentRunDTO | null>(initial ?? null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    if (DEMO_MODE) {
      setRun(demoStore.getRun(runId));
      setConnected(true);
      const unsubscribe = demoStore.subscribeRun(runId, (r) => setRun(r));
      return unsubscribe;
    }

    let cancelled = false;

    api
      .getRun(runId)
      .then((r) => {
        if (!cancelled) setRun(r);
      })
      .catch(() => void 0);

    const es = new EventSource(api.runStreamUrl(runId));
    sourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (ev) => {
      let parsed: RunStreamEvent;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      applyEvent(parsed);
    };

    es.onerror = () => {
      setConnected(false);
    };

    function upsertStep(step: AgentStepDTO) {
      setRun((prev) => {
        if (!prev) return prev;
        const idx = prev.steps.findIndex((s) => s.id === step.id);
        const steps =
          idx === -1 ? [...prev.steps, step].sort((a, b) => a.index - b.index) : prev.steps.map((s) => (s.id === step.id ? step : s));
        return { ...prev, steps };
      });
    }

    function applyEvent(ev: RunStreamEvent) {
      if (ev.type === "plan") {
        setRun((prev) => (prev ? { ...prev, steps: ev.steps } : prev));
      } else if (ev.type === "step") {
        upsertStep(ev.step);
      } else if (ev.type === "run_status") {
        setRun((prev) => (prev ? { ...prev, status: ev.status, summary: ev.summary ?? prev.summary } : prev));
      } else if (ev.type === "run_complete") {
        setRun(ev.run);
        es.close();
      } else if (ev.type === "error") {
        es.close();
      }
    }

    return () => {
      cancelled = true;
      es.close();
      sourceRef.current = null;
    };
  }, [runId]);

  return { run, connected };
}
