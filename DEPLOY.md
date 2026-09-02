# Deploying — Render + Supabase

## Current live status (2026-09-02)

**Canonical deployment: `kora-app` on Render → https://kora-app.onrender.com**

| Piece | Status |
|---|---|
| Render web service | **Live**: `kora-app` (`srv-dabvms7avr4c73av9m80`) → https://kora-app.onrender.com — free plan, persistent Node process (needed for WhatsApp), standalone `New → Web Service`, auto-deploys from `main` |
| Build command | `npm ci && npx prisma generate && npx next build` — migrations are **not** run here; the shared DB is already migrated by another service. `npm run build` (which does run `prisma migrate deploy`) is still the default for any service that owns migrations. |
| LLM provider | **Groq** — `LLM_PROVIDER=groq`, `GROQ_STRONG_MODEL=openai/gpt-oss-120b`, `GROQ_CHEAP_MODEL=openai/gpt-oss-20b`, `GROQ_API_KEY` set |
| Supabase project | **Live**, region ap-northeast-1 / Tokyo, free tier. Schema migrated. `DATABASE_URL` = transaction pooler (6543), `DIRECT_URL` = session pooler (5432, IPv4). |
| Env vars on `kora-app` | `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `NEXTAUTH_URL=https://kora-app.onrender.com`, `APP_BASE_URL=https://kora-app.onrender.com`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GROQ_*`, `WHATSAPP_ENABLED=true` |
| Google Cloud / OAuth | project `cos-agent-507313`. Authorized redirect URI `https://kora-app.onrender.com/api/auth/callback/google` added and verified (OAuth flow reaches the account chooser, no `redirect_uri_mismatch`). Consent screen published (External/Production); unverified-app interstitial still shows until Google verification completes. |
| WhatsApp | two-way ("Ask Kora") + daily digest. Auth state is DB-backed (`WhatsAppAuthCreds` / `WhatsAppAuthKey`), so a linked session survives redeploys and is shared across any service on the same DB. |

`curl https://kora-app.onrender.com/api/health` → `{"status":"ok"}`.
`/today` correctly 307s to `/signin` unauthenticated — auth is enforced, not bypassed.

### Older deployments — deprecated, safe to delete

These predate `kora-app` and all point at the **same Supabase DB**, so they are running
duplicates, not a staging/prod split:

| Deployment | URL | Note |
|---|---|---|
| Render `cos-agent-web` | https://cos-agent-web.onrender.com | still auto-deploys from `main`; superseded by `kora-app` |
| Render `Kora` (stray) | https://kora-s86u.onrender.com | half-created, never built green; auto-deploy already disabled — delete it |
| Vercel `cos-agent-basu` | https://cos-agent-basu.vercel.app | old host; WhatsApp can't work on Vercel serverless |
| Vercel `chief-of-staff-agent-sigma` | https://chief-of-staff-agent-sigma.vercel.app | oldest host |

Render `koraai` (`chief-of-staff-worker-e4be.onrender.com`) is the **background worker**
(BullMQ: morning briefing / sync / reminders). Keep it if you want background automation;
it also needs the same env vars as `kora-app` plus `REDIS_URL`.

The rest of this doc still refers to the earlier Vercel-first setup — treat it as
historical reference for Supabase pooler choices and the OAuth publishing steps, which
are unchanged. Nothing here affects local dev.

### Render web service — why it exists, and its gaps

WhatsApp pairing (`/api/whatsapp/pair` + the QR flow) needs a socket that survives
between requests. Vercel serverless functions freeze right after responding, so a QR
would render but the pairing handshake could never complete — this is why WhatsApp
"couldn't connect" before. `cos-agent-web` on Render's free **web** service tier is a
persistent Node process (unlike Vercel), so the exact same Next.js app works there for
WhatsApp without needing the paid BullMQ `worker` service from `render.yaml` at all —
pairing lives inside the main app's API routes, not the worker.

