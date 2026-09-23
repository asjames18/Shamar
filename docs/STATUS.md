# STATUS — Shamar (living snapshot)

_Last updated: 2026-09-23 ~15:35 EDT. Update this file whenever the state below changes — it's the first thing every agent reads._

## Right now

**Contributor-readiness sprint** (directive set by Antonio 2026-09-23): make the repo ready for outside contributors before resuming feature work.

- ✅ Issue templates (bug report / feature request) + config
- ✅ 6 good-first-issue drafts in `docs/good-first-issues/`
- ✅ `AGENTS.md` (agent working manual) + `AGENT_START.md` (onboarding brief)
- ⏳ `CONTRIBUTING.md` expansion (prerequisites, install, test flow, PR conventions)
- ⏳ README polish (vision in 30 seconds, demo link, quickstart)
- ⏳ Verify every quickstart command by actually running it

## Next (queued)

1. **Demo polish pass** — "demo that sells": simulated live event stream, richer seed data (5–8 agents incl. an error state), timestamps anchored to page load, visual polish, fix premature "Ollama ready" wording on the landing page.
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
