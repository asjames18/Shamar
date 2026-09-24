# Autonomous Development Log

Concise record of each work cycle: timestamp, task, changes, tests, risks, next task.

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

## 2026-09-23 ~15:00 EDT — Phase 2, cycle 1: Ollama provider adapter + model discovery/invocation API

**Task selected:** Phase 2 items 1–3 (Ollama adapter — discovery + test invocation recorded as real events). P2/P7.

**Changes:**
- `packages/providers/` (new workspace package `@shamar/providers`, zero runtime deps): `src/ollama.ts` — `OllamaAdapter implements ProviderAdapter` (ADR-0004) using only the documented Ollama REST API (`GET /api/tags`, `POST /api/chat` non-streaming). Token counts from Ollama's own `prompt_eval_count`/`eval_count` counters, never fabricated; `estimateCost` returns 0 (local inference has no provider charge — definitional, not estimated). Unreachable daemon → clear "Ollama not reachable at …" error, never a fake success. `src/index.ts` — `createProviderAdapter(kind, opts)` factory; unimplemented kinds throw (surfaced as HTTP 501).
- `apps/api/src/providers.ts` (new): `adapterFor(provider)` maps a stored provider record to its adapter; `NotImplementedError` for kinds without an adapter.
- `apps/api/src/store.ts`: `getProvider(id)`, `setProviderStatus(id, status)` (+ `last_health_check`); `appendEventInternal` now accepts internal-only `cost_usd` (defaults NULL); new public `appendServerEvent` for server-side event writes (client `/api/events` path still forces NULL per ADR-0003).
- `apps/api/src/server.ts`: `GET /api/providers/:id/models` (502 on daemon failure, 501 for unimplemented kinds); `POST /api/providers/:id/validate` now performs a real reachability check for Ollama and persists `healthy`/`unhealthy` status (unimplemented kinds → honest 501, replacing the old stub); `POST /api/providers/:id/invoke` `{agent_id, model, messages, max_tokens?}` — validates input before touching the model, invokes, appends `model.called` event (tokens_in/out, duration_ms, cost_usd 0, no prompt/response bodies persisted), returns `{text, usage, latency_ms, model, event}`.
- Root `package.json` build/lint/test/typecheck now include `packages/providers`; `eslint.config.mjs` covers the new package; `apps/api/package.json` declares `@shamar/providers` dep.
- `ROADMAP.md`: Phase 2 items 1–4 marked done with the real-daemon caveat; `README.md`: new endpoints documented.

**Tests run:** `npm run lint` ✅ · `npm run typecheck` ✅ · `npm test` — **43/43 pass** ✅ (31 existing + 12 new: 6 adapter unit tests against a mock Ollama HTTP server, 6 API endpoint tests incl. unreachable-daemon → ok:false/unhealthy, bad-input rejection before model touch, and unimplemented-kind → 501).
**E2E verified (real server, fresh SQLite, mock Ollama daemon):** provider create → models → validate (`ok:true, status:healthy`, 5ms) → invoke → `model.called` event with real tokens (42 in/17 out), 7ms latency, cost 0; agent detail shows 1 model call, rollups correct; event `data` contains only model/provider/latency — no prompt/response bodies. Temp server/DB cleaned up.
**Security self-review:** no secrets touched (Ollama needs no credential; validation is reachability, stated honestly); prompt/response bodies never logged or persisted (returned to caller only); client-asserted costs still rejected (server-side `appendServerEvent` only); message roles validated against a fixed allowlist; `AbortSignal.timeout` on all outbound calls.
**Caveat / risk:** no Ollama daemon in this sandbox — verified against a mock implementing the documented API surface. One real-daemon run on Antonio's machine closes Phase 2 (`ollama pull llama3.2`, then invoke via the API).

