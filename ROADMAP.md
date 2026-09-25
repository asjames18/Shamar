# Roadmap — Shamar

Derived from the project charter (§48–§51). Each phase ends with something working and testable. No phase starts before the previous one is stable.

## UI/UX track — runs alongside every phase (Antonio's directive 2026-09-23)

People judge a product by how it looks *and* by whether it works. So every phase ships with its UI brought up to a modern standard — not "functionality first, pretty later." As each phase's features land, their screens get the modern/responsive treatment in the same cycle.

- **Mobile-first, responsive everywhere.** Design for the phone first — most people live on mobile — then scale up cleanly to tablet and desktop. No cramped tables on small screens, no wasted empty space on big ones.
- **Modern and attractive.** Clean, consistent visual design people actually want to look at: a shared design system (colors, type, spacing), polished states (loading, empty, error), subtle motion where it earns its place.
- **Works the right way too.** Looking nice is table stakes — forms validate honestly, errors say what went wrong, statuses are truthful, nothing silently fails. If it's broken, fix function before polish; if it works, make it beautiful.
- Applies to the dashboard/product UI first; the public demo + landing site follows the same standard.

## Where we are (2026-09-25 ~16:36 EDT)

- **Done (feature work):** Phases 0, 1, 3, 4, 5, 6. Phase 0 foundation; Phase 1 vertical slice (exit criteria met 2026-09-23); **Phase 3 cloud adapters COMPLETE 2026-09-23 ~19:30** (OpenRouter + Anthropic + OpenAI + Gemini BYOK; live keys still need Antonio); **Phase 4 governance COMPLETE 2026-09-23 ~22:10**; **Phase 5 COMPLETE 2026-09-23 ~23:40**; **Phase 6 COMPLETE 2026-09-25** (analytics summary + value/human-hours-saved, ADR-0008).
- **Phase 2 — implemented, close-out still open:** Ollama adapter is implemented and verified against a mock daemon; **real-daemon verification still pending** (Antonio's machine). Do **not** treat Phase 2 exit criteria as fully met until that run lands.
- **Done:** GFI drafts 01–07 (PRs #8–#14) — queue cleared. SDK lifecycle (#8 / GFI 07), SDK deleteAgent (#9 / GFI 01), GET /api/providers/:id (#10 / GFI 02), sanitize event limit (#11 / GFI 03), Python example (#12 / GFI 04), seed --reset (#13 / GFI 05), dashboard Providers health (#14 / GFI 06 @ `af0f8ad`).
- **Done:** Demo polish pass COMPLETE 2026-09-23 ~17:15 (simulated live stream, 6-agent fleet, visual polish). Launch post remains HELD pending Antonio's demo verdict.
- **UI/UX polish pass (this unit):** Antonio-authorized standing UI track — focused dashboard clarity / spacing / hierarchy / empty-error-loading states / mobile table scroll / Providers consistency in `apps/web/index.html`. No new product features.
- **Next / hold:** Hold for merge of `feat/dashboard-ui-ux-polish`, then pause inventing new GFI/MVP work until Antonio (via CoS) picks the next AgentOS unit. Antonio-gated remain: demo verdict / launch post; live BYOK for cloud providers; Phase 2 real-daemon Ollama; custom domain.

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
5. **Example client** ✅ — script that registers an agent, sends heartbeat, submits events; activity appears on dashboard in real time.
6. **TypeScript SDK (minimal)** ✅ — `register`, `heartbeat`, `event`, `taskStarted`, `taskCompleted` (+ `taskFailed`, `modelCalled`, `toolCalled`, batch ingest, detail/summary reads). Zero runtime deps; `packages/sdk` with integration tests.
7. **Demo seed script** ✅ — `scripts/seed-demo.js` uses the SDK to seed 4 demo agents (Support/Sales/Research/Finance), a demo Ollama provider, ~2 days of backfilled activity + a fresh round of recent events per run; idempotent by name; verified E2E against real SQLite.

**Exit criteria:** the charter's first slice works — a user creates "Research Agent" in the UI, an external script reports started/model-called/task-completed, the dashboard updates, and the agent detail page shows the activity and last check-in. ✅ **Met 2026-09-23** — dashboard gained an Add-agent form (name required, optional identity fields); verified E2E: form-style POST → heartbeat → agent.started/model.called/task.completed → summary showed 1 agent / 5 events / 24h, detail showed correct usage rollups, timeline, and last check-in.

## Phase 2 — Local Model Integration (zero-cost AI)

1. Ollama provider adapter: discover installed models, associate a model with an agent. ✅ (2026-09-23) — `@shamar/providers` package: `OllamaAdapter` implements `ProviderAdapter` (ADR-0004) using only the documented Ollama REST API (`GET /api/tags`, `POST /api/chat` non-streaming); token counts from Ollama's own `prompt_eval_count`/`eval_count`, never fabricated; `estimateCost` returns 0 (local inference has no provider charge — definitional, not estimated). API: `GET /api/providers/:id/models`. Unreachable daemon → clear "not reachable" error, never a fake success.
2. Test invocation from Shamar (prompt → response), recording tokens, latency, cost ($0 for local). ✅ (2026-09-23) — `POST /api/providers/:id/invoke` `{agent_id, model, messages, max_tokens?}` → real `InvokeResult` (text returned to caller, never stored) + `model.called` event with tokens_in/out, duration_ms, cost_usd 0. Input validated before the model is touched; prompt/response bodies never persisted.
3. Execution shown on the agent's timeline. ✅ (2026-09-23) — the `model.called` event appears in `GET /api/agents/:id/detail` usage rollups and newest-first timeline.
4. Provider validation: `POST /api/providers/:id/validate` now performs a real reachability check for Ollama (updates provider `status` + `last_health_check`); unimplemented kinds still return honest 501.

**Caveat:** no Ollama daemon exists in this sandbox, so Phase 2 was verified against a mock Ollama HTTP server implementing `/api/tags` + `/api/chat`. The adapter needs one real-daemon run on Antonio's machine (or any Ollama host) to close Phase 2: `ollama pull llama3.2 &&` invoke via the API.

**Exit criteria:** Shamar + Ollama proves zero-cost AI operation; a local model call appears as a real event with real latency/usage numbers. ⏳ pending the real-daemon run above.

## Phase 3 — Cloud Provider Adapters

One documented adapter at a time, using only official interfaces. Start with whichever has the cleanest developer implementation (likely OpenRouter or OpenAI BYOK):

1. Credential validation (test call, never stored in logs).
2. Model discovery where the API supports it.
3. Test invocation with usage capture.
4. Basic cost estimation **only from documented pricing** — never guess billing numbers.

**Exit criteria:** at least one BYOK cloud provider fully working: validate → discover → invoke → usage/cost recorded.

- [x] **OpenRouter (2026-09-23)** — first BYOK cloud adapter: `OpenRouterAdapter` in `packages/providers/src/openrouter.ts` using only documented APIs (`GET /api/v1/auth/key` for free key validation, `GET /api/v1/models` for discovery incl. documented per-token pricing, `POST /api/v1/chat/completions` for invoke). Key from constructor or `OPENROUTER_API_KEY` env (never logged/stored/echoed); `estimateCost` computed from documented pricing only, null until a `/models` call populates the process cache — never guessed. Wired through existing `/api/providers/:id/{models,validate,invoke}` endpoints with zero server changes. Tests: 8 new unit tests (mock OpenRouter server) — 51/51 pass; E2E against a live API + mock OpenRouter confirmed validate → discover → invoke → `model.called` event with real usage and cost_usd recorded. **Not yet run against a real OpenRouter key** — needs Antonio's BYOK key for the live check.
- [x] **Anthropic (2026-09-23 ~18:30)** — second BYOK cloud adapter: `AnthropicAdapter` in `packages/providers/src/anthropic.ts` using only documented APIs (`GET /v1/models` doubles as free key validation — 200 = valid key, 401 = bad; `POST /v1/messages` for invoke with `anthropic-version: 2023-06-01` + `x-api-key` headers). Key from constructor or `ANTHROPIC_API_KEY` env (never logged/stored/echoed); `estimateCost` always returns null — the Anthropic API exposes no pricing endpoint, so there is no documented source to compute from (never guessed, ADR-0003). Wired through existing `/api/providers/:id/{models,validate,invoke}` endpoints with zero server changes. Tests: 7 new unit tests (mock Anthropic server) — 58/58 pass; E2E against a live API + mock Anthropic confirmed validate → discover → invoke → `model.called` event with real usage and cost_usd=null (honest). **Not yet run against a real Anthropic key** — needs Antonio's BYOK key for the live check.
- [x] **OpenAI (2026-09-23 ~19:00)** — third BYOK cloud adapter: `OpenAIAdapter` in `packages/providers/src/openai.ts` using only documented APIs (`GET /v1/models` doubles as free key validation — 200 = valid key, 401/403 = bad; `POST /v1/chat/completions` for invoke with real usage from `usage.prompt_tokens`/`usage.completion_tokens`). Key from constructor or `OPENAI_API_KEY` env, sent only in the `Authorization: Bearer` header (never logged/stored/echoed); `estimateCost` always returns null — the OpenAI API exposes no pricing endpoint, so there is no documented source to compute from (never guessed, ADR-0003). Wired through existing `/api/providers/:id/{models,validate,invoke}` endpoints with zero server changes. Tests: 7 new unit tests (mock OpenAI server) — 65/65 pass; E2E against a live API + mock OpenAI confirmed validate → discover → invoke → `model.called` event with real usage (50+25 tokens) and cost_usd=null (honest). **Not yet run against a real OpenAI key** — needs Antonio's BYOK key for the live check.
- [x] **Gemini (2026-09-23 ~19:30)** — fourth and final BYOK cloud adapter: `GeminiAdapter` in `packages/providers/src/gemini.ts` using only documented APIs (`GET /v1beta/models?key=` doubles as free key validation — 200 = valid key, 400/403 = bad — and model discovery; `POST /v1beta/models/{model}:generateContent?key=` for invoke with real usage from `usageMetadata.promptTokenCount`/`candidatesTokenCount`). System messages map to the documented `systemInstruction`; user/assistant → user/model roles. Key from constructor or `GEMINI_API_KEY` env, sent only as the documented `key` query param (never logged/stored/echoed, never in a header). `estimateCost` always returns null — the Gemini API exposes no pricing endpoint, so there is no documented source to compute from (never guessed, ADR-0003). Wired through existing `/api/providers/:id/{models,validate,invoke}` endpoints with zero server changes. **All provider kinds now implemented — the honest-501 path is retired** (API + adapter tests updated). Tests: 7 new unit tests (mock Gemini server) — 72/72 pass; E2E against a live API + mock Gemini confirmed validate → discover → invoke → `model.called` event with real usage (50+25 tokens) and cost_usd=null (honest). **Not yet run against a real Gemini key** — needs Antonio's BYOK key for the live check.
- [x] **Phase 3 cloud adapters COMPLETE (2026-09-23 ~19:30)** — Ollama (local) + OpenRouter + Anthropic + OpenAI + Gemini all working: validate → discover → invoke → usage/cost recorded. Exit criteria met.

## Phase 4 — Governance Foundations

- Agent identity model (agent_id, org, owner, permissions, spending authority). *(Mostly in place: Agent carries owner, permissions, supervisor_agent_id, budget_monthly_usd, autonomy_level.)*
- ✅ Human approval rules and approval request/grant/deny events (2026-09-23): approval request/grant/deny workflow — `POST /api/approvals`, `GET /api/approvals?agent_id=&status=`, `POST /api/approvals/:id/grant|deny`; every transition in the event trail (`approval.requested/granted/denied`, decided_by + reason recorded); decided requests can't be undecided or double-decided (fail closed); `pending_approvals` on dashboard summary + agent detail; web dashboard card + per-agent Grant/Deny buttons. 75/75 tests. *Known limitation: v0.1's single shared API key can't enforce that the granter is human — audit trail records decided_by as declared; per-human auth is a follow-up.*
- ✅ Budgets (2026-09-23): per-agent monthly budgets — `budget.warning` at 80%, `budget.exceeded` at 100% (edge-triggered, at most once each per calendar month), invoke endpoint throttled (403 + `policy.blocked` audit event) when spend is at budget, checked before any provider call; live budget meter on the agent detail page; `budget` block on `AgentDetail` (limit/spend/pct/status). Spend counts only real reported costs (unknown stays out — ADR-0003). 78/78 tests.
- ✅ Department budgets (2026-09-23, ADR-0007): shared monthly budget pools — `department_budgets` table (name PK, cap, fired-alert months), `PUT/GET /api/departments/:name/budget`, `GET /api/departments` (agent counts + meters), spend summed across member agents per calendar month; `department.budget.warning`/`department.budget.exceeded` edge-triggered once per month on the triggering agent's timeline (distinct types — per-agent dedup can never cross-contaminate); invoke gate order autonomy → per-agent budget → department budget, 403 + `policy.blocked` (reason `department_budget_exceeded`) when a pool is exceeded; dashboard department budgets card with meters + inline set/clear; `department_budget` meter on agent detail. 90/90 tests.
- Policy basics: autonomy levels (L0–L5) with enforcement; `policy.blocked` now emitted for budget throttling.

## Phase 5 — Organization View

- Departments, org chart visualization of agents.
- Human → Agent, Agent → Agent delegation graphs.
- Agent lifecycle: onboard, assign supervisor, grant tools, pause, retire, clone. ✅ **pause/resume/retire/clone done 2026-09-23 ~23:15** — `POST /api/agents/:id/{pause,resume,retire,clone}` with server-side transition rules (retire is terminal, fails closed 409), audit events `agent.paused/resumed/retired/cloned` on the trail, invoke gate fails closed for paused/retired agents (`policy.blocked`), dashboard lifecycle buttons on agent detail. SDK methods ✅ done (good-first-issue 07) — `ShamarClient.pause/resume/retire/clone`.

## Phase 6 — Analytics & Value

- ✅ Cost by agent / department / model / provider (2026-09-25) — `GET /api/analytics/summary` SQL aggregations; sums only known `cost_usd` (nulls stay out, never fabricated); default window all-time; optional `?since=` / `?window=24h|7d|30d|month`; dashboard Analytics section (mobile-first).
- ✅ Task success rates, average duration, error rates (2026-09-25) — `task.completed` vs `task.failed` success rate; avg `duration_ms` where present; error_events = `task.failed` + `tool.failed`.
- ✅ First pass at value metrics (2026-09-25): `value` on analytics summary — tasks completed, human hours saved from explicit `human_minutes_saved` only (null when unknown; never invent ROI); ADR-0008; dashboard honesty matching cost.

## Later (not MVP)

Marketplace, advanced compliance packs, enterprise SSO, long-term audit retention, managed connectors, multi-tenancy, formal OpenTelemetry alignment, Python SDK, external framework integrations (LangGraph, CrewAI, AutoGen…).

## Priority Algorithm (from charter §43)

P0 security vulnerability → P1 broken build → P2 MVP blockers → P3 architecture problems → P4 test coverage → P5 DX → P6 docs → P7 new MVP features → P8 UI polish → P9 future experiments. No UI polish while core functionality is broken. *(Note 2026-09-23: the UI/UX track above supersedes "P8 UI polish" as a standing track — each phase ships with modern, mobile-first UI in the same cycle; broken functionality is still fixed before its polish.)*
