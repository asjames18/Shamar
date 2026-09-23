# Draft issue — Add `deleteAgent` to the SDK

**Suggested labels:** `good-first-issue`, `enhancement`
**Estimated effort:** S (< 1 hour)

## Context

The API supports deleting an agent — `DELETE /api/agents/:id` in
`apps/api/src/server.ts` (returns `{ deleted: true }` or 404) — but the
zero-dependency TypeScript SDK in `packages/sdk/src/index.ts` has no
`deleteAgent` helper. It already has `register`, `getAgent`, `listAgents`,
and `updateAgent`, so `deleteAgent` is the missing symmetric operation and
contributors managing agent lifecycles (e.g. in a test harness or an
offboarding script) currently have to hand-roll the HTTP call.

## Acceptance criteria

- [ ] `ShamarClient.deleteAgent(id: string): Promise<void>` added to
      `packages/sdk/src/index.ts`, calling `DELETE /api/agents/:id` and
      throwing `ShamarError` on non-2xx (including a clear error for 404).
- [ ] Integration test in `packages/sdk/src/test/` (see existing tests for the
      pattern — they spin up the real API against a temp SQLite file) covering:
  - deleting an existing agent succeeds and a subsequent `getAgent` throws 404
  - deleting a nonexistent agent throws `ShamarError` with status 404
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.

## Hints

- Copy the shape of the existing `updateAgent` method (same file, ~line 98):
  it uses `this.request(...)` with a method + path and returns the typed body.
- The API response body for delete is `{ deleted: true }`; on 404 it returns
  `{ error: 'agent not found' }` with status 404.
- API-side tests for delete live in `apps/api/src/test/api.test.ts` if you want
  to see the server contract being exercised.

## Notes for reviewer

Purely additive — no changes to API behavior, storage, or the dashboard.
