/**
 * Demo mode in-memory store — all state is module-level singletons that
 * reset on page reload (fine for a dev-only demo).
 */

import {
  fixtureToday,
  fixtureBriefing,
  fixtureConnections,
  fixtureCommitments,
  fixtureTasks,
  fixturePeople,
  fixtureSearchResults,
  fixtureAuditLogs,
  buildDemoRun,
} from "@/lib/fixtures";
import type {
  AgentRunDTO,
  AgentRunSummaryDTO,
  BriefingResponse,
  CommitmentDTO,
  ConnectionDTO,
  PersonDTO,
  SearchResponse,
  TaskDTO,
  TodayResponse,
} from "@/lib/types";

// ============================================================================
// Module-level state
// ============================================================================

const runs = new Map<string, AgentRunDTO>();
const runSubscribers = new Map<string, Set<(run: AgentRunDTO) => void>>();

// Initialize runs from fixtures (recentRuns with steps: [])
if (fixtureToday.recentRuns) {
  for (const summary of fixtureToday.recentRuns) {
    runs.set(summary.id, {
      id: summary.id,
      goal: summary.goal,
      status: summary.status,
      summary: null,
      startedAt: summary.startedAt,
      completedAt: summary.completedAt,
      steps: [], // Seeded rows don't have step details
    });
  }
}

// ============================================================================
// Pub-sub helpers
// ============================================================================

function notifySubscribers(runId: string): void {
  const run = runs.get(runId);
  if (!run) return;
  const callbacks = runSubscribers.get(runId);
  if (callbacks) {
    // Clone so React sees a new reference every time — the store mutates
    // run/step objects in place, and setState bails out on an Object.is-equal
    // value, which would otherwise make live updates silently stop rendering.
    const snapshot: AgentRunDTO = { ...run, steps: run.steps.map((s) => ({ ...s })) };
    callbacks.forEach((cb) => cb(snapshot));
  }
}

// ============================================================================
// Public API
// ============================================================================

