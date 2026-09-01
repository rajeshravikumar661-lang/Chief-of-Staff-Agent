# Deploying — Vercel + Supabase

This is a prep guide, not an automated script. It doesn't touch any live infra — you
create the Supabase project and the Vercel project yourself (both require you to sign in),
then follow the steps below. Nothing here changes local dev: `npm run dev`, `npm run
quickstart`, demo mode, and Docker Compose all still work exactly as before.

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

   | var | production value |
   |---|---|
   | `DATABASE_URL` | Supabase pooled (or direct, see §2.3) connection string |
   | `NEXTAUTH_URL` | your Vercel production URL, e.g. `https://your-app.vercel.app` |
   | `AUTH_SECRET` | `openssl rand -base64 32` — a **different** value than local dev |
   | `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — a **different** value than local dev |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | same Google Cloud OAuth client, or a separate prod client — either way, add `https://your-app.vercel.app/api/auth/callback/google` to its Authorized redirect URIs (Google Cloud Console → Credentials) |
   | LLM key | `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` matching `LLM_PROVIDER` |
   | `REDIS_URL` | leave unset unless you've set up a worker host + managed Redis (§4) |
   | `NEXT_PUBLIC_DEMO_MODE` | leave **unset** in production — see safety note below |

4. Deploy: `vercel --prod`, or push to the branch Vercel is watching.

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
curl https://your-app.vercel.app/api/health
curl https://your-app.vercel.app/api/auth/providers   # google provider registered
```
Then sign in with Google end-to-end once, and check Supabase's table editor to confirm
a `User` / `Account` / `Connection` row landed.
