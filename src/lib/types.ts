/**
 * API CONTRACT TYPES — the seam with Person B (frontend).
 * Mirrors PERSON_A_AGENT_BACKEND.md §10. Contract version: v0.1.
 * If a shape changes here, bump the version and tell Person B.
 */

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type RunStatusDTO =
  | "pending"
  | "planning"
  | "in_progress"
  | "awaiting_approval"
  | "verifying"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export type StepStatusDTO =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "awaiting_approval"
  | "rejected"
  | "skipped";

export type PermissionLevel = "READ" | "DRAFT" | "WRITE" | "DESTRUCTIVE";

// --- GET /api/today ---------------------------------------------------------

export interface AgendaItem {
  time: string; // "09:30"
  title: string;
  eventId?: string;
}
export interface NeedsAttentionItem {
  id: string;
  text: string;
  priority: Priority;
  refUrl?: string;
}
export interface FollowUpItem {
  id: string;
  text: string;
  commitmentId?: string;
}
export interface SuggestedAction {
  id: string;
  label: string;
  actionType: string; // PREPARE_BRIEFING | DRAFT_REPLY | SUMMARIZE_PR | ...
  goal?: string; // natural-language goal to POST to /api/agent/runs
}
export interface TodayResponse {
  greeting: string;
  agenda: AgendaItem[];
  needsAttention: NeedsAttentionItem[];
  followUps: FollowUpItem[];
  suggestedActions: SuggestedAction[];
  recentRuns?: AgentRunSummaryDTO[];
}

// --- Agent runs -----------------------------------------------------------

export interface AgentStepDTO {
  id: string;
  index: number;
  tool: string | null;
  title: string;
  permission: PermissionLevel;
  status: StepStatusDTO;
  requiresApproval: boolean;
  summary: string | null;
  arguments?: unknown;
  result?: unknown;
  verification?: { verified: boolean; detail: string } | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}
export interface AgentRunDTO {
  id: string;
  goal: string;
  status: RunStatusDTO;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: AgentStepDTO[];
}
export interface AgentRunSummaryDTO {
  id: string;
  goal: string;
  status: RunStatusDTO;
  startedAt: string;
  completedAt: string | null;
  stepCount: number;
}

// SSE stream events (GET /api/agent/runs/:id/stream)
export type RunStreamEvent =
  | { type: "step"; step: AgentStepDTO }
  | { type: "plan"; steps: AgentStepDTO[] }
  | { type: "run_status"; status: RunStatusDTO; summary?: string }
  | { type: "run_complete"; run: AgentRunDTO }
  | { type: "error"; message: string };

// --- Connections --------------------------------------------------------

export interface ConnectionDTO {
  provider: string;
  status: "connected" | "disconnected" | "error";
  scopes: string[];
  connectedAt: string | null;
  lastSyncAt: string | null;
}

// --- Chat --------------------------------------------------------------

export interface ChatRequest {
  message: string;
  conversationId?: string;
}
export interface ChatResponse {
  reply: string;
  runId?: string;
  conversationId: string;
}

// --- Commitments / tasks / people / briefing --------------------------

export interface CommitmentDTO {
  id: string;
  person: string;
  description: string;
  deadline: string | null;
  source: string;
  sourceUrl: string | null;
  status: "open" | "done" | "cancelled" | "overdue";
  confidence: number;
  detectedAt: string;
}
export interface TaskDTO {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  priority: Priority;
  deadline: string | null;
  source: string | null;
}
export interface PersonDTO {
  id: string;
  name: string;
  email: string | null;
  org: string | null;
  importance: Priority;
  lastContactAt: string | null;
  openCommitments: CommitmentDTO[];
  upcomingMeetings: AgendaItem[];
  recentMessages: { id: string; subject: string | null; snippet: string | null; timestamp: string }[];
  documents: { id: string; title: string | null; url: string | null }[];
}
export interface BriefingItem {
  id: string;
  kind: "meeting" | "email" | "pr" | "commitment" | "task" | "follow_up";
  title: string;
  detail: string;
  priority: Priority;
  refUrl?: string;
  suggestedActions: SuggestedAction[];
}
export interface BriefingResponse {
  generatedAt: string;
  items: BriefingItem[];
}

// --- Search ----------------------------------------------------------

export interface SearchResponse {
  messages: { id: string; subject: string | null; snippet: string | null; timestamp: string }[];
  documents: { id: string; title: string | null; url: string | null; snippet: string | null }[];
  events: { id: string; title: string | null; startTime: string }[];
  people: { id: string; name: string; email: string | null }[];
}

export interface ApiError {
  error: { code: string; message: string };
}
