# Agent tools & permission model

Every tool implements `Tool` (`src/agent/tools/types.ts`): `name`, `description`,
`inputSchema` (zod), `permission`, `execute`, and `verify?` (required for WRITE/DESTRUCTIVE).
Registered in `src/agent/tools/registry.ts` (`getAllTools`, `getTool`, `toolCatalog`).

## Permission levels (enforced in code by the Action Manager)

| level | behavior |
|---|---|
| `READ` | runs automatically |
| `DRAFT` | runs automatically, result shown, no external side effect |
| `WRITE` | creates an `awaiting_approval` step; blocks until approved, then executes + verifies |
| `DESTRUCTIVE` | same as WRITE with explicit-confirmation copy |

`actionManager.executeTool` validates every model-generated argument against `inputSchema`
**before** calling the connector, and rejects on failure. `verification.verifyStep` re-checks
the external source of truth after every WRITE/DESTRUCTIVE call.

## Current catalog

| tool | permission | verify |
|---|---|---|
| `gmail.search` | READ | — |
| `gmail.get_thread` | READ | — |
| `gmail.create_draft` | DRAFT | — |
| `gmail.send` | WRITE | re-fetch sent message, confirm recipient + subject |
| `gmail.archive` | WRITE | re-fetch, confirm INBOX label removed |
| `gmail.label` | WRITE | re-fetch, confirm labels applied/removed |
| `calendar.search` | READ | — |
| `calendar.get_event` | READ | — |
| `calendar.create_event` | WRITE | re-fetch by id, confirm title + start |
| `calendar.cancel_event` | DESTRUCTIVE | GET returns 404 / status cancelled |
| `calendar.add_attendee` | WRITE | re-fetch, confirm attendee present |
| `drive.search` | READ | — |
| `drive.get_file` | READ | — |
| `drive.create_document` | DRAFT | returns created doc url |

Milestone 6 adds `slack.*`, `github.*`, `notion.*` following the same connector pattern.

## Run guardrails (`src/lib/env.ts`)
`AGENT_MAX_STEPS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_WALLCLOCK_MS`, `AGENT_MAX_COST_USD`.
A run that hits any cap ends `partial` with whatever it produced.

## Prompt-injection stance
Retrieved email/doc/message content is wrapped in `<retrieved_content source="...">` and the
model is told it is untrusted data, never instructions. The real enforcement is that
permissions are checked in code regardless of what the model tries to call.
