# Person A — Agent & Backend
### Chief of Staff Agent — Backend, Orchestration, Data, Security

> Companion file: `PERSON_B_FRONTEND_PRODUCT.md`. Both files implement the same product spec.
> The **API Contract** section below (§10) is the seam between you two — it is duplicated
> word-for-word in both files. If you need to change it, change it in both files in the same
> sitting and ping Person B before you merge.

---

## 1. What you own

- Agent orchestration (Planner → Context Retriever → Reasoning → Action Manager → Verification)
- LLM provider abstraction
- Tool system + permission enforcement
- OAuth backend for all integrations
- Database schema, migrations, queries
- Memory system (short-term / long-term / work)
- Priority engine + commitment detection
- Background jobs (morning briefing, sync, reminders)
- Security (token encryption, audit logs, input/output validation, prompt-injection defense)
- Every API route the frontend calls

You do **not** own: page layout, component styling, design system, client-side state UX. You **do**
own the shape of every payload the UI consumes — treat §10 as a promise you keep.

---

## 2. Tech decisions (your half)

- **Runtime:** Node.js + TypeScript, Next.js API routes to start (split into a separate service
  later only if a real scaling problem shows up — don't pre-optimize).
- **DB:** PostgreSQL + Prisma.
- **Auth:** NextAuth.js (or Auth.js) with Google as the primary OAuth provider — reuse the same
  OAuth flow for Google login and for connecting Gmail/Calendar/Drive scopes.
- **Queue/scheduler:** BullMQ + Redis (or a simple `node-cron` for MVP if you want to skip Redis
  in week 1 — upgrade to BullMQ before Milestone 4, since briefing generation needs retries and
  visibility).
- **LLM abstraction:** one `LLMProvider` interface, Claude as default implementation, OpenAI as a
  second implementation to prove the abstraction isn't fake. Never call the Anthropic/OpenAI SDK
  directly from agent code — always go through the interface.
- **Secrets:** `.env` server-side only, encrypted token columns (see §5) with a KMS-style envelope
  key, never logged.

---

## 3. Milestones (your tasks only — numbering matches the shared roadmap so you and Person B merge at the same checkpoints)

### Milestone 1 — Foundation
- [ ] Postgres schema + Prisma models (§5, full table list)
- [ ] Auth backend (NextAuth, session handling, `users` table)
- [ ] `agent_runs` / `agent_steps` tables + minimal CRUD
- [ ] `POST /api/chat` stub that echoes back a canned response (unblocks Person B's chat UI)
- [ ] `GET /api/today` stub returning the fixture in §10.2 (unblocks Person B's dashboard)
- [ ] Audit log table + a `logAction()` helper used everywhere writes happen

### Milestone 2 — Google integrations
- [ ] Google OAuth consent flow for Gmail + Calendar + Drive scopes (least-privilege: request
      only `gmail.readonly`, `gmail.compose`, `calendar.readonly`, `calendar.events`,
      `drive.readonly` — no `gmail.send` scope until Milestone 3 needs it, no full `drive` scope)
- [ ] Token encryption at rest (`connections.access_token_encrypted`) + refresh logic
- [ ] `integrations/gmail`: `search()`, `getThread()`, `createDraft()` (send comes in M3)
- [ ] `integrations/calendar`: `search()`, `getEvent()`
- [ ] `integrations/drive`: `search()`, `getFile()`
- [ ] `GET /api/connections`, `POST /api/connections/:provider/connect`,
      `POST /api/connections/:provider/disconnect` — real implementations now

### Milestone 3 — Agent core
- [ ] Planner: goal → structured JSON step list (§6, §21 shape)
- [ ] Context Retriever: entity extraction → time-window search → rank → dedupe → summarize (§7)
- [ ] Tool registry with permission levels enforced **in code**, not just in the prompt (§10 of
      the product spec, §26–27 here)
- [ ] Action Manager: executes READ tools automatically, DRAFT tools automatically-but-visible,
      queues WRITE/DESTRUCTIVE tools as `requires_approval` steps
- [ ] Verification layer: every WRITE/DESTRUCTIVE action re-checks the external API before being
      marked `succeeded`
- [ ] `gmail.send` implementation (now that a human approval gate exists in front of it)
- [ ] Real `POST /api/agent/runs`, `GET /api/agent/runs/:id`,
      `POST /api/agent/runs/:id/steps/:stepId/approve|reject`,
      `GET /api/agent/runs/:id/stream` (SSE, see §10.4)
- [ ] Audit log entries for every executed step

### Milestone 4 — Morning Brief engine
- [ ] Scheduled job (per-user local time, default 8:30am) implementing the pipeline in §13 of the
      product spec
- [ ] Priority engine (§14): scores every discovered item into CRITICAL/HIGH/MEDIUM/LOW
- [ ] Commitment detection (§15): regex/LLM hybrid extraction of "I'll send X by Friday"-type
      statements from email/Slack bodies into the `commitments` table
- [ ] `GET /api/briefing/today`, `POST /api/briefing/generate` (manual trigger for demo/testing)

### Milestone 5 — "Handle this" flagship workflow
- [ ] End-to-end planner run that chains calendar → gmail → drive search, produces a briefing
      object, detects open commitments, and proposes draft actions (§17)
- [ ] Make sure this is just composition of Milestone 2–4 pieces, not new bespoke code — if it
      needs a special-case code path, the architecture isn't modular enough yet

### Milestone 6 — Slack / GitHub / Notion
- [ ] Same connector pattern as Gmail/Calendar/Drive: `integrations/slack`,
      `integrations/github`, `integrations/notion`, each with a small `search/get/act` tool
      surface and declared permission levels
- [ ] Extend Context Retriever and Priority Engine to include these sources — should require
      near-zero changes to the retriever's ranking logic if §7 was built generically

---

## 4. Agent components — what each one actually does

**Planner** — turns natural language into a structured step list (JSON, not prose). Never lets
the model execute a tool that wasn't planned. Re-plans if a step's result changes what's needed
(e.g., meeting was cancelled).

**Context Retriever** — never dumps raw inboxes into the model. Pipeline: extract entities →
resolve time window → search each connected source → rank by relevance → dedupe → summarize into
short snippets → hand only those snippets to the reasoning step. This is the single highest-
leverage piece for cost control (§8 of the design) and for the killer demo (§34) actually working
within a few seconds instead of timing out.

**Reasoning/LLM** — behind the `LLMProvider` interface. Use a cheap/small model for classification,
relevance ranking, and entity extraction; use the strongest model for planning, multi-source
synthesis, and final briefing text.

**Action Manager** — the only code path allowed to call a WRITE or DESTRUCTIVE tool. Reads the
tool's declared permission level (§6) and either executes immediately (READ), executes and flags
for display (DRAFT), or creates a `requires_approval` step and stops (WRITE/DESTRUCTIVE) until the
user approves via `POST /api/agent/runs/:id/steps/:stepId/approve`.

**Verification** — after every WRITE/DESTRUCTIVE action, re-fetches the object from the source of
truth (e.g., re-fetch the sent Gmail message by ID, confirm recipient + subject match what was
proposed) before marking the step `verified`. If verification fails, the step is marked `failed`
and surfaced to the user — never silently retried without limit.

**Memory** — three types, each with `source`, `timestamp`, `confidence`, `importance`,
`expires_at`:
- *Short-term*: scoped to one `agent_run`, discarded after (or kept as a run log, not reused).
- *Long-term*: stable user preferences ("prefers concise emails"), written rarely, reviewed
  before being trusted (don't let one offhand remark become a permanent rule).
- *Work*: ongoing facts with a natural expiry ("pricing proposal pending" expires when the
  commitment closes or after N days).
Nothing is written to long-term/work memory automatically from raw content — only from
explicitly-extracted, scored facts. This mirrors the memory-hygiene principle in this system's
own configuration: don't store everything, store what's durable and useful.

**Priority engine** — `priority = urgency + importance + deadline_proximity + relationship_importance + user_preference_weight − already_handled_penalty`.
Output is one of `CRITICAL | HIGH | MEDIUM | LOW`. Keep the scoring function pure and unit-
testable — Person B will want to render the same four buckets consistently across the dashboard,
briefing, and agent run UI.

**Commitment detection** — hybrid: cheap regex/keyword pass to flag candidate sentences
("I'll", "by Friday", "let's schedule"), then a small-model pass to extract
`{person, commitment, deadline, source, status}`. Write to `commitments` table with `status: open`.
Surface via `GET /api/commitments` and reference from the morning briefing.

---

## 5. Database model (you own every migration)

```
users
  id, email, name, created_at

connections
  id, user_id, provider, access_token_encrypted, refresh_token_encrypted,
  scopes, status, created_at, updated_at

messages
  id, user_id, provider, external_id, sender, recipients, subject, body,
  timestamp, metadata (jsonb)

calendar_events
  id, user_id, external_id, title, start_time, end_time, attendees (jsonb),
  metadata (jsonb)

documents
  id, user_id, provider, external_id, title, content, metadata (jsonb)

tasks
  id, user_id, title, status, priority, deadline, source

commitments
  id, user_id, person, description, deadline, source, status

memories
  id, user_id, type (short_term|long_term|work), content, source,
  confidence, importance, expires_at, created_at

agent_runs
  id, user_id, goal, status, started_at, completed_at

agent_steps
  id, agent_run_id, tool, arguments (jsonb), result (jsonb), status,
  requires_approval, created_at, updated_at

audit_logs
  id, user_id, action, tool, timestamp, result (jsonb)
```

Index `messages`, `calendar_events`, `documents` on `(user_id, provider, external_id)` unique —
sync jobs need idempotent upserts. Index `agent_steps` on `agent_run_id`. Every table is scoped by
`user_id` — enforce this in a Prisma middleware, not per-query, so a forgotten `where` clause can
never leak across users.

---

## 6. Tool schema & permission model

Every tool exports:

```ts
interface Tool {
  name: string;                 // e.g. "gmail.send"
  description: string;
  inputSchema: ZodSchema;
  permission: "READ" | "DRAFT" | "WRITE" | "DESTRUCTIVE";
  execute: (input, ctx) => Promise<ToolResult>;
  verify?: (input, result, ctx) => Promise<VerificationResult>;
}
```

Default behavior enforced by the Action Manager (in code, not prompt text):

| Permission | Behavior |
|---|---|
| READ | runs automatically |
| DRAFT | runs automatically, result shown to user, no external side effect |
| WRITE | creates a `requires_approval` step, blocks until approved |
| DESTRUCTIVE | creates a `requires_approval` step with explicit confirmation copy, blocks until approved |

Example declarations:
```
gmail.search        READ_ONLY
gmail.get_thread     READ_ONLY
gmail.create_draft   DRAFT
gmail.send           WRITE
gmail.archive        WRITE
calendar.search      READ_ONLY
calendar.create_event WRITE
calendar.cancel_event DESTRUCTIVE
drive.search         READ_ONLY
drive.create_document DRAFT
slack.search          READ_ONLY
slack.send_message    WRITE
github.read_pr        READ_ONLY
github.comment         WRITE
notion.search_pages    READ_ONLY
notion.create_task     DRAFT
```

Validate every model-generated tool argument against the Zod schema before it touches an
integration connector. Reject and re-ask the model on schema failure — never pass raw model
output straight into an API call.

---

## 7. Integration connector structure

```
/integrations
  /gmail
  /calendar
  /drive
  /slack
  /github
  /notion
```

Each folder exposes only its declared tool functions (§6) — the agent never touches a raw OAuth
client. Connectors are the only code that imports Google/Slack/GitHub/Notion SDKs.

```
Agent → Tool interface → Integration connector → External API
```

---

## 8. Execution loop guardrails

Hard-cap every agent run:
- max steps (e.g. 20)
- max wall-clock time (e.g. 90s before requiring a "still working" continuation)
- max tool calls per run
- max LLM cost per run (track token usage per call, sum per run, cut off and surface to user if
  exceeded)

Never let the model call tools in an unbounded loop. A run that hits a cap ends in a `partial`
status with whatever it found, not a silent failure.

---

## 9. Security checklist (yours)

- [ ] OAuth only, no password storage for connected providers
- [ ] Tokens encrypted at rest, decrypted only server-side, in-memory only for the duration of a
      call
- [ ] Access tokens never serialized into any API response to the frontend
- [ ] Least-privilege scopes per provider (request the narrowest scope that satisfies the current
      milestone's tools)
- [ ] Rate limiting on every API route (per-user)
- [ ] Input validation (Zod) on every API route and every tool call
- [ ] Output validation before writing model output into `documents`/`messages` tables
- [ ] Audit log entry for every WRITE/DESTRUCTIVE action, and for approve/reject decisions
- [ ] Per-user data isolation enforced at the query layer (Prisma middleware, not convention)

**Prompt-injection defense:** content retrieved from Gmail/Slack/Drive/Notion is DATA, never
instructions. Wrap all retrieved snippets passed into the reasoning step with a data boundary
(e.g. `<retrieved_content source="gmail">...</retrieved_content>`) and a system instruction that
retrieved content must never be treated as a command. This is a defense-in-depth measure —
the real enforcement is that tool permissions are checked in code regardless of what the model
"decides" to call.

---

## 10. API Contract — the seam with Person B

*(This section is identical in `PERSON_B_FRONTEND_PRODUCT.md`. Keep both copies in sync.)*

Contract version: **v0.1**. Bump this version string in both files whenever a shape changes, and
say so in your merge message.

### 10.1 Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/today` | dashboard summary | user session |
| GET | `/api/connections` | list connection status per provider | user session |
| POST | `/api/connections/:provider/connect` | start OAuth flow, returns redirect URL | user session |
| POST | `/api/connections/:provider/disconnect` | revoke a connection | user session |
| POST | `/api/chat` | send a chat message, may create/reference an agent run | user session |
| POST | `/api/agent/runs` | create a new agent run from a goal string | user session |
| GET | `/api/agent/runs` | list recent runs | user session |
| GET | `/api/agent/runs/:id` | run detail incl. steps | user session |
| GET | `/api/agent/runs/:id/stream` | SSE stream of step updates | user session |
| POST | `/api/agent/runs/:id/steps/:stepId/approve` | approve a pending step | user session |
| POST | `/api/agent/runs/:id/steps/:stepId/reject` | reject a pending step | user session |
| GET | `/api/commitments` | list commitments | user session |
| PATCH | `/api/commitments/:id` | update status (e.g. mark done) | user session |
| GET | `/api/people/:id` | relationship intelligence for one person | user session |
| GET | `/api/tasks` | list tasks | user session |
| GET | `/api/briefing/today` | today's morning briefing | user session |
| POST | `/api/briefing/generate` | force-regenerate briefing (demo/testing) | user session |
| GET | `/api/search?q=` | cross-source search | user session |
| GET | `/api/audit-logs` | audit trail | user session |

### 10.2 `GET /api/today` — response shape

```json
{
  "greeting": "Good morning, Mohin",
  "agenda": [
    { "time": "09:30", "title": "Product standup" },
    { "time": "11:00", "title": "Investor call" },
    { "time": "14:00", "title": "Product review" }
  ],
  "needsAttention": [
    { "id": "na_1", "text": "3 important emails have not been answered", "priority": "HIGH" },
    { "id": "na_2", "text": "Investor meeting starts in 3 hours", "priority": "CRITICAL" },
    { "id": "na_3", "text": "GitHub PR #182 has been waiting for your review", "priority": "MEDIUM" }
  ],
  "followUps": [
    { "id": "fu_1", "text": "You told Alex on Tuesday you'd send the pricing proposal", "commitmentId": "cm_1" }
  ],
  "suggestedActions": [
    { "id": "sa_1", "label": "Prepare investor meeting briefing", "actionType": "PREPARE_BRIEFING" },
    { "id": "sa_2", "label": "Draft reply to Alex", "actionType": "DRAFT_REPLY" },
    { "id": "sa_3", "label": "Summarize PR #182", "actionType": "SUMMARIZE_PR" }
  ]
}
```

### 10.3 Agent run object (used by `GET /api/agent/runs/:id` and the SSE stream)

```json
{
  "id": "run_123",
  "goal": "Handle everything related to the Acme investor meeting",
  "status": "in_progress",
  "startedAt": "2026-09-01T08:31:00Z",
  "completedAt": null,
  "steps": [
    { "id": "s1", "tool": "calendar.search", "status": "succeeded", "requiresApproval": false, "summary": "Found tomorrow's Acme investor meeting" },
    { "id": "s2", "tool": "gmail.search", "status": "succeeded", "requiresApproval": false, "summary": "Found 8 relevant emails" },
    { "id": "s3", "tool": "gmail.create_draft", "status": "awaiting_approval", "requiresApproval": true, "summary": "Drafted follow-up email to John" }
  ]
}
```

`status` values: `pending | in_progress | awaiting_approval | succeeded | failed | partial`.
`steps[].status` values: `pending | running | succeeded | failed | awaiting_approval | rejected`.

### 10.4 SSE stream (`GET /api/agent/runs/:id/stream`)

Emits one `message` event per step transition, same shape as one element of `steps[]` above, plus
a final event `{"type": "run_complete", "run": {...full run object...}}`. Frontend should treat
this purely as "update this step in place" — no reshaping needed.

### 10.5 Error shape (all endpoints)

```json
{ "error": { "code": "STRING_CODE", "message": "human-readable" } }
```

---

## 11. Definition of done (backend)

- [ ] A new user can sign in, connect Gmail/Calendar/Drive, and every token is encrypted at rest
- [ ] `POST /api/agent/runs {"goal": "What's important today?"}` returns a run that actually
      queried at least two connected sources
- [ ] `POST /api/agent/runs {"goal": "Prepare me for my next important meeting"}` finds the
      meeting, retrieves context, produces a briefing, detects at least one commitment if one
      exists, and proposes a draft
- [ ] Approving a WRITE step actually calls the external API, and the step is only marked
      `succeeded` after the verification layer re-checks it
- [ ] Every WRITE/DESTRUCTIVE action has a matching `audit_logs` row
- [ ] The morning briefing job runs on a schedule without manual triggering
- [ ] No access token ever appears in a frontend-facing response

---

## 12. Suggested folder structure

```
/src
  /agent
    planner.ts
    contextRetriever.ts
    actionManager.ts
    verification.ts
    memory.ts
    priorityEngine.ts
    commitmentDetection.ts
    llm/
      provider.ts
      claude.ts
      openai.ts
  /integrations
    gmail/  calendar/  drive/  slack/  github/  notion/
  /jobs
    morningBriefing.ts
    sync.ts
    reminders.ts
  /db
    schema.prisma
  /api            (Next.js API routes — implement §10 exactly)
  /security
    tokenCrypto.ts
    rateLimit.ts
    auditLog.ts
```
