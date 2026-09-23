# STATUS — Shamar (living snapshot)

_Last updated: 2026-09-23 ~17:30 EDT. Update this file whenever the state below changes — it's the first thing every agent reads._

## Right now

**Week of development (2026-09-23 → ~2026-09-30)** — Antonio's decision: keep building for about a week before deciding whether to promote publicly and invite outside contributors. The loop is working the MVP targets in order (Phase 2 real-daemon run skipped for now — needs his machine; starting Phase 3 cloud adapters). Launch post + all promotion HELD until the decision.

**Demo-polish pass COMPLETE (2026-09-23 ~17:15)** — the public demo (`shamar-site`) now runs a simulated live event stream (sample event every 12–20s, no backend), a 6-agent fleet with an error state, page-load-anchored timestamps, and visual polish. Landing "Ollama ready" wording corrected to "zero-cost path". **Deployed to the preview worker 2026-09-23 ~16:55** — waiting on Antonio's verdict on the demo's attractiveness (launch post stays HELD).

## Recently done

**Contributor-readiness sprint — ✅ COMPLETE 2026-09-23 ~16:35** (directive from Antonio): repo is ready for outside contributors.
- ✅ Issue templates (bug report / feature request) + config

## Next (queued)

1. **Demo polish pass — ✅ COMPLETE 2026-09-23 ~17:15** — "demo that sells": simulated live event stream (new sample event every 12–20s), 6-agent fleet incl. error state (Deploy Watchdog, 3 failures) + paused + idle, timestamps anchored to page load, visual polish (pulsing live badge, fresh-row fade-in, "Needs attention" card, attention banner on the error-agent detail), landing "Ollama ready" wording fixed → "zero-cost path". `shamar-site/worker.js` is now generated from `landing.html`/`demo.html` via `build-worker.js`. **Deployed to the preview worker 2026-09-23 ~16:55** — awaiting Antonio's verdict.
2. **Launch post** — drafted (`docs/launch-post-draft.md`), **HELD until Antonio judges the demo attractive**. Nothing gets published before that.
3. **Phase 2 close-out** — Ollama adapter built and verified against a mock daemon; needs one real-daemon run.

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

Tests 43/43 · lint clean · typecheck clean (verified 2026-09-23).