export const demoStore = {
  // Today & briefing
  getToday(): TodayResponse {
    return fixtureToday;
  },

  getBriefing(): BriefingResponse {
    return fixtureBriefing;
  },

  regenerateBriefing(): BriefingResponse {
    return {
      ...fixtureBriefing,
      generatedAt: new Date().toISOString(),
    };
  },

  // Connections
  listConnections(): ConnectionDTO[] {
    return [...fixtureConnections];
  },

  connectProvider(provider: string): ConnectionDTO | null {
    const conn = fixtureConnections.find((c) => c.provider === provider);
    if (!conn) return null;
    conn.status = "connected";
    conn.connectedAt = new Date().toISOString();
    conn.lastSyncAt = new Date().toISOString();
    // Set plausible scopes based on provider
    if (provider === "slack") {
      conn.scopes = ["chat:read", "users:read", "channels:read"];
    } else if (provider === "github") {
      conn.scopes = ["repo:status", "repo_deployment", "public_repo"];
    } else if (provider === "notion") {
      conn.scopes = ["read", "write"];
    }
    return { ...conn };
  },

  disconnectProvider(provider: string): ConnectionDTO | null {
    const conn = fixtureConnections.find((c) => c.provider === provider);
    if (!conn) return null;
    conn.status = "disconnected";
    conn.scopes = [];
    conn.connectedAt = null;
    conn.lastSyncAt = null;
    return { ...conn };
  },

  // Commitments
  listCommitments(status?: string): CommitmentDTO[] {
    if (status) {
      return fixtureCommitments.filter((c) => c.status === status);
    }
    return [...fixtureCommitments];
  },

  updateCommitment(
    id: string,
    patch: { status?: string; deadline?: string | null; description?: string }
  ): CommitmentDTO {
    const commitment = fixtureCommitments.find((c) => c.id === id);
    if (!commitment) {
      throw new Error(`Commitment ${id} not found`);
    }
    Object.assign(commitment, patch);
    return { ...commitment };
  },

  // Tasks
  listTasks(status?: string): TaskDTO[] {
    if (status) {
      return fixtureTasks.filter((t) => t.status === status);
    }
    return [...fixtureTasks];
  },

  // People
  getPerson(id: string): PersonDTO {
    const person = fixturePeople.find((p) => p.id === id);
    if (!person) {
      // Return a fallback person if not found
      return {
        id,
        name: "Unknown person",
        email: null,
        org: null,
        importance: "LOW",
        lastContactAt: null,
        openCommitments: [],
        upcomingMeetings: [],
        recentMessages: [],
        documents: [],
      };
    }
    return { ...person };
  },

  // Search
  search(_q: string): SearchResponse {
    // In demo mode, return the same results regardless of query
    return fixtureSearchResults;
  },

  // Audit logs
  listAuditLogs(runId?: string): {
    id: string;
    action: string;
    tool: string | null;
    runId: string | null;
    stepId: string | null;
    result: unknown;
    timestamp: string;
  }[] {
    if (runId) {
      return fixtureAuditLogs.filter((log) => log.runId === runId);
    }
    return [...fixtureAuditLogs];
  },

  // Run management
  listRuns(): AgentRunSummaryDTO[] {
    const summaries: AgentRunSummaryDTO[] = [];
    const idsInOrder = Array.from(runs.keys()).sort((a, b) => {
      const runA = runs.get(a)!;
      const runB = runs.get(b)!;
      return new Date(runB.startedAt).getTime() - new Date(runA.startedAt).getTime();
    });
    for (const id of idsInOrder) {
      const run = runs.get(id)!;
      summaries.push({
        id: run.id,
        goal: run.goal,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        stepCount: run.steps.length,
      });
    }
    return summaries;
  },

  getRun(id: string): AgentRunDTO | null {
    const run = runs.get(id);
    return run ? { ...run, steps: run.steps.map((s) => ({ ...s })) } : null;
  },

  subscribeRun(id: string, cb: (run: AgentRunDTO) => void): () => void {
    if (!runSubscribers.has(id)) {
      runSubscribers.set(id, new Set());
    }
    runSubscribers.get(id)!.add(cb);
    return () => {
      runSubscribers.get(id)?.delete(cb);
    };
  },

  createRun(goal: string): { runId: string } {
    const run = buildDemoRun(goal);
    runs.set(run.id, run);
    notifySubscribers(run.id);

    // Fire-and-forget simulation
    (async () => {
      await simulateRun(run.id);
    })();

    return { runId: run.id };
  },

  approveStep(runId: string, stepId: string): AgentRunDTO {
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    const step = run.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }
    if (step.status !== "awaiting_approval") {
      throw new Error(`Step not awaiting approval`);
    }

    step.status = "succeeded";
    step.finishedAt = new Date().toISOString();
    step.verification = { verified: true, detail: "Verified: email sent to recipient" };
    notifySubscribers(runId);

    // After a short delay, mark the run as succeeded
    setTimeout(() => {
      const updated = runs.get(runId);
      if (updated) {
        updated.status = "succeeded";
        updated.completedAt = new Date().toISOString();
        updated.summary = "Completed — drafted and sent follow-up email";
        notifySubscribers(runId);
      }
    }, 500);

    return { ...run };
  },

  rejectStep(runId: string, stepId: string): AgentRunDTO {
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    const step = run.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }
    if (step.status !== "awaiting_approval") {
      throw new Error(`Step not awaiting approval`);
    }

    step.status = "rejected";
    run.status = "partial";
    run.completedAt = new Date().toISOString();
    run.summary = "Stopped — follow-up email was not sent";
    notifySubscribers(runId);

    return { ...run };
  },

  cancelRun(runId: string): { ok: true } {
    const run = runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    run.status = "cancelled";
    run.completedAt = new Date().toISOString();
    notifySubscribers(runId);
    return { ok: true };
  },
};

// ============================================================================
// Simulation helper
// ============================================================================

async function simulateRun(runId: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;

  const summaries = [
    "Found Acme investor meeting scheduled for today at 11:00",
    "Found 6 relevant emails from investor discussions",
    "Found 2 key documents: Q3 metrics and Acme agreement",
    "Generated briefing summary with 5 key items",
    "Drafted follow-up email — ready for review",
  ];

  // Process steps 0-3 (non-final steps)
  for (let i = 0; i < 4; i++) {
    const step = run.steps[i];
    if (!step) continue;

    // Wait and start the step
    await delay(600 + Math.random() * 500);
    step.status = "running";
    step.startedAt = new Date().toISOString();
    notifySubscribers(runId);

    // Wait and complete the step
    await delay(600 + Math.random() * 300);
    step.status = "succeeded";
    step.finishedAt = new Date().toISOString();
    step.summary = summaries[i];
    notifySubscribers(runId);
  }

  // Update run to "in_progress" while steps are running
  run.status = "in_progress";
  notifySubscribers(runId);

  // Process the final step (step 4)
  const finalStep = run.steps[4];
  if (finalStep) {
    await delay(600 + Math.random() * 500);
    finalStep.status = "running";
    finalStep.startedAt = new Date().toISOString();
    notifySubscribers(runId);

    await delay(600 + Math.random() * 300);
    finalStep.status = "awaiting_approval";
    finalStep.finishedAt = null; // Not finished until approved/rejected
    finalStep.summary = "Drafted follow-up email — ready for review";
    run.status = "awaiting_approval";
    notifySubscribers(runId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
