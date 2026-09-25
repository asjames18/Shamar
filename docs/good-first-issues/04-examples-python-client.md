**Status:** done (implemented in `feat/examples-python-client`) — stdlib-only Python port of `examples/register-and-report.js`; new `examples/README.md`.

# Draft issue — Python example client (stdlib only)

**Suggested labels:** `good-first-issue`, `documentation`
**Estimated effort:** M (1–3 hours)

## Context

`examples/register-and-report.js` shows the full first-run flow against the
API: register an agent, send a heartbeat, submit `agent.started` /
`model.called` / `task.completed` events. It's the reference client new
contributors run first. There is no Python equivalent, and Python is where a
large share of agent developers live — a stdlib-only Python port (no pip
install required) lowers the barrier for that audience and doubles as a
second consumer of the API contract.

## Acceptance criteria

- [x] `examples/register-and-report.py` using **only the Python standard
      library** (`urllib`, `json`, `os`, `sys`) — zero pip dependencies.
- [x] Mirrors the JS script's flow and CLI surface: base URL from
      `sys.argv[1]` or `SHAMAR_BASE_URL`/`API_BASE_URL` (default
      `http://localhost:4000`), API key from `sys.argv[2]` or
      `SHAMAR_API_KEY`/`AGENTOS_DEV_API_KEY`; clear error if no key is set.
- [x] Registers an agent, sends a heartbeat, submits the same three events,
      and prints the created agent id + a link to the dashboard detail view.
- [x] Running it against a live API produces an agent + events visible on the
      dashboard (verify manually; describe what you saw in the PR).
- [x] A short `examples/README.md` (new file) describing both example clients,
      prerequisites, and the one-liner to run each.
- [x] No lint/typecheck/test/build regressions (`npm run lint`,
      `npm run typecheck`, `npm test`, `npm run build` pass; add `python3 -m
      py_compile` to your own verification and mention it in the PR).

## Hints

- Read `examples/register-and-report.js` first — port its logic, don't
  redesign it. Keep the same event types and summary strings so output is
  comparable.
- Auth: `x-api-key` header (see `apps/api/src/server.ts` `authorized()`).
- Event ingestion: `POST /api/events` accepts a single event object or
  `{ "events": [...] }` for batch.
- Known event types are exported from `packages/types` (`KNOWN_EVENT_TYPES`);
  unknown types are rejected with a 400 naming the valid ones.

## Notes for reviewer

Docs-only + example code; no API changes. The manual-verification note in the
PR matters more than usual here since there's no Python test harness wired in.