Set up so far, reusing the same secrets as Vercel where they were available locally
(`DATABASE_URL`, `DIRECT_URL` — session-pooler variant, `AUTH_SECRET`,
`TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `WHATSAPP_ENABLED=true`, `NEXTAUTH_URL`
pointed at the Render URL). `GOOGLE_CLIENT_SECRET` could not be read back from Vercel
(Google no longer allows viewing an existing client secret, and Vercel had it marked
Sensitive) — worked around by adding a **second** client secret to the same OAuth
client in Google Cloud Console (Google supports two live secrets simultaneously for
exactly this kind of rotation) and using that on Render; the original secret Vercel
uses is untouched. Also added
`https://cos-agent-web-wul5.onrender.com/api/auth/callback/google` as a new authorized
redirect URI on the same OAuth client — propagation can take Google 5 minutes to a few
hours, so a fresh `redirect_uri_mismatch` right after adding it is expected, not a bug.

**Known gaps on the Render service, not yet addressed:**
- `GEMINI_API_KEY` / `LLM_PROVIDER` / `GEMINI_STRONG_MODEL` / `GEMINI_CHEAP_MODEL` are
  **not** set there yet (same "Sensitive on Vercel" blocker) — agent runs will fail on
  this host until added manually via the Render dashboard.
- Two web services now point at the same Supabase database (Vercel prod + this Render
  service). Both are meant to be the same logical app, just on different hosts while
  this is being sorted out — not a deliberate staging/prod split.

**WhatsApp auth persistence is DB-backed, not disk-backed (2026-09-02).** Free-tier
Render web services have no persistent disk, so the original filesystem-based
`useMultiFileAuthState` would lose a linked session on every redeploy or 15-minute
idle spin-down. Instead of paying for a disk, `src/integrations/whatsapp/dbAuthState.ts`
reimplements Baileys' own file-based auth-state pattern against Postgres
(`WhatsAppAuthCreds` / `WhatsAppAuthKey` models) — the exact same shape Baileys writes
to disk, just as rows instead of files. This means a linked WhatsApp session now
survives redeploys, restarts, and spin-downs on **any** host, free tier included, with
no extra infrastructure. `getState()` and `isLinked()` are now `async` (they read the
DB) — update any new caller accordingly.

**Fixed 2026-09-02: builds were failing.** `npm run build` now runs `prisma migrate
deploy` automatically (good — keeps prod schema current on every deploy), but it used
`DIRECT_URL` pointed at Supabase's true direct-connection host
(`db.<ref>.supabase.co:5432`), which is **IPv6-only** — unreachable from Vercel's build
machines (no IPv6 egress), so every build that needed to run a migration failed with
`P1001: Can't reach database server`. Fixed by pointing `DIRECT_URL` at Supabase's
**Session pooler** instead (same IPv4 host as the pooled `DATABASE_URL`, port `5432`
instead of `6543`) — Supabase's own dashboard flags this exact host as "the alternative
to direct connection when connecting via an IPv4 network." Verified: `prisma migrate
status` succeeds against it, and the next Vercel deploy built clean. If you ever want
the true direct connection back (e.g. for a bulk operation), Supabase sells an IPv4
add-on for it — not needed for normal migrations.

**Google OAuth is published (In production)**, not Testing. Anyone with a Google
account can attempt sign-in — up to a lifetime cap of 100 total grants — but sees
Google's "unverified app" interstitial (Advanced → Go to app) until real Google
verification completes (privacy policy done; still needs Search Console domain
verification + a CASA security review for the Gmail/Drive scopes). To add more known
users to skip nothing (the interstitial still shows) but keep a record: Google Cloud
Console → this project → APIs & Services → Google Auth Platform → Audience → Test users.

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
2. Project Settings → Database → Connection string. Supabase gives you three:
   - **Transaction pooler** (port `6543`, `?pgbouncer=true`) — use this for `DATABASE_URL`,
     since Vercel serverless functions open a new DB connection per invocation and a
     direct connection will exhaust Postgres's connection limit under load.
   - **Direct connection** (port `5432`, `db.<ref>.supabase.co`) — **IPv6-only**. Don't
     use this for `DIRECT_URL` on Vercel: build machines have no IPv6 egress, so any
     build that runs a migration fails with `P1001`. Fine for your own machine if it has
     IPv6, but that's not guaranteed either — don't rely on it.
   - **Session pooler** (port `5432`, same pooler host as above) — use this for
     `DIRECT_URL`. It's IPv4, and unlike the transaction pooler it supports the
     prepared-statement/DDL behavior `prisma migrate` needs.
3. `prisma/schema.prisma` has `directUrl = env("DIRECT_URL")` alongside `url =
   env("DATABASE_URL")` — already wired for this pooled+session split.
4. Run migrations against Supabase from your machine (one-time, and again after any
   schema change — though `npm run build` now does this automatically on every deploy):
   ```bash
   DIRECT_URL="<session pooler string, port 5432>" DATABASE_URL="<transaction pooler string, port 6543>" npx prisma migrate deploy
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
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console → Credentials. Add `https://chief-of-staff-agent-sigma.vercel.app/api/auth/callback/google` to that OAuth client's Authorized redirect URIs | ✅ set |
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

## Render Blueprint

A ready-to-use [`render.yaml`](./render.yaml) is checked in. In the Render dashboard:
**New → Blueprint → point at this repo**. It provisions three things:

- **`cos-agent-web`** — the Next.js app (`plan: free`), health-checked at `/api/health`.
- **`cos-agent-worker`** — the BullMQ background loop (`npm run worker`) for morning
  briefings, mailbox sync, and WhatsApp. Set to `plan: starter` because **Render's
  free tier cannot run `worker`-type services**. On free tier, skip this service and
  rely on the on-demand "Refresh" button (§4 option C above).
- **`cos-agent-redis`** — a managed key-value (Redis) instance; `REDIS_URL` is wired
  into the worker automatically via `fromService`.

All secrets are declared `sync: false`, so set them per-service in the dashboard
after the first deploy: `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`,
`TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `LLM_PROVIDER`, `GROQ_API_KEY`,
`WHATSAPP_ENABLED`, `UPSTASH_REDIS_REST_URL/TOKEN`, and the M6 connector client
ids/secrets (`SLACK_`, `GITHUB_`, `NOTION_`, `LINEAR_`).

**WhatsApp note:** the Baileys socket needs a long-lived process — it runs in the
persistent `web` (or `worker`) service, not in any serverless/cron context.
