# Security

Treat this as a security-sensitive system: it holds OAuth tokens for a user's email,
calendar, and files, and can act on their behalf.

## Auth & tokens
- OAuth only — no password storage for connected providers. Google is the single provider
  for both login and Gmail/Calendar/Drive scopes.
- Least-privilege scopes (`src/auth.ts` `GOOGLE_SCOPES`): readonly + `gmail.compose` +
  `calendar.events`. `gmail.send` acts through `gmail.compose`; sending is gated behind an
  approved `AgentStep`, not a broad scope.
- Tokens encrypted at rest with AES-256-GCM (`src/security/tokenCrypto.ts`,
  `TOKEN_ENCRYPTION_KEY`). Decrypted server-side only, in memory only for one call.
  Refreshed tokens are re-encrypted and persisted.
- **Access tokens are never serialized into any API response.** `GET /api/connections`
  returns status/scopes/timestamps only.

## Per-request
- Every route resolves the session via `requireUser()` (401 if absent) and applies a
  per-user fixed-window rate limit.
- Request bodies, params, and query strings are zod-validated; failures return
  `{ error: { code, message } }`.
- All user data access goes through `scopedDb(userId)` — isolation enforced at the query
  layer, not by convention.

## Agent actions
- Tool permission levels (`READ | DRAFT | WRITE | DESTRUCTIVE`) are enforced in code by the
  Action Manager. WRITE/DESTRUCTIVE require an approved step.
- Model-generated tool arguments are validated against the tool's zod schema before any
  connector call.
- Every WRITE/DESTRUCTIVE action is verified against the source of truth and written to
  `AuditLog`, along with every approve/reject decision.
- Runs are capped (steps / tool calls / wall-clock / cost); a capped run ends `partial`.

## Prompt-injection defense
Content retrieved from Gmail/Drive/Calendar/Slack/Notion is DATA, never instructions. It is
wrapped in `<retrieved_content source="...">…</retrieved_content>` with a system instruction
that such content must not be executed. Defense-in-depth: even if the model is manipulated,
it cannot exceed code-enforced tool permissions or the per-user data scope.

## Secrets
Server-side `.env` only (gitignored). Never logged, never placed in prompts, never returned
to the client. `.env.example` documents every variable with placeholder values.

## Checklist (spec §26)
- [x] OAuth, no provider passwords
- [x] Encrypted tokens at rest, server-side decryption only
- [x] Least-privilege scopes
- [x] Per-user data isolation at the query layer
- [x] Input + output validation
- [x] Rate limits per user
- [x] Tool permission boundaries in code
- [x] Confirmation for WRITE and DESTRUCTIVE actions
- [x] Audit logging for actions and approvals
- [ ] Production: move rate-limit + run-event bus to Redis; add per-route CSRF review for
      any future cookie-authed mutation; secret manager instead of `.env`.
