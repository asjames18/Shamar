# Roadmap — Shamar

Derived from the project charter (§48–§51). Each phase ends with something working and testable. No phase starts before the previous one is stable.

## Phase 0 — Research + Foundation ✅ (in progress)

- [x] Vision, roadmap, architecture docs
- [x] Competitive landscape research (`docs/competitive-landscape.md`)
- [x] ADRs for core decisions (`docs/adr/`)
- [x] Repo structure, contributing/security docs, CI
- [x] Lint/test/build checks
- [x] Docker Compose local stack

## Phase 1 — First Working Vertical Slice (MVP core)

Prove the concept end to end:

1. **Agent Registry** — create, edit, delete, list, inspect agents (id, name, description, department, owner, provider, model, status, tools, budget, autonomy level).
2. **Event ingestion API** — `POST /events` accepts machine-readable events (`agent.started`, `model.called`, `tool.called`, `task.completed`, `task.failed`, …). HMAC/API-key auth.
3. **Dashboard** — total agents, active agents, recent activity, basic usage.
4. **Agent detail page** ✅ — identity, purpose, model, provider, owner, tools, recent events, usage metrics, last heartbeat. API: `GET /api/agents/:id/detail` (usage rollups + activity timeline); dashboard has a clickable agent detail view with live refresh.
5. **Example client** — script that registers an agent, sends heartbeat, submits events; activity appears on dashboard in real time.
6. **TypeScript SDK (minimal)** — `register`, `heartbeat`, `event`, `taskStarted`, `taskCompleted`.

**Exit criteria:** the charter's first slice works — a user creates "Research Agent" in the UI, an external script reports started/model-called/task-completed, the dashboard updates, and the agent detail page shows the activity and last check-in.

## Phase 2 — Local Model Integration (zero-cost AI)

1. Ollama provider adapter: discover installed models, associate a model with an agent.
2. Test invocation from Shamar (prompt → response), recording tokens, latency, cost ($0 for local).
3. Execution shown on the agent's timeline.

**Exit criteria:** Shamar + Ollama proves zero-cost AI operation; a local model call appears as a real event with real latency/usage numbers.

## Phase 3 — Cloud Provider Adapters

One documented adapter at a time, using only official interfaces. Start with whichever has the cleanest developer implementation (likely OpenRouter or OpenAI BYOK):

1. Credential validation (test call, never stored in logs).
2. Model discovery where the API supports it.
3. Test invocation with usage capture.
4. Basic cost estimation **only from documented pricing** — never guess billing numbers.

**Exit criteria:** at least one BYOK cloud provider fully working: validate → discover → invoke → usage/cost recorded.

## Phase 4 — Governance Foundations

- Agent identity model (agent_id, org, owner, permissions, spending authority).
- Human approval rules and approval request/grant/deny events.
- Budgets: per agent / per department, with warnings and throttling.
- Policy basics: `policy.blocked` events, autonomy levels (L0–L5).

## Phase 5 — Organization View

- Departments, org chart visualization of agents.
- Human → Agent, Agent → Agent delegation graphs.
- Agent lifecycle: onboard, assign supervisor, grant tools, pause, retire, clone.

## Phase 6 — Analytics & Value

- Cost by agent / department / model / provider.
- Task success rates, average duration, error rates.
- First pass at value metrics: tasks completed, human hours saved (explicitly estimated, never fabricated).

## Later (not MVP)

Marketplace, advanced compliance packs, enterprise SSO, long-term audit retention, managed connectors, multi-tenancy, formal OpenTelemetry alignment, Python SDK, external framework integrations (LangGraph, CrewAI, AutoGen…).

## Priority Algorithm (from charter §43)

P0 security vulnerability → P1 broken build → P2 MVP blockers → P3 architecture problems → P4 test coverage → P5 DX → P6 docs → P7 new MVP features → P8 UI polish → P9 future experiments. No UI polish while core functionality is broken.
