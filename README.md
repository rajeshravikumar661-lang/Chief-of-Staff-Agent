# Chief of Staff Agent

An AI "Chief of Staff" that connects to your work tools, understands what's happening
across them, identifies priorities, and takes useful actions **with your approval**.

Core loop: **Observe → Understand → Prioritize → Plan → Ask for approval → Execute → Verify → Report.**

This repository is the **backend / agent** workstream (Person A). See
`PERSON_A_AGENT_BACKEND.md` for the full spec and `SHARED-CONTRACT.md` for the API seam
with the frontend. Engineering rules: `CLAUDE.md`. Design: `docs/`.

## Stack
Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · NextAuth v5 (Google) ·
BullMQ + Redis · LLM behind a provider abstraction (Claude default, OpenAI second).

## Setup

```bash
npm install
cp .env.example .env          # fill in the values below

# local Postgres (Homebrew postgresql@16):
brew install postgresql@16
npm run setup                 # start db + create it + migrate + generate + seed

npm run dev                   # http://localhost:3000
npm run worker                # background jobs (briefings, sync, reminders) — separate process
```

Already have a Postgres? Skip `npm run setup`, point `DATABASE_URL` at it, and run
`npx prisma migrate dev && npm run seed`.

DB lifecycle: `npm run db:start` / `db:stop` / `db:reset`.

Smoke check once it's up:
```bash
curl localhost:3000/api/health            # {"status":"ok"}
curl localhost:3000/api/auth/providers    # google provider registered
```

### Required env
| var | how to get it |
|---|---|
| `DATABASE_URL` | a Postgres database |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (32 bytes — used for AES-256-GCM token encryption) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud console → OAuth 2.0 client. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`. Enable Gmail, Calendar, Drive, and Docs APIs. |
| `ANTHROPIC_API_KEY` | console.anthropic.com (or `OPENAI_API_KEY` + `LLM_PROVIDER=openai`) |
| `REDIS_URL` | optional in dev — jobs degrade to no-op scheduling without it |

One Google consent grants login **and** the Gmail/Calendar/Drive connector scopes
(least-privilege: readonly + compose/events; `gmail.send` is gated behind an approved step).

## API
All routes under `/api`, JSON, session-guarded, rate-limited, zod-validated, per-user
isolated via `scopedDb`. Full list: `PERSON_A_AGENT_BACKEND.md` §10 / `src/lib/types.ts`.

Quick check:
```bash
curl localhost:3000/api/health
```

## Docker
```bash
cp .env.example .env      # fill GOOGLE_CLIENT_* + ANTHROPIC_API_KEY
docker compose up --build # db + redis + web (:3000) + worker; runs migrate deploy on boot
```

## Verify
```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (needs local db running)
npm run build       # prisma generate && next build
npx prisma validate
```
CI (`.github/workflows/ci.yml`) runs typecheck + tests + build against a Postgres service
on every push and PR to `main`.

## Layout
```
src/app/api/*        route handlers (thin: auth → validate → delegate)
src/agent/*          orchestrator, planner, retriever, action manager, verification,
                     memory, priority engine, commitment detection, llm/, tools/
src/integrations/*   gmail · calendar · drive (+ slack · github · notion in milestone 6)
src/jobs/*           morning briefing · sync · reminders · scheduler · worker
src/security/*       token crypto · audit log · rate limit
src/lib/*            env · db (+ scopedDb) · types (API contract) · serializers · http
```
