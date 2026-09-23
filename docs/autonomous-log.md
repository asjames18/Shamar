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
