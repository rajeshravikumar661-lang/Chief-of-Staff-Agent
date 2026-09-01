# Deploying — Vercel + Supabase

## Current live status

| Piece | Status |
|---|---|
| Vercel project | **Live**: `rajeshravi/chief-of-staff-agent` → https://chief-of-staff-agent-sigma.vercel.app |
| Supabase project | **Live**: `chief-of-staff-agent` (org `rajeshravikumar661-lang's Org`, region ap-northeast-1 / Tokyo, free tier) |
| Database schema | **Migrated** — `prisma migrate deploy` applied against Supabase |
| `DATABASE_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `NEXTAUTH_URL` | **Set** on Vercel (Production) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Not set** — sign-in will fail until added (§3) |
| LLM key (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | **Not set** — agent runs will fail until added |
| Background worker (§4) | **Not deployed** — briefing/sync jobs no-op until you pick an option |

`curl https://chief-of-staff-agent-sigma.vercel.app/api/health` → `{"status":"ok"}`.
`/today` correctly 307s to `/signin` unauthenticated — auth is enforced, not bypassed.

The rest of this doc is the reference for the two pieces above and for adding a worker.
Nothing here changes local dev: `npm run dev`, `npm run quickstart`, demo mode, and
Docker Compose all still work exactly as before.

## 1. Architecture for this deployment target

```
Vercel  →  Next.js app (pages + /api/* routes)   — request/response only
Supabase → Postgres (replaces local/Docker Postgres)
Worker   → NOT covered by "vercel deploy" — see §4, pick one option
```

Vercel's serverless functions are request/response — they don't run a long-lived
process. `npm run worker` (BullMQ + Redis: morning briefing generation, Gmail/Calendar/
Drive sync, reminders) needs somewhere else to run. Decide that separately (§4) — the
app works without it, just without background automation (see §4, option C).

## 2. Supabase (Postgres)

**Done** — project `chief-of-staff-agent` exists (ap-northeast-1 / Tokyo, free tier),
schema migrated. Steps below are the reference for what was done / what to do if you
ever need a second environment (e.g. staging).

1. Create a project at supabase.com (any region close to where Vercel will run).
2. Project Settings → Database → Connection string. Supabase gives you two:
   - **Connection pooling** (port `6543`, `?pgbouncer=true`) — use this for `DATABASE_URL`,
     since Vercel serverless functions open a new DB connection per invocation and a
     direct connection will exhaust Postgres's connection limit under load.
   - **Direct connection** (port `5432`) — only needed on your own machine when you run
     `npx prisma migrate deploy` (migrations don't work well through the pooler).
3. This repo's `prisma/schema.prisma` currently has a single `url = env("DATABASE_URL")`
   and no `directUrl`. For a low-traffic launch you can point `DATABASE_URL` straight at
   the direct connection and skip the pooler entirely — simplest, revisit if you hit
   connection-limit errors. If you want the pooled setup instead, that's a small
   `prisma/schema.prisma` change (add `directUrl = env("DIRECT_URL")`) — flag it and I'll
   make it, since that file is backend-owned and out of scope for this prep pass.
4. Run migrations against Supabase from your machine (one-time, and again after any
   schema change):
   ```bash
   DATABASE_URL="<supabase direct connection string>" npx prisma migrate deploy
   ```

## 3. Vercel

1. `vercel link` (or import the GitHub repo from the Vercel dashboard) — you're already
   logged in as `rajeshravikumar661-2207` locally, so `vercel link` will just ask which
   project/scope to attach this directory to.
2. Framework preset: Next.js (auto-detected). Build command is already correct via
   `package.json`: `prisma generate && next build`.
3. Environment variables (Project Settings → Environment Variables) — same names as
   `.env.example`, values now pointing at real infra:

   | var | production value | status |
   |---|---|---|
   | `DATABASE_URL` | Supabase **pooled** connection string (port 6543, `?pgbouncer=true`) | ✅ set |
   | `NEXTAUTH_URL` | `https://chief-of-staff-agent-sigma.vercel.app` | ✅ set |
   | `AUTH_SECRET` | generated via `openssl rand -base64 32` | ✅ set |
   | `TOKEN_ENCRYPTION_KEY` | generated via `openssl rand -base64 32` | ✅ set |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console → Credentials. Add `https://chief-of-staff-agent-sigma.vercel.app/api/auth/callback/google` to that OAuth client's Authorized redirect URIs | ❌ **needed from you** |
   | LLM key | `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` matching `LLM_PROVIDER` | ❌ **needed from you** |
   | `REDIS_URL` | leave unset unless you've set up a worker host + managed Redis (§4) | intentionally unset |
   | `NEXT_PUBLIC_DEMO_MODE` | leave **unset** in production — see safety note below | intentionally unset |

   Add the missing ones the same way this session did:
   ```bash
   echo -n "<value>" | vercel env add GOOGLE_CLIENT_ID production
   echo -n "<value>" | vercel env add GOOGLE_CLIENT_SECRET production
   echo -n "<value>" | vercel env add GEMINI_API_KEY production   # or ANTHROPIC_/OPENAI_
   vercel --prod   # redeploy so the new vars take effect
   ```

4. Deploy: `vercel --prod`, or push to the branch Vercel is watching (already connected
   to `rajeshravikumar661-lang/Chief-of-Staff-Agent`, so pushes to `main` auto-deploy).

**Demo mode safety, unchanged by any of this:** `NEXT_PUBLIC_DEMO_MODE` only has an
effect when `NODE_ENV=development`. Vercel always builds and runs with
`NODE_ENV=production`, so setting that env var in a Vercel project (accidentally or
otherwise) has no effect — verified in the demo-mode work itself. Don't set it on
Vercel anyway, for clarity, but it isn't a real risk if it slips in.

## 4. Background workers — pick one

| Option | What it is | Tradeoff |
|---|---|---|
| **A. Vercel Cron** | Add a `vercel.json` with a `crons` entry hitting e.g. `/api/briefing/generate` on a schedule (needs a small new route iterating all users, since the existing job functions assume a BullMQ worker loop, not an HTTP trigger). | No extra host to manage. Vercel Cron has execution time limits (10s Hobby / 60s+ Pro) and doesn't replace a real queue — fine for periodic briefing generation, awkward for anything long-running like a full mailbox sync. |
| **B. Separate worker host** | Run `npm run worker` as an always-on process on Railway / Fly.io / Render / a small VPS, pointed at the same `DATABASE_URL`, plus a managed Redis (Upstash's free tier works well with BullMQ over Vercel-style deployments). | Closest to how the app is designed to run (this is what `docker-compose.yml`'s `worker` service already does) — a few dollars/month, one more thing to deploy and monitor. |
| **C. Skip it for launch** | Set no `REDIS_URL`. Jobs degrade to no-op per `src/jobs/queue.ts`; the "Refresh" button on the briefing already regenerates on demand. | Zero extra infra. No automatic morning briefing or background sync — a real limitation, but a reasonable v1 scope cut, and adding a worker later needs no app code changes, just infra. |

None of these need a decision right now — the app deploys and runs fine on Vercel +
Supabase with **C**, and you can add **A** or **B** whenever background automation
becomes a priority.

## 5. Post-deploy smoke check

```bash
curl https://chief-of-staff-agent-sigma.vercel.app/api/health
curl https://chief-of-staff-agent-sigma.vercel.app/api/auth/providers   # google provider registered
```
Both pass today. Once `GOOGLE_CLIENT_ID`/`SECRET` are added, sign in with Google
end-to-end once, and check Supabase's table editor to confirm a `User` / `Account` /
`Connection` row landed.
