**Status:** done (implemented in `feat/sdk-lifecycle-methods`)

# SDK: add lifecycle methods (`pause`, `resume`, `retire`, `clone`)

## Context

The control plane API now has agent lifecycle endpoints (Phase 5):
`POST /api/agents/:id/{pause,resume,retire,clone}`. They work — the dashboard
calls them — but the TypeScript SDK (`packages/sdk`) doesn't expose them yet.
External clients have to hand-roll the HTTP calls.

`packages/sdk/src/index.ts` is the whole SDK. Look at how the existing
methods (e.g. `register`, `heartbeat`) build their requests — `pause`,
`resume`, `retire` are the same shape (POST, no body needed for a plain
call), and `clone` optionally takes a `name`.

## Acceptance criteria

- New methods `pause(id, reason?)`, `resume(id)`, `retire(id, reason?)`,
  `clone(id, name?)` on the SDK client, each returning the updated/new agent.
- They surface server errors honestly (409 on a terminal-state transition,
  404 on unknown agent) — no swallowing, no invented fallbacks.
- Tests in the SDK test suite that run against a live in-memory API and
  assert the returned agent state (paused → resumed → retired; clone starts
  idle with copied config).
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all green.

## Hints

- API semantics: `apps/api/src/server.ts` (search for `lifecycleMatch`);
  transition rules: `apps/api/src/store.ts` (`lifecycleTransition`,
  `cloneAgent`).
- The server accepts an empty JSON body, so `{}` is a fine default.
- Keep the SDK's zero-runtime-dependency rule.

## Estimated effort

S (< 1 hour)
