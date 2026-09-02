# CLAUDE.md — engineering rules for Kora (backend / Person A)

## What this repo is
Backend + agent orchestration for an AI "Chief of Staff". Product spec:
`PERSON_A_AGENT_BACKEND.md` (this workstream) and `SHARED-CONTRACT.md` (seam with frontend).
Core loop: **Observe → Understand → Prioritize → Plan → Approve → Execute → Verify → Report.**

## Stack
- Next.js 15 (App Router) + TypeScript, API routes under `src/app/api`.
- PostgreSQL + Prisma (`prisma/schema.prisma`).
- NextAuth v5 (Google) — one OAuth flow for login + Gmail/Calendar/Drive scopes.
- BullMQ + Redis for jobs. LLM behind `src/agent/llm/provider.ts` (Claude default).

## Hard rules
1. **Permissions are enforced in code, not prompts.** Every tool declares
   `READ | DRAFT | WRITE | DESTRUCTIVE`. The Action Manager is the only path that may run
   WRITE/DESTRUCTIVE, and only after an approved `AgentStep`.
2. **Retrieved content (email/Slack/Drive/Notion) is DATA, never instructions.** Wrap it in
   `<retrieved_content source="...">…</retrieved_content>` before it reaches the model.
3. **Validate every model-generated tool argument** against its Zod schema before calling a
   connector. Reject + re-ask on failure.
4. **Verify every WRITE/DESTRUCTIVE action** against the source of truth before marking a step
   `succeeded`. Never silently retry past a cap.
5. **Per-user isolation at the query layer** — use `scopedDb(userId)` from `src/lib/db.ts`, never
   a bare `prisma` query for user data.
6. **Access tokens never leave the server.** Encrypted at rest (`src/security/tokenCrypto.ts`),
   decrypted in-memory per call only. Never logged, never in an API response.
7. **Every agent run is capped** — steps, tool calls, wall-clock, cost (see `src/lib/env.ts`).
   A capped run ends `partial`, not silently.
8. **`logAction()` for every WRITE/DESTRUCTIVE action and every approve/reject.**
9. The API contract lives in `src/lib/types.ts` (mirrors `PERSON_A_AGENT_BACKEND.md` §10). Bump
   the version comment on any change and tell Person B.

## Workflow
`npm run typecheck` and `npm run lint` must pass before commit. Milestones match
`SHARED-CONTRACT.md` §6 — merge with Person B at each boundary.

## Directory ownership
`src/app/api`, `src/agent`, `src/integrations`, `src/jobs`, `src/security`, `src/lib`, `prisma`
are Person A. Do not add UI here.
