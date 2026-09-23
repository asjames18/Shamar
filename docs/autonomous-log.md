# Autonomous Development Log

Concise record of each work cycle: timestamp, task, changes, tests, risks, next task.

## 2026-09-23 ~15:20 EDT - Docs: Justin Carter contribution credit commit

**Task:** Land a small docs contribution under Justin Carter's GitHub identity so the Contributors graph includes @justincarterdev.

**Changes:** CONTRIBUTORS.md intro wording ("People who build and maintain Shamar."); this log note.

**Next:** Merge when Antonio clears.
## 2026-09-23 ~15:12 EDT — Docs: Justin Carter contributor credit

**Task:** Credit Justin Carter (@justincarterdev) as a normal contributor in public docs.

**Changes:** CONTRIBUTORS.md lists Justin Carter with GitHub link only; removed prior special-role wording from this PR's docs.

**Next:** Antonio merge of PR #1 after review.

## 2026-09-23 ~15:00 EDT — Docs: CONTRIBUTORS credit

**Task:** Add public CONTRIBUTORS.md listing Antonio (@asjames18) as creator/maintainer and Justin Carter (@justincarterdev) as contributor, plus README link.

**Changes:** CONTRIBUTORS.md; README Docs + Contributing links; this log note.

**Next:** none for this docs PR.
## 2026-09-23 12:45–13:00 EDT — Phase 0: Research + Foundation (cycle 1)

**Task selected:** Charter §57 first assignment — landscape research, architecture proposal, foundation docs, MVP skeleton.

**Naming decision (from Antonio, mid-cycle):** "AgentOS" collides with existing projects. Dropped from all docs; neutral phrasing ("the project", "the control plane") used everywhere. "agentos" remains only as the working-directory name. No logos/brand assets/domains.

**Research:** Delegated to a child agent. Wrote `docs/competitive-landscape.md` (10 verified competitors: Langfuse, LangSmith, Arize Phoenix, LiteLLM, OpenRouter, Portkey, Helicone, AgentOps, Composio, Braintrust + honorable mentions). Key gaps found: no workforce/HRIS view anywhere (all tracing-first); no durable per-agent identity; cost observed but never enforced (no per-agent budgets with kill-switches); consolidation (Portkey→Palo Alto, OpenRouter→Stripe) leaves an indie-OSS wedge; OpenLLMetry standardized instrumentation but owns no management layer.