**Next logical task (Phase 2 close-out / Phase 3 prep):** real-daemon verification (needs Antonio's machine), or begin Phase 3 with the OpenRouter/OpenAI BYOK adapter design.

## 2026-09-23 ~15:15 EDT — Contributor-readiness sprint, cycle 1: issue templates + good-first-issue drafts

**Task selected:** P2 contributor-readiness — sprint items 3 (`.github/ISSUE_TEMPLATE/`) and 4 (good-first-issue drafts). No new product features.

**Changes:**
- `.github/ISSUE_TEMPLATE/bug_report.md` — structured bug template (repro steps, env, no-secrets warning, commit-hash field).
- `.github/ISSUE_TEMPLATE/feature_request.md` — problem/proposal/acceptance-criteria template with a project-principles fit checklist (zero-cost, provider-neutral, evidence-over-hype, no secrets).
- `.github/ISSUE_TEMPLATE/config.yml` — blank issues disabled; security reports routed to SECURITY.md (OWNER/REPO placeholder flagged for first push).
- `docs/good-first-issues/` — README index + 6 drafts, each with title, context, acceptance criteria, hints, effort: 01 SDK `deleteAgent` (S, SDK lacks it while API supports DELETE), 02 `GET /api/providers/:id` (S, agents have single-read, providers don't), 03 sanitize `?limit=` on `GET /api/events` (S, real bug), 04 stdlib-only Python example client (M), 05 `--reset` flag for seed-demo.js (S), 06 dashboard provider list + health/validate (M).
- `CONTRIBUTING.md` — cross-reference to the drafts folder and issue templates.

**Tests run:** markdown/YAML-only change — no code touched. Verified: YAML frontmatter parses on all three template files ✅; repo secret-scan grep (same patterns as CI) clean on all new files ✅. During drafting, confirmed a real bug worth an issue: `GET /api/events?limit=abc` → 500 (`datatype mismatch`) because `NaN` survives the clamp in `store.queryEvents` — reproduced against built dist, documented as draft 03 instead of fixing (kept this unit to onboarding materials per sprint rules).
**Security self-review:** no secrets, no code changes, no new attack surface; bug template explicitly warns against pasting keys; config.yml routes vuln reports to the private SECURITY.md path.
**Working tree:** clean; committed locally as `c437501` (never pushed — Mosheh syncs).

**Next logical task (sprint):** item 1 — expand CONTRIBUTING.md (prerequisites, install, how to run tests, branch/PR conventions, code style, definition of done); item 2 — README polish (demo link TBD — no live demo URL confirmed yet, needs Antonio's call per the launch-post gate); item 5 — verify every command in CONTRIBUTING/README quickstart by running it (docker compose path still unverifiable in this sandbox).

## 2026-09-23 ~15:00 EDT — Docs: CONTRIBUTORS credit

**Task:** Add public CONTRIBUTORS.md listing Antonio (@asjames18) as creator/maintainer and Justin Carter (@justincarterdev) as contributor, plus README link.

**Changes:** CONTRIBUTORS.md; README Docs + Contributing links; this log note.

**Next:** none for this docs PR.
## 2026-09-23 ~15:12 EDT — Docs: Justin Carter contributor credit

**Task:** Credit Justin Carter (@justincarterdev) as a normal contributor in public docs.

**Changes:** CONTRIBUTORS.md lists Justin Carter with GitHub link only; removed prior special-role wording from this PR's docs.

**Next:** Antonio merge of PR #1 after review.

## 2026-09-23 ~15:20 EDT - Docs: Justin Carter contribution credit commit

**Task:** Land a small docs contribution under Justin Carter's GitHub identity so the Contributors graph includes @justincarterdev.

**Changes:** CONTRIBUTORS.md intro wording ("People who build and maintain Shamar."); this log note.

**Next:** Merge when Antonio clears.

## 2026-09-23 ~15:44 EDT — IN PROGRESS: contributor-readiness sprint, cycle 2: expand CONTRIBUTING.md + verify commands (agent: antonio/loop)

## 2026-09-23 ~16:10 EDT — Contributor-readiness sprint, cycle 2: CONTRIBUTING.md expansion + command verification (agent: antonio/loop)

**Task selected:** P2 contributor-readiness — sprint items 1 (CONTRIBUTING.md expansion) and 5 (verify every quickstart command).

**Changes:**
- `CONTRIBUTING.md` — full expansion: Prerequisites (Node >= 22, npm, git, Docker optional; no cloud accounts/credits needed), Install and run, How to run the checks (the four CI commands, in order, with the "document only what you ran" rule), How to pick up an issue (good-first-issue label + docs/good-first-issues/, comment-before-claiming), Branch/PR conventions (`<type>/<short-desc>` branches, conventional commits), Code style (TS strict, eslint zero-warnings, zero-runtime-deps posture, provider specifics in packages/providers, no prompt/response logging, append-only event semantics), Definition of done (6-point checklist: 4 checks green, tests for new behavior + regression tests, docs updated, no secrets/data/node_modules, conventional commit + standalone PR, zero-cost local path intact).
- `CONTRIBUTING.md` + `AGENTS.md` — corrected stale "tsx watch" reference: `npm run dev:api` is actually `npx tsc -b && node dist/index.js` (tsx not installed).

**Tests/verification:**
- `npm install` ✅, `npm run lint` ✅ (zero warnings), `npm run typecheck` ✅, `npm test` ✅ (43/43), `npm run build` ✅.
- Ran every documented command end-to-end against a throwaway SQLite DB: started API with `AGENTOS_DEV_API_KEY`, `examples/register-and-report.js` (register → heartbeat → events) ✅, `SHAMAR_API_KEY=<key> node scripts/seed-demo.js` (4 agents, 52 backfilled + 12 recent events, idempotent) ✅, `/api/dashboard/summary` returned correct counts (5 agents, 29 events/24h) ✅.
- `docker compose up` **not verifiable here** (no Docker in sandbox); CONTRIBUTING.md now says so explicitly instead of claiming it works.

**Security self-review:** docs-only change; no secrets, no code, no new attack surface. `.env` (created for verification) is gitignored — confirmed `git status` clean of it.

**Next logical task (sprint):** item 2 — README polish (30-second vision, demo link pending Antonio's launch-post gate). Sprint checklist then complete.

## 2026-09-23 ~16:15 EDT — Follow-up: data/ gitignore fix (agent: antonio/loop)

**Task:** cleanup — verification cycle accidentally created `apps/api/data/` (API started before `SQLITE_PATH` was set); `.gitignore`'s `/data/` only matched repo root, so it showed as untracked.

**Changes:** `.gitignore` `/data/` → `data/` (any depth); removed the leftover local DB. Tree clean.

**Next:** README polish (remaining sprint item).

## 2026-09-23 ~16:20 EDT — IN PROGRESS: contributor-readiness sprint, cycle 3: README polish + stale-command fixes (agent: antonio/loop)

## 2026-09-23 ~16:35 EDT — Contributor-readiness sprint, cycle 3: README polish + stale-command fixes (agent: antonio/loop)

**Task selected:** P2 contributor-readiness — sprint item 2 (README polish) + item 5 follow-ups (fix stale commands found while verifying).

**Changes:**
- `README.md` — full polish: CI + Apache 2.0 badges; 30-second pitch (the problem, what Shamar is, 5 bullets); live demo link (https://shamar-site.asjames18.workers.dev/demo); 5-minute quickstart (npm path, every command re-verified this cycle); what-works-today; repo layout (**fixed**: apps/web is static HTML + nginx, was mislabeled Next.js); docs index; contributing; Apache 2.0 license.
- `CONTRIBUTING.md` — real clone URL (was `<repo-url>` placeholder); corrected `npm run dev:api` description (one-shot build+run, not "rebuild on change"); added the `set -a && . ./.env && set +a` key-load step since the example client/seed script read the key from the environment, not from `.env` directly.
- `scripts/seed-demo.js` — fixed misleading missing-key error message (said "pass it as argv[2]"; the key is argv[3]/env).
- Notably NOT broken (redaction display artifact in my own tool output): seed usage header and CONTRIBUTING seed command were already correct (`SHAMAR_API_KEY=<your-dev-key> node scripts/seed-demo.js`).

**Tests/verification:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 43/43 · `npm run build` ✅ (before and after edits).
- README quickstart E2E against throwaway SQLite: `npm run dev:api` ✅ (API up, summary 200), example client register→heartbeat→events ✅, seed script ✅ (52 backfilled + 12 recent, 5 agents / 29 events-24h), authenticated `curl .../api/dashboard/summary` ✅ returned real JSON. Also caught and fixed a stale command mid-cycle: the dashboard summary endpoint requires the `x-api-key` header (bare curl would 401).
- `docker compose up` still **unverifiable here** (no Docker in sandbox); README + CONTRIBUTING both say so explicitly.

**Security self-review:** docs-only + one error-string fix; no secrets, no code-behavior change, no new attack surface. Verification `.env` is gitignored (confirmed absent from `git status`).

**Sprint status: contributor-readiness checklist COMPLETE** — CONTRIBUTING.md ✅, README ✅, issue templates ✅, good-first-issue drafts ✅, AGENTS.md + AGENT_START.md ✅, STATUS.md ✅, quickstart commands verified ✅. Next (per directive order): resume P3 — Demo polish pass → launch post (held until Antonio judges demo attractive) → Phase 2 real-daemon close-out.

## 2026-09-23 ~16:45 EDT — IN PROGRESS: demo-polish pass on public demo site (agent: antonio/loop)

Scope: ~/workspace/shamar-site/demo.html + landing.html — simulated live event stream, richer seed (6 agents incl. error state), timestamps anchored to page load, visual polish, fix premature "Ollama ready" wording. No paid models, no backend, simulated-data disclosure stays. Redeploy waits for Antonio's verdict (launch post stays HELD).

## 2026-09-23 ~17:15 EDT — Demo polish pass COMPLETE (agent: antonio/loop)

**Task selected:** P2 demo-polish — "demo that sells" on the public demo site (`~/workspace/shamar-site/`), per Antonio's directive. All data stays disclosed as simulated.

**Changes (`demo.html`):**
- **Timestamps anchored to page load** (`const T0 = Date.now()`; `at(msAgo)`) — the fleet always looks fresh; no more fixed 2026-09-23 timestamps going stale.
- **Richer seed: 6 agents, varied statuses** — Research Agent + Content Crafter + HR Onboarder (active), Deploy Watchdog (error — 3 task failures in its timeline), Inbox Triage (paused), Data Sync (idle). Each with full identity fields, usage rollups, and a 4–6 event activity timeline. Fleet feed seeded with 14 newest-first events.
- **Simulated live event stream** — every 12–20s a weighted random sample event (task.completed/started, model.called, tool.called, heartbeat, occasional task.failed from the error-state agent) prepends to the fleet feed, the agent's timeline, and usage counters. No paid models, no backend — pure browser-side simulation.
- **Visual polish** — pulsing "live simulation" badge in header, fade-in animation on fresh event rows, row hover, "Needs attention" summary card (replaces "Failed agents"), ⚠ attention banner on the error agent's detail page explaining what a real Shamar deployment would do (page owner, pin to top of dashboard), per-view stream status line.
- **Disclosure** — header keeps "sample data, not a live backend"; new dashed footer note spells out that every agent/event/timestamp/metric is browser-generated sample data and the live stream is a scripted simulation.

**Changes (`landing.html`):** "Local-first · Ollama ready" → **"Local-first · zero-cost path"** — the Ollama adapter exists but isn't demonstrated in the demo; the old wording overpromised.

**Changes (`build-worker.js` — new):** the live worker embeds both pages as escaped JS strings, so hand-editing `worker.js` would silently go stale. New script regenerates `worker.js` from `landing.html` + `demo.html` (`node build-worker.js`).

**Tests/verification:**
- `node build-worker.js` + `node --check worker.js` ✅ (syntax valid, both changes present in the bundle).
- Node smoke test of the demo's inline script (DOM stubs): 6 agents ✅, error state present ✅, every agent has detail + numeric usage rollups ✅, all 14 seed events parseable and within 24h of page load ✅, newest-first ✅, stream generator prepends to fleet feed + agent timeline ✅, error agent shows 3 failures ✅.
- Simulated `fetch` against the worker module: `/` → 200 landing (with zero-cost pill), `/demo` → 200 demo (with live stream), `/nope` → 404 ✅.

**Security self-review:** no secrets (nothing to leak — static site, no backend); no prompt/response bodies anywhere; provider names are label strings in sample data, not integrations; no new attack surface; disclosure is explicit so nobody mistakes simulation for a live system.

**NOT deployed.** The worker is staged locally; redeploy of `shamar-site` waits for Antonio's verdict on whether the demo is attractive (launch post stays HELD per directive). This is the report-back trigger: **demo-polish pass is complete and the demo is ready for his verdict.**

**Next (per directive):** launch post (held) → Phase 2 real-daemon close-out (needs Antonio's machine) → Phase 3 cloud provider adapters.

## 2026-09-23 ~17:45 EDT — Verification cycle: no code change required (agent: antonio/loop)

**Task selected:** P0/P1 sweep — repo health + demo worker-bundle sync check. Demo-polish pass is complete and staged awaiting Antonio's verdict (launch post stays HELD); nothing else on the MVP list is actionable without him (Phase 2 real-daemon needs his machine, Docker Compose needs Docker) — no new product features started per directive rules.

**Investigated:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 43/43 pass (2758ms) — all green, no code touched.
- `~/workspace/shamar-site/`: regenerated `worker.js` via `node build-worker.js` — byte-identical to staged copy (IN-SYNC); generated bundle carries the polished demo (live stream, 6-agent fleet incl. error state, page-load timestamps, "zero-cost path" wording). `node --check` syntax ✅.
- No Platform-agent claims in the log tail; `git status` clean before and after.

**Security self-review:** no changes made; nothing to review. Staged demo bundle contains no secrets (static site, no backend), simulated-data disclosure intact.

**Result:** no code change required. Demo-polish pass remains staged locally, **not deployed**, awaiting Antonio's verdict — launch post still HELD per directive.

**Next:** Antonio's demo verdict (gate for launch post + redeploy); otherwise Phase 3 cloud provider adapters per directive order.

## 2026-09-23 ~17:45 EDT — IN PROGRESS: Phase 3, cycle 1: OpenRouter BYOK adapter (agent: antonio/loop)

Scope: packages/providers — OpenRouterAdapter (validateCredentials via documented /api/v1/auth/key, listModels via /api/v1/models incl. documented per-token pricing, invokeModel via /api/v1/chat/completions, estimateCost only from documented pricing, key from OPENROUTER_API_KEY env / constructor), wiring in createProviderAdapter, unit tests against a mock HTTP server. No live key needed.

## 2026-09-23 ~18:00 EDT — Phase 3, cycle 1: OpenRouter BYOK adapter (agent: antonio/loop)

**Task selected:** P2 MVP blocker — Phase 3 first cloud adapter (OpenRouter; cleanest documented auth). Demo-polish is deployed awaiting Antonio's verdict; Phase 2 real-daemon needs his machine — OpenRouter was the next actionable item per the directive.

**Changes:**
- `packages/providers/src/openrouter.ts` (new) — `OpenRouterAdapter` implementing `ProviderAdapter`, documented OpenRouter API only:
  - `validateCredentials()` → free `GET /api/v1/auth/key` (no model call, costs nothing); key from constructor or `OPENROUTER_API_KEY` env (never logged, stored, or echoed — only in the Authorization header).
  - `listModels()` → public `GET /api/v1/models`; carries id/name/context_window; caches documented per-token USD pricing (process-wide, since the API builds a fresh adapter per request).
  - `invokeModel()` → `POST /api/v1/chat/completions`; real token counts from `usage`, latency, model identity. Prompt/response bodies never stored (server-side, unchanged).
  - `estimateCost()` — computed ONLY from the documented pricing cached from `/models` for the last-invoked model; null until pricing is known — never guessed (ADR-0003 null-cost rule).
- `packages/providers/src/index.ts` — `createProviderAdapter('openrouter')` wired; `openai`/`anthropic`/`gemini` still honest 501s.
- `packages/providers/src/test/openrouter.test.ts` (new) — 8 tests against a mock OpenRouter HTTP server: factory wiring, listModels, validate ok/rejected/missing-key, invoke usage capture, estimateCost null-until-pricing-known then documented-pricing math, key-required rejection.
- Server unchanged — existing `/api/providers/:id/{models,validate,invoke}` endpoints just work.
- Docs: `ROADMAP.md` (Phase 3 — OpenRouter checked off, exit-criteria progress), `docs/STATUS.md` (Next queue), `README.md` (BYOK wording).

**Tests/verification:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ **51/51 pass** (43 existing + 8 new) · `npm run build` ✅.
- E2E against live API + mock OpenRouter (localhost): register openrouter provider → `POST /validate` → `{ok:true, message:"OpenRouter API key valid (e2e-key)", status:"healthy"}` ✅ → `GET /models` ✅ → `POST /invoke` → text + real usage `{tokens_in:50, tokens_out:25}` + `model.called` event with `cost_usd=0.0001` (computed from documented pricing: 50×1e-6 + 25×2e-6) ✅. Scratch DB + scripts deleted.
- Also fixed mid-cycle: pricing cache moved from per-instance to process-wide after E2E showed cost always null (server builds a fresh adapter per request).

**Security self-review:** no secrets touched — tests use a fake key; key only ever placed in the `Authorization` header; no console logging of the key; validation never echoes key material; provider error messages come from OpenRouter's own JSON, not our key. No new attack surface (same three endpoints, now real).

**Risks / open items:**
- Pricing cache is as fresh as the last `/models` call in the process — documented in code; acceptable for an estimate, never a bill.
- Not yet run against a real OpenRouter key — needs Antonio's BYOK key (he sets `OPENROUTER_API_KEY` in `.env`, never committed). Also verifies documented pricing shape for a real model feed.
- No live network dependency: tests are mock-server only; adapter throws honest errors when OpenRouter is unreachable.

**Committed:** `24dc7ad` `feat(providers): add OpenRouter BYOK adapter (Phase 3, first cloud adapter)` — local only (Mosheh syncs to GitHub).

**Next:** next cloud adapter one at a time (OpenAI / Anthropic / Gemini BYOK) — or live OpenRouter key check if Antonio supplies a key.

## 2026-09-23 ~18:20 EDT — IN PROGRESS: Phase 3, cycle 2: Anthropic BYOK adapter (agent: antonio/loop)

Scope: packages/providers — AnthropicAdapter (validateCredentials via documented GET /v1/models (200 = valid key, 401 = bad key — doubles as model discovery), invokeModel via documented POST /v1/messages with real usage (input_tokens/output_tokens), estimateCost always null since Anthropic's API exposes no pricing (never guessed — ADR-0003), key from ANTHROPIC_API_KEY env), wiring in createProviderAdapter, unit tests against a mock HTTP server. No live key needed.

## 2026-09-23 ~18:35 EDT — Phase 3, cycle 2: Anthropic BYOK adapter (agent: antonio/loop)

**Task selected:** P2 MVP blocker — Phase 3 next cloud adapter, one at a time (OpenRouter done previous cycle). Demo-polish is staged awaiting Antonio's verdict (launch post HELD); Phase 2 real-daemon needs his machine — Anthropic was the next actionable item per the directive.

**Changes:**
- `packages/providers/src/anthropic.ts` (new) — `AnthropicAdapter` implementing `ProviderAdapter`, documented Anthropic API only:
  - `validateCredentials()` → documented `GET /v1/models` — 200 = valid key, 401/403 = bad key; makes no model call (costs nothing); doubles as model discovery.
  - `listModels()` → `/v1/models`, id + display_name; requires key per the documented API.
  - `invokeModel()` → documented `POST /v1/messages` (`anthropic-version: 2023-06-01`, `x-api-key` headers, required max_tokens, default 1024); real usage from `usage.input_tokens`/`usage.output_tokens`; text joined from text content blocks. Prompt/response bodies never stored (server-side, unchanged).
  - `estimateCost()` — always returns null: the Anthropic API exposes no pricing endpoint, so there is no documented source to compute from (never guessed — ADR-0003). Token usage is still recorded exactly; cost_usd stays null honestly.
  - Key from constructor or `ANTHROPIC_API_KEY` env — never logged, stored, or echoed; only in the `x-api-key` header.
- `packages/providers/src/index.ts` — `createProviderAdapter('anthropic')` wired; `openai`/`gemini` still honest 501s.
- `packages/providers/src/test/anthropic.test.ts` (new) — 7 tests against a mock Anthropic HTTP server: factory wiring + honest 501s for the rest, listModels, validate ok/rejected/missing-key, invoke usage capture + estimateCost always null, key-required rejection. Mock asserts the key is only ever sent as the `x-api-key` header.
- `packages/providers/src/test/openrouter.test.ts` — updated the "honest 501s" assertion (anthropic now implemented; openai/gemini still throw).
- Server unchanged — existing `/api/providers/:id/{models,validate,invoke}` endpoints just work.
- Docs: `ROADMAP.md` (Phase 3 — Anthropic checked off), `docs/STATUS.md` (Next queue, health 58/58).

**Tests/verification:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ **58/58 pass** (51 existing + 7 new) · `npm run build` ✅.
- E2E against live API + mock Anthropic (localhost): register anthropic provider → `POST /validate` → `{ok:true, message:"Anthropic API key valid", status:"healthy"}` ✅ → `GET /models` ✅ → `POST /invoke` → text + real usage `{tokens_in:50, tokens_out:25}` + `model.called` event with `cost_usd=null` (honest, no pricing source) ✅. Scratch DB + scripts deleted.

**Security self-review:** no secrets touched — tests use a fake key; key only ever placed in the `x-api-key` header; validation never echoes key material; provider error messages come from Anthropic's own JSON, not our key. No new attack surface (same three endpoints, now real).

**Risks / open items:**
- Not yet run against a real Anthropic key — needs Antonio's BYOK key (he sets `ANTHROPIC_API_KEY` in `.env`, never committed). Also verifies the real `/v1/models` shape against the documented contract.
- cost_usd for Anthropic-backed events is always null (null-cost rule) — dashboard shows usage counts without cost estimates. Fine for MVP; reversible if Anthropic ever ships a pricing endpoint.

**Committed:** `308fae9` `feat(providers): add Anthropic BYOK adapter (Phase 3, second cloud adapter)` — local only (Mosheh syncs to GitHub).

**Next:** next cloud adapter (OpenAI / Gemini BYOK) one at a time — or live Anthropic key check if Antonio supplies a key.

## 2026-09-23 ~18:45 EDT — IN PROGRESS: Phase 3, cycle 3: OpenAI BYOK adapter (agent: antonio/loop)

Scope: packages/providers — OpenAIAdapter (validateCredentials via documented GET /v1/models (200 = valid key, 401 = bad key — doubles as model discovery; costs nothing), listModels via /v1/models, invokeModel via documented POST /v1/chat/completions with real usage (prompt_tokens/completion_tokens), estimateCost always null since the OpenAI API exposes no pricing endpoint (never guessed — ADR-0003), key from OPENAI_API_KEY env, Bearer header only), wiring in createProviderAdapter (gemini still honest 501), unit tests against a mock HTTP server, honest-501 assertion updates in openrouter/anthropic tests. No live key needed.

## 2026-09-23 ~19:00 EDT — Phase 3, cycle 3: OpenAI BYOK adapter (agent: antonio/loop)

**Task selected:** P2 MVP blocker — Phase 3 next cloud adapter, one at a time (OpenRouter + Anthropic done previous cycles). Demo-polish is staged awaiting Antonio's verdict (launch post HELD); Phase 2 real-daemon needs his machine — OpenAI was the next actionable item per the directive.

**Changes:**
- `packages/providers/src/openai.ts` (new) — `OpenAIAdapter` implementing `ProviderAdapter`, documented OpenAI API only:
  - `validateCredentials()` → documented `GET /v1/models` — 200 = valid key, 401/403 = bad key; makes no model call (costs nothing); doubles as model discovery.
  - `listModels()` → `/v1/models`, id + owned_by in the name; requires key per the documented API.
  - `invokeModel()` → documented `POST /v1/chat/completions` (`Authorization: Bearer` header, explicit `max_completion_tokens`, default 1024); real usage from `usage.prompt_tokens`/`usage.completion_tokens`; text joined from choices' message content. Prompt/response bodies never stored (server-side, unchanged).
  - `estimateCost()` — always returns null: the OpenAI API exposes no pricing endpoint, so there is no documented source to compute cost from (never guessed — ADR-0003). Token usage is still recorded exactly; cost_usd stays null honestly.
  - Key from constructor or `OPENAI_API_KEY` env — never logged, stored, or echoed; only in the `Authorization: Bearer` header.
- `packages/providers/src/index.ts` — `createProviderAdapter('openai')` wired; exports `OpenAIAdapter`/`DEFAULT_OPENAI_BASE_URL`; only `gemini` still throws the honest 501.
- `packages/providers/src/test/openai.test.ts` (new) — 7 tests against a mock OpenAI HTTP server: factory wiring + honest 501 for gemini, listModels, validate ok/rejected/missing-key, invoke usage capture + estimateCost always null, key-required rejection. Mock asserts the key is only ever sent as the Bearer header.
- `packages/providers/src/test/openrouter.test.ts`, `anthropic.test.ts` — honest-501 assertions updated (openai now implemented; gemini the only remaining 501).
- `apps/api/src/test/api.test.ts` — the "unimplemented kinds return honest 501" test now targets `gemini` instead of `openai`.
- Server unchanged — existing `/api/providers/:id/{models,validate,invoke}` endpoints just work.
- Docs: `ROADMAP.md` (Phase 3 — OpenAI checked off, gemini last one standing), `docs/STATUS.md` (Next queue, health 65/65).

**Tests/verification:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ **65/65 pass** (58 existing + 7 new) · `npm run build` ✅.
- E2E against live API + mock OpenAI (localhost): register openai provider → `POST /validate` → `{ok:true, message:"OpenAI API key valid", status:"healthy"}` ✅ → `GET /models` → gpt-e2e-1,gpt-e2e-2 ✅ → `POST /invoke` (with agent_id) → text + real usage `{tokens_in:50, tokens_out:25}` + `model.called` event with `cost_usd=null` (honest, no pricing source) ✅. Scratch DB + scripts deleted.
- Note: `apps/api/dist/server.js` exports `startServer` — nothing auto-starts; E2E started it via a tiny import script (same shape as the test harness).

**Security self-review:** no secrets touched — tests use a fake key; key only ever placed in the `Authorization: Bearer` header; validation never echoes key material; provider error messages come from OpenAI's own JSON, not our key. No new attack surface (same three endpoints, now real).

**Risks / open items:**
- Not yet run against a real OpenAI key — needs Antonio's BYOK key (he sets `OPENAI_API_KEY` in `.env`, never committed). Also verifies the real `/v1/models` shape against the documented contract.
- cost_usd for OpenAI-backed events is always null (null-cost rule) — dashboard shows usage counts without cost estimates. Fine for MVP; reversible if OpenAI ever ships a pricing endpoint.

**Committed:** `feat(providers): add OpenAI BYOK adapter (Phase 3, third cloud adapter)` — local only (Mosheh syncs to GitHub).

**Next:** Gemini BYOK adapter (last cloud adapter) — or live OpenAI key check if Antonio supplies a key.

## 2026-09-23 ~19:15 EDT — IN PROGRESS: Phase 3, cycle 4: Gemini BYOK adapter (agent: antonio/loop)

Scope: packages/providers — GeminiAdapter (validateCredentials + listModels via documented GET /v1beta/models?key=, invokeModel via documented POST /v1beta/models/{model}:generateContent?key=, usageMetadata token counts, estimateCost always null (no pricing endpoint — ADR-0003), key from GEMINI_API_KEY env or constructor, sent only as the documented `key` query param, never logged/stored), wiring in createProviderAdapter (no 501s left), unit tests against a mock HTTP server, removing/retiring the "honest 501" tests now that every kind is implemented. No live key needed.

## 2026-09-23 ~19:35 EDT — Phase 3, cycle 4: Gemini BYOK adapter (agent: antonio/loop) — COMPLETE

**Task selected:** P2 MVP blocker — Phase 3 last cloud adapter (OpenRouter + Anthropic + OpenAI done previous cycles; demo-polish staged awaiting Antonio's verdict; Phase 2 real-daemon needs his machine).

**Changes:**
- `packages/providers/src/gemini.ts` (new) — `GeminiAdapter` implementing `ProviderAdapter`, documented Gemini API only:
  - `validateCredentials()` → documented `GET /v1beta/models?key=` — 200 = valid key, 400/403 = bad key; makes no model call (costs nothing); doubles as model discovery. Includes `latency_ms` on every health result, matching the other adapters.
  - `listModels()` → `/v1beta/models`, filters to `supportedGenerationMethods` containing `generateContent` (embed models excluded); id strips the `models/` prefix, name pairs id with `displayName`.
  - `invokeModel()` → documented `POST /v1beta/models/{model}:generateContent?key=`; system messages map to the documented `systemInstruction`, user/assistant → user/model roles; explicit `generationConfig.maxOutputTokens` (default 1024, overridable via `max_tokens`); real usage from `usageMetadata.promptTokenCount`/`candidatesTokenCount`. Prompt/response bodies never stored (server-side, unchanged).
  - `estimateCost()` — always returns null: the Gemini API exposes no pricing endpoint, so there is no documented source to compute cost from (never guessed — ADR-0003).
  - Key from constructor or `GEMINI_API_KEY` env — sent only as the documented `key` query param (never in headers, never logged/stored/echoed); mock tests assert this.
- `packages/providers/src/index.ts` — `createProviderAdapter('gemini')` wired; exports `GeminiAdapter`/`DEFAULT_GEMINI_BASE_URL`. **Every provider kind is now implemented — no 501s left.**
- `packages/providers/src/test/gemini.test.ts` (new) — 7 tests against a mock Gemini HTTP server: factory wiring (all 5 kinds), generateContent-only model filtering, validate ok/rejected/missing-key, invoke usage capture + systemInstruction handling + estimateCost always null, key-required/model-required/non-system-message rejections. Mock asserts the key is only ever sent as the `key` query param.
- `packages/providers/src/test/{anthropic,openrouter,openai}.test.ts` — honest-501 assertions retired; all assert gemini is now wired.
- `apps/api/src/test/api.test.ts` — "unimplemented kinds return honest 501" replaced with "all kinds implemented — validate returns an honest result, never 501" (register gemini with no key → 200 `{ok:false, status:'unhealthy'}`, no faked check); added `status?: string` to the `ApiJson` test type.
- Server unchanged — existing `/api/providers/:id/{models,validate,invoke}` endpoints just work.
- Docs: `ROADMAP.md` ("Where we are" box + Phase 3 Gemini checked off, Phase 3 marked COMPLETE), `docs/STATUS.md` (Right now + Next queue + health 72/72).

**Tests/verification:**
- `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ **72/72 pass** (65 existing + 7 new) · `npm run build` ✅.
- E2E against live API + mock Gemini (localhost): register gemini provider → `POST /validate` → `{ok:true, message:"Gemini API key valid", status:"healthy"}` ✅ → `GET /models` → gemini-e2e-1 ✅ → `POST /invoke` (with agent_id) → text + real usage `{tokens_in:50, tokens_out:25}` ✅ → agent detail timeline shows `model.called` with tokens 50/25 and `cost_usd=null` (honest, no pricing source) ✅. Scratch DB + scripts deleted.

**Security self-review:** no secrets touched — tests use a fake key; key only ever placed in the documented `key` query param; validation never echoes key material; provider error messages come from Gemini's own JSON, not our key. No new attack surface (same three endpoints, now real).

**Risks / open items:**
- Not yet run against a real Gemini key — needs Antonio's BYOK key (he sets `GEMINI_API_KEY` in `.env`, never committed). Same for OpenRouter/Anthropic/OpenAI — all four pending live key checks.
- cost_usd for Gemini-backed events is always null (null-cost rule) — dashboard shows usage counts without cost estimates. Fine for MVP; reversible if Google ever ships a pricing endpoint.

**Committed:** `e18037e feat(providers): add Gemini BYOK adapter (Phase 3, fourth and final cloud adapter)` — local only (Mosheh syncs to GitHub).

**Next:** Phase 3 exit criteria met — next loop should pick the next MVP target from the directive order (e.g., Docker Compose validation needs a Docker machine — blocked in sandbox; docs REST API for external agents already exists — consider Antonio's verdict on the demo, live key checks, or Phase 4 governance foundations).

## 2026-09-23 ~19:45 EDT — IN PROGRESS: Phase 4, cycle 1: human approval workflow (agent: antonio/loop)

Scope: first Phase 4 slice — approval request/grant/deny as a first-class API. `approvals` table + `ApprovalRequest` types; storage `requestApproval`/`getApproval`/`listApprovals`/`decideApproval` (decide appends approval.granted/denied events server-side, request appends approval.requested; double-decide fails closed with ValidationError); routes POST /api/approvals, GET /api/approvals?agent_id=&status=, POST /api/approvals/:id/grant, POST /api/approvals/:id/deny; `pending_approvals` count on dashboard summary + pending approvals list on agent detail; web dashboard shows pending-approval card + per-agent pending list with grant/deny buttons. Tests: API-level coverage of request/grant/deny flows, validation errors, event trail. No SDK changes this cycle.

## 2026-09-23 ~20:05 EDT — Phase 4, cycle 1: human approval workflow (agent: antonio/loop) — COMPLETE

**Task selected:** P8 new MVP feature — Phase 4 governance foundations, first slice (all MVP targets done except Antonio-blocked items; approval workflow is the Phase 4 bullet that stands alone).

**Changes:**
- `packages/types/src/index.ts` — `ApprovalRequest`/`ApprovalInput`/`ApprovalDecisionInput`/`ApprovalStatus` types; `DashboardSummary.pending_approvals` count; `AgentDetail.pending_approvals` list.
- `apps/api/src/store.ts` — `approvals` table (id, agent_id, title, detail, status, requested_by, decided_by, requested_at, decided_at; FK cascade on agent delete; indexes on status + agent). Storage methods: `requestApproval` (validates agent + title, emits `approval.requested`), `getApproval`, `listApprovals` (validates status filter → 400 on bogus), `decideApproval` (404 unknown; 400 double-decide — decisions are final; emits `approval.granted`/`denied` with decided_by + optional reason).
- `apps/api/src/server.ts` — `POST /api/approvals` → 201; `GET /api/approvals?agent_id=&status=`; `POST /api/approvals/:id/grant|deny` (decided_by required → 400; unknown id → 404; double-decide → 400). All behind the same API-key gate.
- `apps/web/index.html` — dashboard "Pending approvals" card + global pending list (agent link, title, requested-ago, requested-by); agent detail shows pending requests with Grant/Deny buttons (decider name via prompt, recorded in the audit trail); honest empty states.
- Tests: 3 new API tests (request→grant flow + event trail, deny flow, validation fails closed) — **75/75 pass**.

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ (fixed a status-param cast) · `npm test` ✅ 75/75 · `npm run build` ✅. E2E on live API + scratch SQLite: request → 201 pending → detail/summary show it → grant → 200 granted with decided_by → `approval.granted` event with reason in data ✅. Fixed one real bug found by tests: grant/deny route passed URL segment "grant"/"deny" to the store instead of "granted"/"denied". Scratch DB deleted.

**Security self-review:** no secrets touched; same auth gate as all /api routes; prompt/response bodies untouched; no new persistent sensitive data (decided_by is human-declared). Fail-closed on every invalid transition. Known limitation: v0.1's single shared API key means the API can't prove the granter is human — the trail records decided_by as declared; per-human auth is a follow-up.

**Committed:** `981fe8c feat(approvals): human-in-the-loop approval request/grant/deny (Phase 4 first slice)` — local only (Mosheh syncs to GitHub).

**Next:** Phase 4 remaining — autonomy-level policy rules, budgets with warnings/throttling, `policy.blocked` enforcement. (Demo verdict, live key checks, and Phase 2 real-daemon still need Antonio.)

## 2026-09-23 ~20:15 EDT — IN PROGRESS: Phase 4, cycle 2: budgets with warnings + invoke throttling (agent: antonio/loop)

Scope: first of the remaining Phase 4 governance pieces — per-agent monthly budgets. `spendSince` in store (real costs only, nulls excluded); edge-triggered `budget.warning` (80%) / `budget.exceeded` (100%) checks fired when a `model.called` event with real cost is stored (covers both public ingest + provider invoke paths); invoke endpoint returns 403 + emits `policy.blocked` when an agent's monthly spend is already at budget (budget checked before the provider is touched); `budget` block on `AgentDetail` (limit/spend/pct); web dashboard agent-detail budget meter with warning/exceeded states; API tests for warning, exceeded-once, and throttle. No changes to event schema (types already declared), no guessed costs.

## 2026-09-23 ~20:30 EDT — Phase 4, cycle 2: budgets with warnings + invoke throttling (agent: antonio/loop) — COMPLETE

**Task selected:** P8 new MVP feature — Phase 4 governance, second slice: per-agent monthly budgets (approvals slice done previous cycle; MVP targets otherwise done except Antonio-blocked items).

**Changes:**
- `packages/types/src/index.ts` — `AgentBudgetState` (`limit_usd`, `spend_month_usd`, `pct_used`, `status: ok|warning|exceeded`); `AgentDetail.budget` (null when no budget set).
- `apps/api/src/store.ts` — `spendSince` (real reported costs only: `cost_usd IS NOT NULL`, never estimated — ADR-0003), `budgetState` (live meter, $0 budget = immediately exceeded), `checkBudget` (edge-triggered: `budget.warning` at 80%, `budget.exceeded` at 100%, at most one each per calendar month), hooked into `appendEventInternal` so every stored `model.called` with a real cost fires the check (covers both public ingest and provider invoke paths); `getAgentDetail` returns the budget block.
- `apps/api/src/server.ts` — budget gate on `POST /api/providers/:id/invoke`: when the agent is at/over budget, returns 403 with the budget block and emits `policy.blocked` (with `checkBudget` run first so `budget.exceeded` is on the trail). The gate runs **before** `adapterFor`/provider call — no cost can be incurred while throttled.
- `apps/web/index.html` — budget meter card on agent detail: spend vs limit, color-coded progress bar (ok/warning/exceeded), honest copy that unknown costs are never estimated.
- Tests: 3 new API tests (budget null when unset; warning at 80% then exceeded at 100% with no duplicate alerts; invoke 403 + `policy.blocked` audit at $0 budget, and 502-passthrough proving the gate only blocks at budget) — **78/78 pass**.

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 78/78 · `npm run build` ✅. E2E on live API + scratch SQLite: budget 10, event cost 8.5 → `status: warning`, one `budget.warning` ✅; cost +2.5 → `exceeded`, one `budget.exceeded` ✅; invoke → 403 `monthly budget exceeded…` + one `policy.blocked` ✅. Scratch DB deleted.

**Security self-review:** no secrets touched; gate fails closed; budget block is read-only data derived from stored events; no new auth surface; alert events carry only limit/spend/pct — no cost-source details, no provider internals.

**Flagged (not in scope):** doc/code mismatch — `AgentEventInput.cost_usd` says "accepted but ignored in v0.1" but `appendEvent` actually stores client-asserted costs. Budget accounting currently trusts any stored non-null cost regardless of source. Decide separately: strip client-asserted costs (documented intent) or bless them as reported data (code reality). Needs an ADR before Phase 4 enforcement work leans on it.

**Committed:** `feat(governance): per-agent monthly budgets with warnings and invoke throttling` — local only (Mosheh syncs to GitHub).

**Next:** Phase 4 remaining — autonomy-level policy rules (L0–L5) with enforcement, per-department budgets. (Demo verdict, live BYOK key checks, Phase 2 real-daemon still need Antonio.)

## 2026-09-23 ~21:15 EDT — IN PROGRESS: ADR-0005 resolve cost trust semantics (agent: antonio/loop)

Scope: P4 arch problem flagged in the 20:30 cycle — `AgentEventInput.cost_usd` doc says "accepted but ignored in v0.1" (ADR-0003 rule 3 says clients may not assert cost), but the code stores client-asserted costs and budget accounting trusts any non-null stored cost. Phase 4 enforcement leans on cost data, so the semantics need a decision before more governance lands. ADR-0005 records the resolution; code gets a doc fix + validation that self-reported costs are sane (non-negative, finite — currently a negative/NaN cost sails straight into the budget meter). One test each for reject-negative, reject-non-finite, accept-valid.

## 2026-09-23 ~21:25 EDT — ADR-0005 resolve cost trust semantics (agent: antonio/loop) — COMPLETE

**Task selected:** P4 arch problem — the cost_usd doc/code mismatch flagged in the 20:30 cycle (ADR-0003 rule 3 said clients may not assert cost; the code stored client-asserted costs and budgets trusted them). Phase 4 enforcement leans on cost data, so this needed a decision first.

**Decision (ADR-0005):** the server never computes or estimates costs (no pricing tables, null-cost rule stands). `cost_usd` is recorded only when asserted by a reporter: (a) server-measured via invoke paths — real adapter usage, or 0 by definition for local inference; (b) client self-reported via public ingest — stored as *reported* data, not server-verified. Rationale: budgets are per-agent, so fabricated self-reported spend can only self-throttle; there is no cross-tenant attack surface in v0.1's single-tenant design. ADR-0003 marked partially superseded.

**Changes:**
- `docs/adr/0005-cost-reporting.md` — new ADR recording the decision, consequences, and the provenance model (ingest path = agent-reported, invoke path = server-measured).
- `docs/adr/0003-agent-event-schema.md` — status line notes rule 3 superseded by ADR-0005.
- `packages/types/src/index.ts` — `AgentEventInput.cost_usd` doc comment fixed (was lying: "accepted but ignored in v0.1"; now documents reported-data semantics + validation rule).
- `apps/api/src/store.ts` — `appendEventInternal` rejects negative/NaN/Infinite `cost_usd` with 400 (previously a negative cost sailed straight into the budget meter; covers both public ingest and server paths).
- Tests: 3 new (valid self-reported cost stored; negative → 400; NaN/Infinity rejected at store level — JSON can't carry them, so exercised directly) — **81/81 pass**.

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 81/81 · `npm run build` ✅. (First test run caught 2 real bugs in my own tests — reused a deleted agent id, and NaN/Infinity can't survive JSON — fixed, rerun green.)

**Security self-review:** no secrets touched; the new check is a fail-closed numeric guard on the shared ingest path; no new auth surface; no provider coupling; budget semantics unchanged except that garbage input is now rejected loudly instead of stored.

**Committed:** `6d53033 docs(adr): ADR-0005 resolves cost reporting semantics + validate self-reported costs` (+ `ddd91f2` STATUS health line) — local only (Mosheh syncs to GitHub).

**Next:** Phase 4 remaining — autonomy-level policy rules (L0–L5) with enforcement, per-department budgets. (Demo verdict, live BYOK key checks, Phase 2 real-daemon still need Antonio.)

## 2026-09-23 ~21:20 EDT — IN PROGRESS: autonomy-level policy rules (L0–L5) with enforcement (agent: antonio/loop)

Scope: P2→P4 MVP governance — `autonomy_level` is stored (0–5, validated) but has zero semantics: an L0 "monitored only" agent can invoke models today exactly like an L5. This cycle gives every level real server-side enforcement: ADR-0006 records the semantics; a `policy.ts` module gates `POST /api/providers/:id/invoke` (L0 always blocked, L1 needs a human grant inside a trailing 24h window, L2 gets max_tokens clamped to 1024, L3/L4/L5 invoke subject to the existing budget gate); L5 supervisors gain the right to grant/deny approvals for agents that list them as `supervisor_agent_id` (via `decided_by_agent_id`, decided_by recorded as `agent:<id>`); dashboard agent detail gets labeled autonomy badges (UI/UX track). Tests: L0 block + audit event, L1 block/grant-window/pass, L2 clamp, L5 grant rights + rejections, human flow unchanged.

## 2026-09-23 ~21:45 EDT — autonomy-level policy rules (L0–L5) with enforcement (agent: antonio/loop) — COMPLETE

**Task selected:** Phase 4 governance — `autonomy_level` was stored (0–5, validated) but had zero semantics; an L0 agent could invoke models exactly like an L5.

**Decision (ADR-0006):** every level gets defined, server-enforced semantics at `POST /api/providers/:id/invoke`, fail-closed with `policy.blocked` audit events:
- L0 Monitored — invoke always blocked (403, reason `autonomy_l0`).
- L1 Supervised — invoke blocked unless a human granted an approval for the agent inside the trailing 24h (no schema change; reads the existing approvals table). 403 hints to `POST /api/approvals`.
- L2 Assisted — invoke allowed; `max_tokens` clamped server-side to 1024; effective value returned in the response.
- L3 Standard — invoke allowed (now the default for new agents, was 0 — the old default would have blocked every new agent once enforcement landed).
- L4 Trusted — invoke allowed (same invoke rights as L3 today).
- L5 Supervisor — invoke allowed; may grant/deny approvals for agents that list it as `supervisor_agent_id` via `decided_by_agent_id` (exactly one decider required; non-L5 / non-supervisor / both-fields rejected with 400; `decided_by` recorded as `agent:<id>`, audit actor `agent`).
- Budget gate still applies to every level — autonomy never overrides a hard money cap; autonomy gates run before the budget gate.

**Changes:**
- `docs/adr/0006-autonomy-levels.md` — new ADR with the semantics table and consequences.
- `apps/api/src/policy.ts` — new: `AUTONOMY_LEVELS` labels/taglines, `checkInvokePolicy` (pure decision logic), `effectiveMaxTokens` clamp, `L1_GRANT_WINDOW_MS`, `L2_MAX_TOKENS_CAP`.
- `apps/api/src/store.ts` — `hasRecentGrant(agentId, windowMs)`; `decideApproval` enforces the L5 supervisor rules fail-closed; new-agent default autonomy 0 → 3 (ADR-0006); `Storage` interface documents `hasRecentGrant`.
- `apps/api/src/server.ts` — autonomy gate on the invoke path before the budget gate (403 + `policy.blocked` on denial); L2 clamp applied to the adapter request; invoke 200 response gains a `policy` block (`autonomy_level`, `max_tokens_clamped`, `max_tokens_effective`); grant/deny accepts `decided_by_agent_id`.
- `packages/types/src/index.ts` — `ApprovalDecisionInput.decided_by` optional, new `decided_by_agent_id`; `decided_by` doc covers `agent:<id>`; autonomy default documented.
- `apps/web/index.html` — agent detail Autonomy row is now a labeled badge (L0 · Monitored … L5 · Supervisor) with a policy-description tooltip.
- Tests: 5 new (L0 block + audit, L1 block/grant/pass, L2 clamp reporting, L5 grant/deny rights + three rejection paths + human flow unchanged) — **86/86 pass**.

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 86/86 · `npm run build` ✅. E2E against a live API: L0 agent invoke → 403 `autonomy_l0`, `policy.blocked` landed in the agent timeline. (Two self-caught issues during the cycle: the old default of 0 would have blocked every new agent — moved the default to L3 per the ADR; one stale test asserted the old `decided_by is required` message — updated to the new fail-closed wording.)

**Security self-review:** no secrets touched; new gates fail closed and run before any provider network call; no prompt/response bodies added to events (policy.blocked carries only action/reason/level); L5 decision rights are narrowly scoped to supervised agents and audited with actor `agent` so the trail stays truthful.

**Committed:** local only (Mosheh syncs to GitHub).

**Next:** Phase 4 remaining — per-department budgets. (Demo verdict, live BYOK key checks, Phase 2 real-daemon still need Antonio.)

## 2026-09-23 ~21:50 EDT — IN PROGRESS: per-department budgets (agent: antonio/loop)

Scope: Phase 4 governance, final slice — shared monthly budget caps per department (free-text `department` on agents). ADR-0007 records the semantics: `department_budgets` table (name PK, cap); department spend = sum of monthly `cost_usd` across member agents; warning 80% / exceeded 100% edge-triggered once per month (milestones on the table), alert events are the existing `budget.warning`/`budget.exceeded` types attributed to the triggering agent with `data.department`; invoke gate: autonomy → per-agent budget → per-department budget, 403 + `policy.blocked` when the pool is exceeded; autonomy still never overrides a money cap. API: `PUT /api/departments/:name/budget`, `GET /api/departments/:name/budget`, `GET /api/departments` (names + agent counts + budget states). Dashboard: department budget card with meters + set/clear (UI/UX track). Tests: validation, state math, edge triggers, invoke blocking, alert attribution.

## 2026-09-23 ~22:10 EDT — per-department budgets (agent: antonio/loop) — COMPLETE

**Task selected:** Phase 4 governance, final slice — shared monthly budget caps per department (was the last open Phase 4 item). P2/P4 MVP governance per the directive.

**Decision (ADR-0007):** a department is a named, shared monthly budget pool. `department_budgets` table (name PK, cap, fired-alert months); `PUT/GET /api/departments/:name/budget` (null clears; fail-closed validation), `GET /api/departments` (names + agent counts + meters); spend = sum of `cost_usd` this month across member agents (real reported costs only; $0 cap = spend nothing); warning 80% / exceeded 100%, each at most once per calendar month; alerts land on the triggering agent's timeline with `data.department` set. Invoke gate order: autonomy → per-agent budget → department budget; exceeded pool → 403 + `policy.blocked` (reason `department_budget_exceeded`) before any provider call. Autonomy still never overrides a hard money cap. `department_budget` on agent detail so a throttled agent can see the pool blocking it.

**Mid-build catch (arch problem avoided):** the original plan reused `budget.warning`/`budget.exceeded` for department alerts — but the per-agent `checkBudget` dedup query matches (agent_id, type, month), so a department alert on the triggering agent's timeline would have suppressed that agent's own personal-budget alert. Fixed with distinct types `department.budget.warning`/`department.budget.exceeded` (also added to `KNOWN_EVENT_TYPES`); the two pools' dedup can never cross-contaminate.

**Changes:**
- `docs/adr/0007-department-budgets.md` — new ADR (semantics, alternatives rejected, mid-month department-move caveat documented).
- `packages/types/src/index.ts` — `DepartmentBudgetState`, `DepartmentSummary`, `SetDepartmentBudgetInput`; new event types; `department_budget` on `AgentDetail`.
- `apps/api/src/store.ts` — `department_budgets` table; `setDepartmentBudget` (reset alert months on re-set), `departmentBudgetState`, `listDepartments`, `checkDepartmentBudget` (edge-triggered, emits `department.budget.*` on the triggering agent); `model.called` hook now also checks the agent's department pool; detail payload gains `department_budget`.
- `apps/api/src/server.ts` — department budget gate after the per-agent gate (403 + `policy.blocked` + `checkDepartmentBudget` to keep the alert on the trail); routes `GET /api/departments`, `GET|PUT /api/departments/:name/budget`.
- `apps/web/index.html` — "Department budgets" list-view section: per-department cards with pool meters + inline set/clear, plus a set-budget-for-any-name form; shared `budgetMeterHtml` renderer (refactored the agent budget card onto it); agent detail shows the department pool meter. Mobile-first cards, honest validation errors, truthful statuses (UI/UX track).
- Tests: 4 new (set → state → clear; validation fails closed; shared-pool math + edge-triggered alerts on the triggering agent + no personal-alert contamination; invoke 403 `department_budget_exceeded` / 502 passthrough) — **90/90 pass**.

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 90/90 · `npm run build` ✅. E2E against a live API: cap set → spend 0.45/0.50 → warning (90%) on triggering agent → spend 0.55 → exceeded → invoke 403 `department_budget_exceeded`, `policy.blocked` + `department.budget.exceeded` on the trail, department list + detail pool meter correct.

**Security self-review:** no secrets touched; caps are fail-closed validated (finite, non-negative); gates run before any provider network call; alert events carry only pool numbers, never prompt/response bodies; no new auth surface (routes behind the same API key).

**Committed:** `d327743 feat(governance): per-department monthly budget pools (ADR-0007)` (+ doc updates in this entry) — local only (Mosheh syncs to GitHub).

**Next:** Phase 4 COMPLETE. Remaining before the promotion decision (~a week out): Antonio's demo verdict, live BYOK key checks (all four adapters), Phase 2 real-daemon Ollama run (his machine). Open PRs: none. Per the directive, next cycle picks the highest-priority unclaimed item (P8 new MVP feature candidates: Phase 5 org view seeds, or DX/docs follow-ups).

## 2026-09-23 ~22:15 EDT — IN PROGRESS: Phase 5 org view, first slice (agent: antonio/loop)

Scope: Phase 5 "Organization View" first slice — `GET /api/org` (department → agents grouping with supervisor/owner delegation graph) + dashboard Organization section rendered mobile-first. Uses existing `department`, `owner`, `supervisor_agent_id` fields — no schema changes. Lifecycle actions (pause/resume/retire/clone buttons, status-change audit events) deferred to next slice.

## 2026-09-23 ~22:40 EDT — org view, first slice (agent: antonio/loop) — COMPLETE

**Task selected:** Phase 5 "Organization View" first slice (P8 new MVP feature per directive; Phase 4 complete, all Antonio-blocked items pending). Nothing claimed by the other agent.

**What changed:**
- `packages/types/src/index.ts` — new `OrgAgentNode`, `OrgDelegationLink`, `OrgDepartment`, `OrgOwnerRow`, `OrgView` types.
- `apps/api/src/store.ts` — `orgView()` on the Storage interface + SQLite impl: departments (agents + budget meters, incl. capped-but-empty departments), `unassigned` bucket, `delegation` links from `supervisor_agent_id` (dangling supervisors report `supervisor_name: null` — honest, never invented), `owners` human → agent rows. Read-only, no schema changes.
- `apps/api/src/server.ts` — `GET /api/org` (same API-key auth as everything else).
- `apps/web/index.html` — "Organization" section: mobile-first department cards (status pill, owner, autonomy level, "↳ reports to" line with removed-agent callout), pool budget meters, Unassigned card, and a delegation summary (agent → agent chains + owner pills). Empty/honest states throughout (UI/UX track).
- Tests: 3 new — grouping/unassigned/delegation/owner rows; dangling link stays truthful after supervisor delete; auth 401. **93/93 pass.**

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 93/93 · `npm run build` ✅ · dashboard inline script `node --check` ✅. E2E against a live API: lead/rep/drifter → Sales dept with 2 agents, unassigned [Drifter], delegation "Sales Rep → Sales Lead", owner row correct; wrong key → 401.

**Security self-review:** read-only endpoint behind the existing API key; no secrets touched, no prompt/response bodies, org data is registry metadata only; no new attack surface.

**Committed:** `8e7088e` local only (Mosheh syncs to GitHub).

**Next:** Phase 5 remaining — agent lifecycle actions (pause/resume/retire/clone with status-change audit events; good-first-issue candidates) and human → agent delegation management UI. Demo verdict, live BYOK key checks, Phase 2 real-daemon still need Antonio.

## 2026-09-23 ~22:45 EDT — IN PROGRESS: Phase 5 lifecycle actions — pause/resume/retire/clone with audit events (agent: antonio/loop)

Scope: `POST /api/agents/:id/{pause,resume,retire,clone}` with transition rules (retire is terminal), audit events `agent.paused/resumed/retired/cloned` on the trail, invoke gate fails closed for paused/retired agents, dashboard lifecycle buttons on agent detail. Delegation management UI stays queued for next cycle.

## 2026-09-23 ~23:15 EDT — Phase 5 lifecycle actions: pause/resume/retire/clone (agent: antonio/loop) — COMPLETE

**Task selected:** Phase 5 remainder, lifecycle slice (P8 new MVP feature per directive; Phase 4 complete, all Antonio-blocked items pending). Nothing claimed by the other agent. Delegation management UI stays queued for the next cycle.

**What changed:**
- `packages/types/src/index.ts` — new event types `agent.paused`, `agent.resumed`, `agent.retired`, `agent.cloned` (KNOWN_EVENT_TYPES).
- `apps/api/src/store.ts` — `Storage.lifecycleTransition(id, action, reason?)` + `ConflictError` (new, maps to 409): pause works from active/idle/error, resume only from paused, retire from anything live; retire is terminal (pause/resume after retire → 409); already-in-state is an idempotent no-op with no duplicate audit event. Each effective transition emits the matching audit event with `data.from_status/to_status` (+ optional `reason`, max 280 chars, validated). `cloneAgent(id, name?)` copies config (description, department, owner, supervisor_agent_id, provider, model, tools, permissions, budget, autonomy) into a new idle agent, emits `agent.cloned` with `data.source_agent_id`; any status may be cloned (the source's config is just a template).
- `apps/api/src/policy.ts` — lifecycle gate added to `checkInvokePolicy`, checked before the autonomy gate: retired → 403 `lifecycle_retired`, paused → 403 `lifecycle_paused`. The existing `policy.blocked` emission in the invoke path picks it up with no server changes.
- `apps/api/src/server.ts` — `POST /api/agents/:id/{pause,resume,retire,clone}` (empty body tolerated); `ConflictError` → 409. Note: `PATCH /api/agents/:id` remains the raw admin status setter — the lifecycle endpoints are the guarded, audited path.
- `apps/web/index.html` — Lifecycle section on agent detail: conditional Pause/Resume buttons, Retire (confirm dialog), Clone (name prompt, blank = default "(copy)"); a `btn.danger` style; server errors surface honestly via the existing error path. Mobile-first inline buttons (UI/UX track).
- `docs/good-first-issues/07-sdk-lifecycle-methods.md` (+ README table) — SDK wrapper draft for contributors (deferred deliberately).
- Tests: 3 new — transition rules + idempotency + terminal retire + reason validation + audit trail contents; clone config copy + idle start + `agent.cloned` provenance + 404; invoke blocked 403 for paused/retired with 2 `policy.blocked` events. **96/96 pass.**

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 96/96 · `npm run build` ✅ · dashboard inline script `node --check` ✅. E2E against a live API: create → pause (reason captured) → resume → clone (idle, config copied: Ops/10/4/web) → retire → resume-after-retire 409; trail `agent.created → agent.paused → agent.resumed → agent.retired` in order; `/api/org` unaffected (Ops department correct).

**Security self-review:** no secrets touched; reasons are length-validated (no log bloat); transition conflicts fail closed (409, never a silent state change); the lifecycle invoke gate runs before any provider network call; retired agents can't be silently re-armed except via the raw admin PATCH (maintainer key only, documented above); no new auth surface (routes behind the same API key).

**Next:** Phase 5 remainder — human → agent delegation management UI. Demo verdict, live BYOK key checks, Phase 2 real-daemon still need Antonio. Open PRs: none.

## 2026-09-23 ~23:20 EDT — IN PROGRESS: Delegation management UI — guarded supervisor/owner assignment on agent detail (agent: antonio/loop)

Scope: harden `PATCH /api/agents/:id` supervisor assignment server-side (target must exist, no self-supervision, no delegation cycles — fail closed 400), emit `agent.delegated` audit events on delegation changes, and add a "Delegation" section to the agent detail view (owner text input + save/clear, supervisor select from live agent list, honest dangling-supervisor display). Closes the last Phase 5 remainder item.

## 2026-09-23 ~23:40 EDT — Phase 5 delegation management UI: guarded supervisor/owner assignment (agent: antonio/loop) — COMPLETE

**Task selected:** Phase 5 remainder — delegation management UI (P8 new MVP feature per directive; Phase 4 complete, nothing claimed by the other agent). This closes the last queued Phase 5 item.

**What changed:**
- `apps/api/src/store.ts` — `updateAgent` now guards `supervisor_agent_id` assignments server-side: target must be an existing agent (400), no self-supervision (400), no delegation cycles via chain walk (400, fail closed). Clearing (null) always allowed. Real gap this fixed: before, any supervisor id could be written raw through PATCH with no validation — the org view and L5 approval checks would have followed a corrupt chain. Every effective owner/supervisor change emits an `agent.delegated` audit event with `data.supervisor_from/to` + `data.owner_from/to` (actor `human`).
- `apps/web/index.html` — agent detail gained a "Delegation" section (mobile-first): human-owner text input with Save/Clear, supervisor `<select>` built from the live agent list (self excluded), honest "supervisor agent was removed" callout for dangling links, server errors surfaced through the existing error path; new `patch()` fetch helper; org empty states now point at the Delegation editor instead of raw `supervisor_agent_id`.
- Tests: 1 new — valid chain, self-supervision 400, unknown target 400, cycle 400, clear OK, owner audit; `agent.delegated` counts correct (2 on B, 1 on A, 1 on C) and failed attempts left the chain untouched. **97/97 pass.**

**Verification:** `npm run lint` ✅ zero warnings · `npm run typecheck` ✅ · `npm test` ✅ 97/97 · `npm run build` ✅ · dashboard inline script `node --check` ✅. E2E against a live API: rep → lead 200 → `/api/org` delegation "E2E-Rep → E2E-Lead" + owner row; cycle lead → rookie 400 "delegation cycle"; self 400; owner "Antonio" set; clear supervisor 200.

**Security self-review:** assignment guards fail closed server-side (client-side dropdown can't be trusted); `agent.delegated` events write from/to ids only — no prompt/response bodies, no secrets; no new auth surface (PATCH behind the existing API key); owner is free text but length is bounded by normal input, stored raw, escaped on render (`esc()`).

**Committed:** `9094baf` local only (Mosheh syncs to GitHub).

**Next:** Phase 5 COMPLETE. Remaining before the promotion decision (~a week out): Antonio's demo verdict (launch post held), live BYOK key checks, Phase 2 real-daemon Ollama run (his machine). Open PRs: none.
