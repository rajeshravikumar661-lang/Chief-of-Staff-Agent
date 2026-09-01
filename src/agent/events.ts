import { EventEmitter } from "node:events";
import type { RunStreamEvent } from "@/lib/types";

/**
 * In-process pub/sub for agent run updates → SSE (spec §10.4, §25).
 * The DB row is the source of truth; these events are a latency optimization.
 * For multi-instance deploys, back this with Redis pub/sub later.
 */
class RunBus extends EventEmitter {
  emitRun(runId: string, ev: RunStreamEvent) {
    this.emit(runId, ev);
  }
  onRun(runId: string, fn: (ev: RunStreamEvent) => void) {
    this.on(runId, fn);
    return () => this.off(runId, fn);
  }
}

const globalForBus = globalThis as unknown as { runBus?: RunBus };
export const runBus = globalForBus.runBus ?? new RunBus();
runBus.setMaxListeners(0);
if (process.env.NODE_ENV !== "production") globalForBus.runBus = runBus;
