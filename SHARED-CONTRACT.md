# SHARED CONTRACT — the merge point

> **Owned by both.** Every change here is a PR that *both* people review before merge.
> This file is the only place where Workstream A (backend/agent) and Workstream B
> (frontend/product) are allowed to disagree — resolve it here, then both sides code to it.
>
> Rule of thumb: **if you need something from the other person, add it here first as a
> stub, get a 👍, then build against the stub.** Neither side waits on the other.

---

## 1. Repo layout & ownership map

Single Next.js (App Router) app. One `package.json`. Ownership is by directory so merges
almost never collide.

```
/app
  /(marketing)          B      landing, sign-in, sign-up
  /(app)                B      authed shell + every screen (Today, Inbox, Calendar,
                               Tasks, Commitments, People, Documents, Agent Runs,
                               Connections, Settings, Chat)
  /api                  A      ALL route handlers (see §3)
/components              B      all React components + design system
/lib
  /contracts            BOTH   zod schemas + inferred TS types = source of truth (§2)
  /agent                A      orchestrator, planner, retriever, action-manager, verifier
  /integrations         A      gmail / calendar / drive / slack / github / notion connectors
  /llm                  A      LLMProvider abstraction (Claude, OpenAI, …)
  /memory               A      short-term / long-term / work memory stores
  /jobs                 A      queue + workers (briefing, sync, reminders)
  /priority             A      priority engine, commitment detection, relationship intel
  /db                   A      prisma client + repositories
  /auth                 A      Auth.js config, session helper
  /api-client           B      typed fetch wrappers + React Query hooks (consumes §3)
  /ui                   B      cn(), hooks, formatting helpers
/prisma                 A      schema.prisma, migrations, seed
/docs                   BOTH   architecture.md, security.md, agent-tools.md, database.md, roadmap.md
/CLAUDE.md              BOTH   permanent engineering rules
```

**Do-not-touch rule:** A never edits `/app/(app)` or `/components`. B never edits
`/app/api`, `/lib/agent`, `/lib/integrations`, `/prisma`. Both edit `/lib/contracts`
only via reviewed PR.

---

## 2. `/lib/contracts` — the type source of truth

All request/response bodies and all shared domain objects are **zod schemas**; TS types
are `z.infer`. Frontend imports types only; backend imports schemas for validation.

```
/lib/contracts
  index.ts            re-exports everything
  enums.ts            PermissionLevel, RunStatus, StepStatus, Priority, Provider, CommitmentStatus
  entities.ts         Connection, AgentRun, AgentStep, ProposedAction, Commitment, Person,
                      Task, DocumentRef, Message, CalendarEvent, MemoryItem, AuditLogEntry
  api.ts              one Request/Response pair per endpoint in §3
  events.ts           SSE event payloads (§4)
```

### Enums (frozen — adding values is fine, renaming is a breaking PR)

```ts
PermissionLevel = "READ_ONLY" | "DRAFT" | "WRITE" | "DESTRUCTIVE"
RunStatus       = "planning" | "awaiting_approval" | "executing" | "verifying" | "done" | "failed" | "cancelled"
StepStatus      = "pending" | "running" | "succeeded" | "failed" | "skipped" | "awaiting_approval" | "rejected"
Priority        = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
Provider        = "google" | "gmail" | "calendar" | "drive" | "slack" | "github" | "notion"
CommitmentStatus= "open" | "done" | "cancelled" | "overdue"
```

### Core entity shapes (fields both sides rely on — backend may add more)

```ts
Connection      { provider: Provider; status: "connected" | "disconnected" | "error";
                  scopes: string[]; connectedAt: string | null; lastSyncAt: string | null }

AgentRun        { id; goal: string; status: RunStatus; summary: string | null;
                  createdAt; completedAt: string | null; steps: AgentStep[] }

AgentStep       { id; runId; index: number; title: string; tool: string | null;
                  permission: PermissionLevel; status: StepStatus;
                  input: unknown; output: unknown | null;
                  requiresApproval: boolean; approvalDecision: "approve" | "reject" | null;
                  startedAt: string | null; finishedAt: string | null;
                  verification: { ok: boolean; detail: string } | null }

ProposedAction  { id; runId; label: string; tool: string; permission: PermissionLevel;
                  preview: string;              // human-readable diff/summary
                  payload: unknown;             // exact tool input, already validated
                  status: "proposed" | "approved" | "rejected" | "executed" | "verified" | "failed" }

Commitment      { id; person: string; personId: string | null; description: string;
                  deadline: string | null; source: string; sourceUrl: string | null;
                  status: CommitmentStatus; confidence: number; detectedAt: string }

Person          { id; name; email: string | null; org: string | null;
                  importance: Priority; lastContactAt: string | null;
                  openCommitments: number; nextMeetingAt: string | null }

Task            { id; title; status: "todo" | "doing" | "done"; priority: Priority;
                  deadline: string | null; source: string }

DocumentRef     { id; provider: Provider; externalId; title; url; snippet: string | null;
                  updatedAt }

Message         { id; provider: Provider; externalId; sender; recipients: string[];
                  subject; snippet; timestamp; unread: boolean; threadId }

CalendarEvent   { id; externalId; title; start; end; attendees: string[];
                  location: string | null; conferenceUrl: string | null }

BriefingItem    { id; kind: "meeting" | "email" | "pr" | "commitment" | "task" | "follow_up";
                  title; detail: string; priority: Priority;
                  suggestedActions: SuggestedAction[]; refUrl: string | null }

SuggestedAction { id; label: string; goal: string }   // clicking = POST /api/agent/runs { goal }
```

