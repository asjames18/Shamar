# STATUS — Shamar (living snapshot)

_Last updated: 2026-09-25 ~11:52 EDT.

## Right now

**Week of development (2026-09-23 → ~2026-09-30)** — Antonio's decision: keep building for about a week before deciding whether to promote publicly and invite outside contributors. The loop is working the MVP targets in order (Phase 2 real-daemon run skipped for now — needs his machine; starting Phase 3 cloud adapters). **UI/UX track added 2026-09-23 (Antonio): mobile-first, modern, attractive UI ships alongside every phase — responsive phone → tablet → desktop, works right and looks right.** Launch post + all promotion HELD until the decision.

**Demo-polish pass COMPLETE (2026-09-23 ~17:15)** — the public demo (`shamar-site`) now runs a simulated live event stream (sample event every 12–20s, no backend), a 6-agent fleet with an error state, page-load-anchored timestamps, and visual polish. Landing "Ollama ready" wording corrected to "zero-cost path". **Deployed to the preview worker 2026-09-23 ~16:55** — waiting on Antonio's verdict on the demo's attractiveness (launch post stays HELD).

**Phase 3 cloud adapters COMPLETE (2026-09-23 ~19:30)** — all four BYOK adapters (OpenRouter, Anthropic, OpenAI, Gemini) working: validate → discover → invoke → usage/cost recorded, honest-501 fallback retired. **Pending:** live checks against Antonio's real BYOK keys for all four; Phase 2 real-daemon Ollama run (his machine).

**Phase 4 governance — first slice done (2026-09-23 ~20:00)** — human approval workflow live: `POST /api/approvals`, `GET /api/approvals?agent_id=&status=`, `POST /api/approvals/:id/grant|deny`; `approval.requested/granted/denied` events in the audit trail; double-decide fails closed; `pending_approvals` on dashboard summary + agent detail; web dashboard card + per-agent Grant/Deny buttons. Tests 75/75.

**Phase 4 governance — third slice done (2026-09-23 ~21:45)** — autonomy-level policy rules (L0–L5) with server-side enforcement (ADR-0006): L0 invokes always blocked, L1 needs a human grant inside a trailing 24h window, L2 gets max_tokens clamped to 1024, L3/L4/L5 invoke subject to the existing budget gate; new agents default to L3 (Standard). L5 supervisors can grant/deny approvals for agents that list them as `supervisor_agent_id` (decided_by recorded as `agent:<id>`, audit actor `agent`). Denials emit `policy.blocked` and fail closed. Dashboard agent detail shows a labeled autonomy badge (Monitored → Supervisor) with a policy description tooltip. Tests 86/86; E2E verified on a live API (L0 invoke → 403 autonomy_l0 + audit event).

**Phase 4 governance — second slice done (2026-09-23 ~20:30)** — per-agent monthly budgets live: `budget.warning` at 80% and `budget.exceeded` at 100% (edge-triggered, once per month), `POST /api/providers/:id/invoke` returns 403 + emits `policy.blocked` when the agent is at budget (gate runs before any provider call, so no cost can be incurred); `budget` block on agent detail; web dashboard budget meter (ok/warning/exceeded). Spend counts only real reported costs — unknown stays out. Tests 78/78.

**Phase 4 governance — fourth and final slice done (2026-09-23 ~22:10)** — per-department monthly budget pools (ADR-0007): shared caps via `PUT/GET /api/departments/:name/budget` + `GET /api/departments` (agent counts + meters); spend summed across member agents per calendar month (real reported costs only); `department.budget.warning`/`department.budget.exceeded` edge-triggered once per month on the triggering agent's timeline — deliberately distinct types so per-agent budget dedup can never cross-contaminate (caught during the build); invoke gate order is autonomy → per-agent budget → department budget, 403 + `policy.blocked` (reason `department_budget_exceeded`) when a pool is exceeded; dashboard department budgets card with meters + inline set/clear; `department_budget` meter on agent detail so a throttled agent can see why invokes fail. Tests 90/90; E2E verified on a live API (cap → spend → warning → exceeded → 403). **Phase 4 COMPLETE.**

**Phase 5 org view — first slice done (2026-09-23 ~22:40)** — organization view: `GET /api/org` (departments with agents + budget meters, unassigned bucket, agent → agent delegation links from `supervisor_agent_id` with honest `supervisor_name: null` for dangling links, human → agent owner rows; read-only, no schema changes) + dashboard Organization section (mobile-first department cards with status/owner/autonomy/reports-to lines, pool budget meters, unassigned card, delegation summary with owner pills). Tests 93/93; E2E verified on a live API; committed locally (`8e7088e`) — Mosheh syncs to GitHub. Phase 5 remainder: agent lifecycle actions (pause/resume/retire/clone with status-change audit events) and delegation management UI.

**Phase 5 lifecycle actions — done (2026-09-23 ~23:15)** — `POST /api/agents/:id/{pause,resume,retire,clone}` with server-side transition rules (retire is terminal — pause/resume after retire fail closed with 409; already-in-state calls are idempotent no-ops); audit events `agent.paused/resumed/retired/cloned` on the agent's timeline (optional `reason` captured); clone copies config (department, owner, supervisor, provider, model, tools, permissions, budget, autonomy) into a new idle agent with `data.source_agent_id`; the invoke gate now fails closed for paused/retired agents (403 + `policy.blocked`, checked before autonomy/budget gates). Dashboard agent detail gained Lifecycle buttons (Pause/Resume conditional, Retire with confirm, Clone with name prompt). Tests 96/96; E2E verified on a live API (pause → resume → clone → retire → 409). SDK lifecycle methods left as good-first-issue draft 07. Phase 5 remainder: delegation management UI.