**Docs written:**
- `VISION.md`, `ROADMAP.md` (Phases 0–6 from charter §48–51), `ARCHITECTURE.md`
- `docs/adr/0001-modular-monolith.md`, `0002-database.md` (SQLite default, narrow Storage interface, Postgres later), `0003-agent-event-schema.md` (append-only events, null-cost-never-guessed, unknown types rejected), `0004-provider-interface.md` (ProviderAdapter, documented APIs only)
- `README.md` (60-second pitch + quickstart), `CONTRIBUTING.md`, `SECURITY.md`, `docs/license-strategy.md` (leans Apache 2.0, pending Antonio's approval — no LICENSE committed)
- `.env.example` (no secrets), `.gitignore` (env/keys/dbs ignored), `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.github/workflows/ci.yml` (build+lint+test+secret-scan)

**Code (MVP skeleton, working):**
- `packages/types`: Agent, AgentEvent, Provider, ProviderAdapter, KNOWN_EVENT_TYPES (21 types)
- `apps/api`: zero-runtime-dependency Node HTTP server; endpoints: agent CRUD, heartbeat, event ingest (single+batch), event query, provider registry, dashboard summary; scrypt-hashed API-key auth; SQLite via node:sqlite (zero-config, zero-cost)
- `apps/web`: static dashboard (nginx) — agent cards, agent table, recent activity, 5s refresh
- `examples/register-and-report.js`: zero-dep client — register → heartbeat → agent.started/model.called/task.completed

**Tests run:** `npm run lint` ✅ · `npm run typecheck` (via build) ✅ · `npm test` — 15/15 pass ✅ (auth, CRUD validation, heartbeat, event type rejection, batch ingest, unknown-agent rejection, dashboard rollups, no credential echo, delete).
**E2E verified:** real server + SQLite file + example client → dashboard summary returned correct counts (1 agent, 5 events). ✅
**Security self-review:** no secrets committed (only `.env.example` placeholder); API keys hashed with scrypt + timingSafeEqual; credential material never echoed by provider endpoints; prompt/response bodies not stored by default; cost recorded as NULL when unknown. One honest stub: `POST /api/providers/:id/validate` returns 501 rather than faking a check.

**Risks / open items:**
- Docker not installed in this sandbox — `docker compose up` path unvalidated here; Dockerfiles/compose YAML are standard but need a real run on a Docker machine.
- `DATABASE_URL` (Postgres) explicitly rejected with a clear error until the backend is implemented (ADR-0002).
- tsconfig `rootDir` inheritance gotcha fixed (must override per-project); noted for future packages.

**Next logical task (Phase 1):** flesh out the vertical slice — agent detail data on dashboard (per-agent recent events + usage), TypeScript SDK package (`packages/sdk`: register/heartbeat/event helpers), seed demo data script, then Phase 2 Ollama adapter.

## 2026-09-23 ~13:00 EDT — Phase 1, cycle 1: Agent detail view (API + dashboard)

**Task selected:** Priority order item 1 — per-agent detail data on the dashboard (charter's first vertical slice exit criteria: agent detail page shows activity, basic usage, last check-in).

**Changes:**
- `packages/types/src/index.ts`: added `AgentUsage` (event totals, events_by_type, token totals, model/tool call counts, task completion counts, first/last seen) and `AgentDetail` (agent + last_check_in + usage + newest-first timeline).
- `apps/api/src/store.ts`: `Storage.getAgentDetail(id)` + SQLite implementation (single aggregate query; costs never estimated — sums only client-reported tokens).
- `apps/api/src/server.ts`: `GET /api/agents/:id/detail` (404 for unknown agent). Route placed before the generic `/api/agents/:id` match.
- `apps/api/src/test/api.test.ts`: 2 new tests (404 case; rollups + timeline ordering + null cost).
- `apps/web/index.html`: clickable agent names; detail view with identity panel (owner, department, provider, model, autonomy, budget, tools, permissions), usage cards, last check-in with relative time, and activity timeline (type, summary, tokens in/out, duration) with 5s live refresh and back-link.
- Fix: timeline ordering made deterministic (`ORDER BY occurred_at DESC, rowid DESC`) — same-millisecond events were nondeterministic; caught by the new test.
- Hygiene: `package.json` license fields corrected to `Apache-2.0` (LICENSE committed/approved 2026-09-23); added `*.tsbuildinfo` to `.gitignore`.

**Tests run:** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` — **17/17 pass** ✅ (15 existing + 2 new).
**E2E verified:** live server + SQLite + `examples/register-and-report.js` → `/api/agents/:id/detail` returned correct identity, usage (5 events, 1840/320 tokens, 1 model call, 1 task completed), `last_check_in` set, timeline newest-first. Dashboard inline JS passes `node --check`.
**Security self-review:** no secrets touched; detail endpoint is behind existing API-key auth; no prompt/response bodies exposed (they were never stored); cost stays NULL/omitted, never estimated; HTML escaping reused existing `esc()` helper for all injected fields.

**Next logical task (Phase 1):** TypeScript SDK package (`packages/sdk`: register / heartbeat / event helpers, zero deps), then seed demo-data script, then Phase 2 Ollama adapter.

## 2026-09-23 ~13:00 EDT — Naming: project renamed to Shamar

**Decision:** Antonio committed to **Shamar** (Hebrew שמר — "to keep, guard, watch over"), solo, no compound.
**Screen:** Round 3 (`docs/naming-screen-round3-shamar.md`) returned **Medium** risk — one weak exact-name collision (`coolsam726/shamar`, 1-star solo AdonisJS admin-panel project, unrelated category; `@shamar` npm scope taken), no AI company, no live software trademark (USPTO SHAMAR serial 88369600 dead 5/15/2026). "Shamar HQ" fallback screened clean (Low). npm/PyPI exact-name checks failed technically (unverified); trademark signals web-search level, not TESS — preliminary, not legal clearance.
**Changes:** docs-only rename — VISION.md, README.md, ROADMAP.md, ARCHITECTURE.md, competitive-landscape.md now use Shamar; positioning: "Shamar — Mission control for humans, agents, models, tools, and autonomous work." / "Open-source infrastructure for managing AI workforces." Working dir `~/workspace/agentos/` unchanged (dev agent mid-work; cron references it). No logos, brand assets, or domains created. Final sign-off on the screen remains with Antonio (see namespace costs in round-3 report: npm scope, GitHub org name, search noise).

## 2026-09-23 ~13:15 EDT — Phase 1, cycle 2: TypeScript SDK package

**Task selected:** Phase 1 item 6 — minimal TypeScript SDK (`register`/`heartbeat`/`event`), P7.

**Changes:**
- `packages/sdk/` (new): `ShamarClient` — zero runtime deps (global fetch, Node ≥ 18). Auth via `x-api-key`/`Authorization: Bearer`; key from constructor or `SHAMAR_API_KEY` env; base URL from `SHAMAR_BASE_URL` env or `http://localhost:4000`.
- Methods: `register`, `updateAgent`, `listAgents`, `getAgent`, `getAgentDetail`, `heartbeat`, `event`, `eventsBatch` (empty array short-circuits, no network), `dashboardSummary`; helpers `agentStarted`, `taskStarted`, `taskCompleted`, `taskFailed`, `modelCalled`, `toolCalled`. `ShamarError` carries HTTP `status` (null on network failure) + parsed body. Tokens reported as measured; cost never asserted by the client (ADR-0003).
- `packages/sdk/src/test/sdk.test.ts`: 13 tests against a mock HTTP server mirroring the API contract (auth header, paths, single-vs-batch response shapes, 404/401, network failure).
- Root `package.json`: build/lint/typecheck/test now include `packages/sdk`; eslint glob extended.
- `packages/sdk/README.md` with usage example; ROADMAP.md SDK item marked ✅; README repo-layout line updated.

**Bug found by tests:** mock mirrored the real server's single-event unwrap (`{events: <bare event>}`, not an array) — SDK's `event()` initially returned undefined for it. Fixed to handle both shapes; verified against the real server E2E (register → heartbeat → started/model.called/task.completed → detail: 5 events, 1 task, 500 tok-in, all cost_usd null, newest-first timeline; summary: 1 agent, 5 events/24h).

**Tests run:** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` — **31/31 pass** ✅ (17 existing + 14 new).
**Security self-review:** no secrets touched (API key from env/ctor, never logged or echoed); no prompt/response bodies handled; cost stays null/omitted; `encodeURIComponent` on path ids.

**Next logical task (Phase 1):** seed demo-data script (`scripts/seed-demo.js` using the SDK), then Phase 2 Ollama adapter.

## 2026-09-23 ~13:45 EDT — Phase 1, cycle 3: SDK-based demo seed script

**Task selected:** Next Phase 1 item from the log — seed demo-data script (`scripts/seed-demo.js` using the SDK), P7.

**Changes:**
- `scripts/seed-demo.js` (new, executable, zero extra deps — uses the built `@shamar/sdk` + raw fetch only for provider registration, since the SDK has no provider methods yet).
- Seeds 4 demo agents (Support Responder, SDR Prospector, Research Analyst — active; Invoice Watcher — idle), a demo `Local Ollama` provider entry, ~2 days of backfilled activity (agent.started + task.started → model.called → tool.called → task.completed/failed cycles with realistic token counts, one failure for realism), plus a fresh round of recent events (<10 min old) and heartbeats per run.
- Idempotent: agents/providers matched by name and reused; each run appends new backfill + a fresh recent round. Usage: `SHAMAR_API_KEY=... node scripts/seed-demo.js [base-url] [api-key]` (also accepts `AGENTOS_DEV_API_KEY`); requires `npm run build` first for the SDK dist.
- `README.md`: quickstart section documents the seed command. `ROADMAP.md`: Phase 1 items 5 (example client ✅ — verified E2E in earlier cycles) and 7 (seed script ✅) marked done.

**Tests run:** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` — **31/31 pass** ✅ (unchanged count; no new unit tests — script is integration-verified instead).
**E2E verified:** real server + fresh SQLite on :4123 → seed run 1: 4 agents, 1 provider, 52 backfilled + 12 recent events, heartbeats, self-verify via `dashboardSummary` + `getAgentDetail` (4 agents, 24 events/24h). Run 2 (idempotency): agents/providers reused, no duplicates (4 agents, 40 events/24h). Detail rollups correct (Invoice Watcher: 30 events, 4 completed / 2 failed tasks, 6 model + 6 tool calls, 10220 tok-in, last_check_in set); all `cost_usd` NULL ✅ (ADR-0003). `node --check` on the script ✅. Temp server/DB cleaned up.
**Security self-review:** script errors out when no API key is supplied and never logs/echoes the key; no prompt/response bodies seeded; cost never asserted; no destructive operations (no deletes).

**Next logical task (Phase 1 → Phase 2):** Phase 1 exit criteria review — confirm the full first vertical slice (create "Research Agent" in UI → external script reports → dashboard updates → detail page shows activity); then Phase 2 Ollama provider adapter (model discovery + test invocation with real tokens/latency recorded as events).

## 2026-09-23 ~14:15 EDT — Phase 1, cycle 4: Dashboard agent-registration form (exit criteria met)

**Task selected:** P2 — the Phase 1 exit criteria required creating an agent *in the UI*, but the dashboard was read-only (agent creation was API-only). Added the missing UI path.

**Changes:**
- `apps/web/index.html`: "＋ Add agent" toggle revealing a registration form — Name (required), Description, Department, Owner, Provider, Model (optional). POSTs to `/api/agents` via new `post()` helper (JSON + x-api-key), surfaces 400 validation messages inline (e.g. `name is required`), clears the form, refreshes the agent list, and jumps to the new agent's detail view.
- Updated the dashboard hint text to mention the form.
- `ROADMAP.md`: Phase 1 exit criteria marked met with verification notes.

**Tests run:** `node --check` on extracted inline JS ✅ · `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` — **31/31 pass** ✅ (unchanged; no new unit tests — verified E2E instead).
**E2E verified (fresh SQLite, real server):** form-style POST `{name:"Research Agent", department:"Research", ...}` → 201; empty name → 400 `name is required`; heartbeat → 200 with `last_heartbeat_at` set; batch ingest of agent.started/model.called/task.completed (120/410 tokens) → `/api/dashboard/summary` returned 1 agent, 5 events/24h (incl. auto `agent.created` + heartbeat), recent types newest-first; `/api/agents/:id/detail` returned correct identity, usage rollups (1 model call, 1 task completed, 120/410 tokens), newest-first timeline, and `last_check_in` set. Temp server/DB cleaned up.
**Security self-review:** form fields pass through existing `esc()` HTML escaping on render; no secrets touched; create endpoint already behind API-key auth; user input is POSTed as JSON, never concatenated into HTML or queries.

**Milestone:** ✅ **Phase 1 vertical slice complete** — UI create → external script reports → dashboard updates → detail page shows activity and last check-in. All 7 Phase 1 items now ✅.

**Next logical task (Phase 2):** Ollama provider adapter — model discovery (`/api/tags`) + test invocation recorded as real events with measured tokens/latency. Caveat: no Ollama daemon in this sandbox, so discovery/invocation must be designed defensively (graceful "Ollama not reachable" state) and E2E-verified on Antonio's machine or a runner with Ollama installed.
