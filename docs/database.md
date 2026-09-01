# Database

PostgreSQL + Prisma. Schema: `prisma/schema.prisma`. Client + per-user isolation:
`src/lib/db.ts`.

## Tables

| model | purpose |
|---|---|
| `User`, `Account`, `Session`, `VerificationToken` | NextAuth (Auth.js Prisma adapter) |
| `Connection` | one row per connected provider; `accessTokenEncrypted` / `refreshTokenEncrypted` (AES-256-GCM), `scopes`, `status`, `expiresAt`, `lastSyncAt`. Unique `(userId, provider)`. |
| `Message` | synced email. Unique `(userId, provider, externalId)`, indexed `(userId, timestamp)`. |
| `CalendarEvent` | synced events, `attendees` JSON. Unique `(userId, externalId)`, indexed `(userId, startTime)`. |
| `Document` | synced Drive files. Unique `(userId, provider, externalId)`. |
| `Task` | `status` (todo/doing/done), `priority`, `deadline`, `source`. |
| `Commitment` | detected promises: `person`, `description`, `deadline`, `source`, `status`, `confidence`. Indexed `(userId, status)`. |
| `Memory` | `type` (short_term/long_term/work), `content`, `source`, `confidence`, `importance`, `expiresAt`. Indexed `(userId, type)`. |
| `Person` | relationship intel: `name`, `email`, `org`, `importance`, `lastContactAt`. Unique `(userId, email)`. |
| `AgentRun` | `goal`, `status`, `summary`, `costUsd`, timestamps. Indexed `(userId, startedAt)`. |
| `AgentStep` | `index`, `title`, `tool`, `permission`, `status`, `requiresApproval`, `approvalDecision`, `arguments`, `result`, `verification`. Indexed `(agentRunId)`. |
| `AuditLog` | every WRITE/DESTRUCTIVE action + approve/reject. Indexed `(userId, timestamp)`. |
| `Briefing` | persisted morning briefing (`items` JSON). Indexed `(userId, generatedAt)`. |

## Per-user isolation
`scopedDb(userId)` (a Prisma `$extends` client) injects `userId` into every
where/create/count for user-scoped models, so a missing `where` clause cannot leak
across users. Update/delete-by-id paths do a scoped `findFirst` ownership check first.
Use `scopedDb` for all user data; bare `prisma` only for cross-user jobs and auth.

## Sync
`syncGmail` / `syncCalendar` / `syncDrive` do idempotent upserts on the unique keys and
stamp `Connection.lastSyncAt`. Run every 30 min by the worker, or via `POST /api/sync`.

## Migrations
`npx prisma migrate dev` (local), `npx prisma migrate deploy` (prod). Never hand-edit a
generated migration after it has been applied.
