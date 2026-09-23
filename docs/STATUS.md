# STATUS — Shamar (living snapshot)

_Last updated: 2026-09-23 ~18:35 EDT.

## Right now

**Week of development (2026-09-23 → ~2026-09-30)** — Antonio's decision: keep building for about a week before deciding whether to promote publicly and invite outside contributors. The loop is working the MVP targets in order (Phase 2 real-daemon run skipped for now — needs his machine; starting Phase 3 cloud adapters). **UI/UX track added 2026-09-23 (Antonio): mobile-first, modern, attractive UI ships alongside every phase — responsive phone → tablet → desktop, works right and looks right.** Launch post + all promotion HELD until the decision.

**Demo-polish pass COMPLETE (2026-09-23 ~17:15)** — the public demo (`shamar-site`) now runs a simulated live event stream (sample event every 12–20s, no backend), a 6-agent fleet with an error state, page-load-anchored timestamps, and visual polish. Landing "Ollama ready" wording corrected to "zero-cost path". **Deployed to the preview worker 2026-09-23 ~16:55** — waiting on Antonio's verdict on the demo's attractiveness (launch post stays HELD).

**Phase 3 cloud adapters COMPLETE (2026-09-23 ~19:30)** — all four BYOK adapters (OpenRouter, Anthropic, OpenAI, Gemini) working: validate → discover → invoke → usage/cost recorded, honest-501 fallback retired. **Pending:** live checks against Antonio's real BYOK keys for all four; Phase 2 real-daemon Ollama run (his machine).

**Phase 4 governance — first slice done (2026-09-23 ~20:00)** — human approval workflow live: `POST /api/approvals`, `GET /api/approvals?agent_id=&status=`, `POST /api/approvals/:id/grant|deny`; `approval.requested/granted/denied` events in the audit trail; double-decide fails closed; `pending_approvals` on dashboard summary + agent detail; web dashboard card + per-agent Grant/Deny buttons. Tests 75/75. Remaining Phase 4: autonomy-level policy rules, budgets with warnings/throttling, `policy.blocked` enforcement.

## Recently done

**Contributor-readiness sprint — ✅ COMPLETE 2026-09-23 ~16:35** (directive from Antonio): repo is ready for outside contributors.
- ✅ Issue templates (bug report / feature request) + config

## Next (queued)

1. **Demo polish pass — ✅ COMPLETE 2026-09-23 ~17:15** — "demo that sells": simulated live event stream (new sample event every 12–20s), 6-agent fleet incl. error state (Deploy Watchdog, 3 failures) + paused + idle, timestamps anchored to page load, visual polish (pulsing live badge, fresh-row fade-in, "Needs attention" card, attention banner on the error-agent detail), landing "Ollama ready" wording fixed → "zero-cost path". `shamar-site/worker.js` is now generated from `landing.html`/`demo.html` via `build-worker.js`. **Deployed to the preview worker 2026-09-23 ~16:55** — awaiting Antonio's verdict.
2. **Launch post** — drafted (`docs/launch-post-draft.md`), **HELD until Antonio judges the demo attractive**. Nothing gets published before that.
3. **Phase 2 close-out** — Ollama adapter built and verified against a mock daemon; needs one real-daemon run.
4. **Phase 3 cloud adapters** — ✅ **OpenRouter (first BYOK adapter) done 2026-09-23 ~18:00** … ✅ **Anthropic (second BYOK adapter) done 2026-09-23 ~18:30** … ✅ **OpenAI (third BYOK adapter) done 2026-09-23 ~19:00** … ✅ **Gemini (fourth and final) done 2026-09-23 ~19:30**: `GeminiAdapter` in `packages/providers` — free credential validation via documented `GET /v1beta/models?key=` (200 = valid key, 400/403 = bad; doubles as model discovery), `POST /v1beta/models/{model}:generateContent?key=` invoke with real usage from `usageMetadata` (`promptTokenCount`/`candidatesTokenCount`), system messages mapped to the documented `systemInstruction`; `estimateCost` always null (Gemini API exposes no pricing — never guessed, ADR-0003); key from `GEMINI_API_KEY` env, sent only as the documented `key` query param, never logged/stored. Wired through the existing provider endpoints with zero server changes. **Every provider kind is now implemented — the honest-501 path is retired** (API + adapter tests updated accordingly). 72/72 tests pass (7 new, mock Gemini server); E2E verified against a live API + mock Gemini: validate → healthy, discover → models, invoke → `model.called` event with real token usage and cost_usd=null (honest). **Live checks against real keys need Antonio's BYOK keys** (he never commits them; they go in `.env`). **Phase 3 COMPLETE.**

## Open PRs

None.

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

Tests 75/75 · lint clean · typecheck clean (verified 2026-09-23 ~20:05).