**Phase 5 COMPLETE (2026-09-23 ~23:40)** — see below. **Phase 6 COMPLETE 2026-09-25** (analytics summary + value/human-hours-saved).

**Phase 5 delegation management UI — done (2026-09-23 ~23:40)** — guarded `PATCH /api/agents/:id` supervisor assignment: target must exist, no self-supervision, no delegation cycles (all fail closed 400; the org view and L5 approval checks can never follow a corrupt chain); every owner/supervisor change emits an `agent.delegated` audit event with from/to. Dashboard agent detail gained a Delegation section (mobile-first): human-owner input with Save/Clear, supervisor `<select>` built from the live agent list, honest "supervisor was removed" callout for dangling links, server errors surfaced through the existing error path. Tests 97/97; E2E verified on a live API (assign → cycle attempt 400 → clear → owner set → `/api/org` delegation + owner rows correct). **Phase 5 COMPLETE.**

**Phase 6 analytics — first slice done (2026-09-25 ~09:15)** — `GET /api/analytics/summary` rolls up known cost_usd (nulls excluded), task success/fail rates, avg duration, and error events by agent / department / model / provider. Optional `?window=24h|7d|30d|month` or `?since=<ISO>`; **default window is all-time**. Mobile-first Analytics section on the dashboard (totals cards + breakdown cards, window selector).

**Phase 6 value / human-hours-saved — done (2026-09-25 ~10:30)** — optional explicit `data.human_minutes_saved` on `task.completed` (finite non-negative or absent/null; invalid → 400). Analytics `value` block: `tasks_completed`, `human_hours_saved` (null when no estimates), `events_with_hours_estimate`, `estimated: true`. UI shows — when unknown (same honesty as cost). No dollar ROI. ADR-0008. SDK `humanMinutesSaved` on `taskCompleted`. **Phase 6 COMPLETE.**

## Recently done

**Contributor-readiness sprint — ✅ COMPLETE 2026-09-23 ~16:35** (directive from Antonio): repo is ready for outside contributors.
- ✅ Issue templates (bug report / feature request) + config

## Next (queued)

1. **Demo polish pass — ✅ COMPLETE 2026-09-23 ~17:15** — "demo that sells": simulated live event stream (new sample event every 12–20s), 6-agent fleet incl. error state (Deploy Watchdog, 3 failures) + paused + idle, timestamps anchored to page load, visual polish (pulsing live badge, fresh-row fade-in, "Needs attention" card, attention banner on the error-agent detail), landing "Ollama ready" wording fixed → "zero-cost path". `shamar-site/worker.js` is now generated from `landing.html`/`demo.html` via `build-worker.js`. **Deployed to the preview worker 2026-09-23 ~16:55** — awaiting Antonio's verdict.
2. **Launch post** — drafted (`docs/launch-post-draft.md`), **HELD until Antonio judges the demo attractive**. Nothing gets published before that.
3. **Phase 2 close-out** — Ollama adapter built and verified against a mock daemon; needs one real-daemon run.
4. **Phase 3 cloud adapters** — ✅ **OpenRouter (first BYOK adapter) done 2026-09-23 ~18:00** … ✅ **Anthropic (second BYOK adapter) done 2026-09-23 ~18:30** … ✅ **OpenAI (third BYOK adapter) done 2026-09-23 ~19:00** … ✅ **Gemini (fourth and final) done 2026-09-23 ~19:30**: `GeminiAdapter` in `packages/providers` — free credential validation via documented `GET /v1beta/models?key=` (200 = valid key, 400/403 = bad; doubles as model discovery), `POST /v1beta/models/{model}:generateContent?key=` invoke with real usage from `usageMetadata` (`promptTokenCount`/`candidatesTokenCount`), system messages mapped to the documented `systemInstruction`; `estimateCost` always null (Gemini API exposes no pricing — never guessed, ADR-0003); key from `GEMINI_API_KEY` env, sent only as the documented `key` query param, never logged/stored. Wired through the existing provider endpoints with zero server changes. **Every provider kind is now implemented — the honest-501 path is retired** (API + adapter tests updated accordingly). 72/72 tests pass (7 new, mock Gemini server); E2E verified against a live API + mock Gemini: validate → healthy, discover → models, invoke → `model.called` event with real token usage and cost_usd=null (honest). **Live checks against real keys need Antonio's BYOK keys** (he never commits them; they go in `.env`). **Phase 3 COMPLETE.**

## Open PRs

- **PR #7** (`feat/phase6-value-hours-saved`) merged to main (`f87805f`) — Phase 6 COMPLETE.
- **PR #8** (`feat/sdk-lifecycle-methods`) merged to main (`c4e3c06`) — SDK `pause`/`resume`/`retire`/`clone` (good-first-issue 07).
- **PR #9** (`feat/sdk-delete-agent`) merged to main (`1790d66`) — SDK `deleteAgent` (good-first-issue 01).
- **This PR:** `feat/api-get-provider-by-id` — API `GET /api/providers/:id` (good-first-issue 02) — done in this PR (do not merge until reviewed).
## Blockers / waiting on Antonio

- **Real-daemon Ollama verification** — `ollama pull llama3.2`, then one invoke via the API. Needs his machine; closes Phase 2.
- **Custom domain** — DNS `AAAA` record for `shamar` → `100::` (proxied) on melanatedintech.com.
- **Launch verdict** — his call on when the demo is attractive enough to post.

## How to run

```bash
npm install
npm run lint && npm run typecheck && npm test && npm run build
cp .env.example .env && docker compose up   # api :4000, web :3000
```

- Live demo: https://shamar-site.asjames18.workers.dev/demo
- Repo: https://github.com/asjames18/Shamar

## Health

Tests 113/113 — lint clean — typecheck clean — build clean (verified 2026-09-25 ~11:52).
