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
