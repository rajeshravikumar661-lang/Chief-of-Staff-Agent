/**
 * lib/api.ts — the seam. One function per endpoint in the API contract
 * (src/lib/types.ts, mirrored in PERSON_A_AGENT_BACKEND.md §7 / §10).
 * Every component calls through here — never a raw fetch() in a page.
 *
 * In dev-only demo mode (see src/lib/demo.ts), `api` is swapped for
 * src/lib/demoApi.ts, a same-shaped implementation backed by in-memory
 * fixtures instead of fetch(). The swap happens once, here, so no page or
 * component needs to know which one it's talking to. This can never affect
 * a production build — see the guard in src/lib/demo.ts.
 */
import { DEMO_MODE } from "@/lib/demo";
import { demoApi } from "@/lib/demoApi";
import type {
  AgentRunDTO,
  AgentRunSummaryDTO,
  BriefingResponse,
  ChatResponse,
  CommitmentDTO,
  ConnectionDTO,
  PersonDTO,
  SearchResponse,
  TaskDTO,
  TodayResponse,
} from "@/lib/types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message, res.status);
  }
  return res.json() as Promise<T>;
}

const realApi = {
  me: () => request<{ id: string; name: string | null; email: string | null; image: string | null }>("/api/me"),

  today: () => request<TodayResponse>("/api/today"),

  connections: () => request<ConnectionDTO[]>("/api/connections"),
  connect: (provider: string) =>
    request<{ redirectUrl: string }>(`/api/connections/${provider}/connect`, { method: "POST" }),
  disconnect: (provider: string) =>
    request<{ ok: true }>(`/api/connections/${provider}/disconnect`, { method: "POST" }),

  chat: (message: string, conversationId?: string) =>
    request<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ message, conversationId }) }),

  createRun: (goal: string) => request<{ runId: string }>("/api/agent/runs", { method: "POST", body: JSON.stringify({ goal }) }),
  listRuns: () => request<AgentRunSummaryDTO[]>("/api/agent/runs"),
  getRun: (id: string) => request<AgentRunDTO>(`/api/agent/runs/${id}`),
  cancelRun: (id: string) => request<{ ok: true }>(`/api/agent/runs/${id}/cancel`, { method: "POST" }),
  approveStep: (runId: string, stepId: string) =>
    request<AgentRunDTO>(`/api/agent/runs/${runId}/steps/${stepId}/approve`, { method: "POST" }),
  rejectStep: (runId: string, stepId: string) =>
    request<AgentRunDTO>(`/api/agent/runs/${runId}/steps/${stepId}/reject`, { method: "POST" }),
  runStreamUrl: (id: string) => `/api/agent/runs/${id}/stream`,

  commitments: (status?: string) =>
    request<CommitmentDTO[]>(`/api/commitments${status ? `?status=${status}` : ""}`),
  updateCommitment: (id: string, patch: { status?: string; deadline?: string | null; description?: string }) =>
    request<CommitmentDTO>(`/api/commitments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  person: (id: string) => request<PersonDTO>(`/api/people/${id}`),

  tasks: (status?: string) => request<TaskDTO[]>(`/api/tasks${status ? `?status=${status}` : ""}`),

  briefingToday: () => request<BriefingResponse>("/api/briefing/today"),
  briefingGenerate: () => request<BriefingResponse>("/api/briefing/generate", { method: "POST" }),

  search: (q: string) => request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),

  auditLogs: (runId?: string) =>
    request<
      { id: string; action: string; tool: string | null; runId: string | null; stepId: string | null; result: unknown; timestamp: string }[]
    >(`/api/audit-logs${runId ? `?runId=${runId}` : ""}`),
};

export const api: typeof realApi = DEMO_MODE ? demoApi : realApi;