All timestamps are ISO-8601 UTC strings. All ids are strings (cuid).

---

## 3. HTTP API (all under `/app/api`, all return JSON, all require session unless noted)

Standard error envelope for every non-2xx:
`{ error: { code: string; message: string; details?: unknown } }`

| Method & path | Body → Response | Notes |
|---|---|---|
| `GET /api/health` | → `{ ok: true }` | no auth |
| `GET /api/me` | → `{ id, name, email, image }` | from session |
| `GET /api/connections` | → `Connection[]` | one row per connectable provider, connected or not |
| `GET /api/connections/:provider/authorize` | → `302` to provider OAuth | browser navigation, not fetch |
| `POST /api/connections/:provider/disconnect` | → `{ ok: true }` | revokes + deletes tokens |
| `GET /api/today` | → `TodayPayload` (§3.1) | the dashboard in one call |
| `GET /api/briefing/latest` | → `{ generatedAt; items: BriefingItem[] } \| null` | today's brief |
| `POST /api/briefing/run` | → `{ generatedAt; items: BriefingItem[] }` | manual trigger (dev + "refresh" button) |
| `POST /api/agent/runs` | `{ goal: string }` → `{ runId: string }` | starts a run async |
| `GET /api/agent/runs` | → `AgentRun[]` (no steps, newest first) | list for Agent Runs screen |
| `GET /api/agent/runs/:id` | → `AgentRun` (with steps) | full detail |
| `GET /api/agent/runs/:id/events` | → **SSE** stream (§4) | live timeline |
| `POST /api/agent/runs/:id/actions/:actionId` | `{ decision: "approve" \| "reject" }` → `ProposedAction` | human-in-the-loop gate |
| `POST /api/agent/runs/:id/cancel` | → `{ ok: true }` | stop a run |
| `POST /api/chat` | `{ message: string; conversationId?: string }` → **SSE** (§4) | may emit a `run_started` event |
| `GET /api/chat/:conversationId` | → `{ messages: {role, content, runId?}[] }` | history |
| `GET /api/commitments` | `?status=` → `Commitment[]` | |
| `PATCH /api/commitments/:id` | `{ status?; deadline?; description? }` → `Commitment` | |
| `GET /api/people` | `?q=` → `Person[]` | |
| `GET /api/people/:id` | → `Person & { recentMessages: Message[]; documents: DocumentRef[]; commitments: Commitment[]; meetings: CalendarEvent[] }` | relationship view |
| `GET /api/tasks` | `?status=` → `Task[]` | |
| `GET /api/documents` | `?q=` → `DocumentRef[]` | |
| `GET /api/messages` | `?q=&unread=` → `Message[]` | inbox view |
| `GET /api/calendar/events` | `?from=&to=` → `CalendarEvent[]` | |
| `GET /api/search` | `?q=` → `{ messages: Message[]; documents: DocumentRef[]; events: CalendarEvent[]; people: Person[] }` | cross-source |
| `GET /api/audit` | `?runId=` → `AuditLogEntry[]` | "what the agent did" |

### 3.1 `TodayPayload`

```ts
TodayPayload {
  greeting: string                 // "Good morning, Mohin"
  date: string
  agenda: CalendarEvent[]          // today, sorted
  needsAttention: BriefingItem[]   // ranked, priority CRITICAL/HIGH first
  commitments: Commitment[]        // open, soonest deadline first
  people: Person[]                 // people with something pending today
  suggestedActions: SuggestedAction[]
  recentRuns: AgentRun[]           // last 5, no steps
}
```

---

## 4. SSE event stream (agent runs + chat)

`Content-Type: text/event-stream`. Each event: `event: <type>\ndata: <json>\n\n`.
Schemas live in `/lib/contracts/events.ts`.

