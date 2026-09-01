# Roadmap (shared checkpoints)

| # | Milestone | Backend (Person A) done-when |
|---|---|---|
| 1 | Foundation | app boots, Prisma schema migrated, Google sign-in works, `/api/me` + `/api/today` stub |
| 2 | Google | Gmail/Calendar/Drive connected, tokens encrypted, `search/get/create_draft` tools, sync job |
| 3 | Agent core | planner + retriever + tool registry + action manager + verification + `/api/agent/*` + SSE + audit |
| 4 | Morning brief | briefing job on schedule, priority engine, commitment detection, `/api/briefing/*`, `/api/today` real |
| 5 | Flagship | "Handle everything related to X" composes M2–M4, drafts+sends+verifies, `/api/people/:id` |
| 6 | Slack/GitHub/Notion | same connector pattern, retriever + priority engine extended |

Detailed per-task list: `PERSON_A_AGENT_BACKEND.md` §3.
