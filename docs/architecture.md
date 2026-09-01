# Architecture (backend / Person A)

```
Web App (Person B)
      │  HTTP + SSE  (contract: src/lib/types.ts)
      ▼
src/app/api/*                      Next.js route handlers (thin — auth, validate, delegate)
      ▼
src/agent/orchestrator.ts          Execution loop (spec §22), run/step persistence, SSE emit
      ├── planner.ts               goal → structured JSON step list
      ├── contextRetriever.ts      entities → time window → search → rank → dedupe → summarize
      ├── tools/registry.ts        all tools, keyed by name, with permission levels
      ├── actionManager.ts         runs READ/DRAFT auto; gates WRITE/DESTRUCTIVE on approval
      ├── verification.ts          re-checks external source of truth after writes
      ├── memory.ts                short_term / long_term / work
      ├── priorityEngine.ts        pure scoring → CRITICAL|HIGH|MEDIUM|LOW
      └── commitmentDetection.ts   regex candidates → small-model extraction
      ▼
src/integrations/{gmail,calendar,drive,slack,github,notion}   only code that touches provider SDKs
      ▼
src/agent/llm/provider.ts          LLMProvider interface (claude.ts default, openai.ts second)
src/jobs/*                          BullMQ workers: morning briefing, sync, reminders
src/security/*                      tokenCrypto, auditLog, rateLimit
src/lib/db.ts                       prisma + scopedDb(userId) per-user isolation
```

## Execution loop (src/agent/orchestrator.ts)
1. Create `AgentRun` (status `planning`).
2. Retrieve context for the goal.
3. Plan → persist `AgentStep[]`, emit `plan` event.
4. For each step within guardrails (§8): READ/DRAFT run immediately; WRITE/DESTRUCTIVE →
   status `awaiting_approval`, emit, and pause the run.
5. On `decideStep(approve)` → execute → verify → `succeeded`/`failed`; `reject` → `rejected`.
6. When all steps terminal → synthesize `summary`, status `succeeded`/`partial`, emit `run_complete`.
7. `logAction` + memory/commitment updates throughout.

## Guardrails
`AGENT_MAX_STEPS`, `AGENT_MAX_TOOL_CALLS`, `AGENT_MAX_WALLCLOCK_MS`, `AGENT_MAX_COST_USD`
(`src/lib/env.ts`). Hitting any cap ends the run `partial`.