| event | data | meaning |
|---|---|---|
| `run_started` | `{ runId; goal }` | (chat only) a run was spun up from the message |
| `plan` | `{ runId; steps: {index,title,tool,permission}[] }` | planner finished |
| `step_update` | `AgentStep` | any step changed state |
| `action_proposed` | `ProposedAction` | needs approve/reject before it runs |
| `action_resolved` | `ProposedAction` | user decided, or it executed + verified |
| `message` | `{ role: "assistant"; content: string; delta: boolean }` | chat token / final |
| `run_status` | `{ runId; status: RunStatus; summary?: string }` | run-level transition |
| `error` | `{ message: string }` | fatal for this stream |
| `done` | `{}` | stream closed normally |

Frontend contract: the timeline UI is a pure reducer over `plan` + `step_update` +
`action_*` events keyed by `step.id` / `action.id`. Re-fetching `GET /api/agent/runs/:id`
must produce the identical final state (events are an optimization, not the source of truth).

---

## 5. Environment variables

`.env.example` is committed and kept in sync by whoever adds a var.

```
# shared
DATABASE_URL=
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=

# A — auth providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# A — crypto & LLM
TOKEN_ENCRYPTION_KEY=        # 32-byte base64, AES-256-GCM for connections table
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LLM_PROVIDER=claude          # claude | openai
LLM_PLANNER_MODEL=claude-sonnet-5
LLM_CHEAP_MODEL=claude-haiku-4-5-20251001

# A — jobs
REDIS_URL=                   # BullMQ; optional in dev (in-memory fallback)
BRIEFING_CRON=30 8 * * *
AGENT_MAX_STEPS=25
AGENT_MAX_TOOL_CALLS=40
AGENT_MAX_WALLCLOCK_MS=120000
AGENT_MAX_COST_USD=1.00
```

---

## 6. Milestone sync points (from product spec §29)

Both sides work the same milestone at once. A milestone is "done" only when the
**Definition of Done** slice for it passes end-to-end against real endpoints (no mocks).

| # | Milestone | A delivers | B delivers | Joint check |
|---|---|---|---|---|
| 1 | Foundation | Next.js+TS+Tailwind scaffold, Prisma+Postgres, Auth.js (Google sign-in only), `/api/me`, `/api/health`, empty `agent_runs` model, contracts skeleton | App shell, sidebar, routing, design system, sign-in screen, `/lib/api-client` with React Query, empty Today + Agent Run + Chat screens wired to stub data | New user signs in, sees empty dashboard |
| 2 | Google | Gmail/Calendar/Drive OAuth + token encryption, sync into `messages`/`calendar_events`/`documents`, `search`/`get`/`create_draft` tools, `/api/connections`, `/api/messages`, `/api/calendar/events`, `/api/documents`, `/api/search` | Connections screen (connect/disconnect/status), Inbox, Calendar, Documents, global search UI | Connect all 3 Google services, data shows in the 3 views + search |
| 3 | Agent | Orchestrator loop, planner (JSON), context retriever, tool registry + permission enforcement, action manager, verification layer, audit log, `/api/agent/*`, SSE | Agent Run timeline UI, plan preview, approval UI, audit "what it did" panel, chat wired to `/api/chat` SSE | "Find my next meeting and list attendees" runs, shows plan + steps + verified result |
| 4 | Morning Brief | Briefing job + pipeline, priority engine, commitment detection, `/api/briefing/*`, `/api/commitments`, `/api/today` | Today dashboard (real `/api/today`), briefing card, commitments screen | 8:30 job produces ≤10 ranked items; ≥1 commitment detected |
| 5 | Flagship | "Handle this" multi-tool plan across Gmail+Calendar+Drive, briefing doc creation in Drive, draft+send+verify email, relationship intel `/api/people/:id` | "Handle everything related to <X>" chat flow, full run timeline, draft review + Send/Cancel, People view | Full demo (spec §34 / §37 steps 5–16) passes |
| 6 | More integrations | Slack + GitHub + Notion connectors + tools, extend retriever/briefing | Connections rows + any provider-specific UI bits | Cross-app context includes Slack/GitHub/Notion |

---

## 7. Working agreement

- **Branch per milestone-slice per person:** `a/m3-orchestrator`, `b/m3-run-timeline`.
- **`/lib/contracts` PRs are tiny and fast** — land them before the code that needs them.
- **B never blocks on A:** `/lib/api-client` has a `USE_MOCKS` flag with fixtures matching
  every §3 shape. When A ships the real endpoint, flip the flag for that route.
- **A never blocks on B:** every endpoint is testable with `curl` / a `.http` file that
  lives in `/docs/api-examples`.
- **Merge cadence:** rebase onto `main` daily; integrate at each milestone boundary.
- **Definition of Done (spec §37) is the shared test script** — keep it green from M4 on.
