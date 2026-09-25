# Draft issue — Sanitize `?limit=` on `GET /api/events`

**Suggested labels:** `good-first-issue`, `bug`
**Estimated effort:** S (< 1 hour)

## Context

`GET /api/events?limit=<n>` accepts a `limit` query param, parsed in
`apps/api/src/server.ts` with `Number(limit)` and passed to
`storage.queryEvents()` in `apps/api/src/store.ts`. The store clamps with
`Math.min(Math.max(limit ?? 50, 1), 500)` — but `NaN` is not nullish, so a
non-numeric value like `?limit=abc` flows through as `NaN` and the SQLite
query fails with `datatype mismatch`, which the server turns into a
**500 internal server error**.

A malformed query param should never produce a 500. Verified against the
built API on 2026-09-23: `queryEvents({ limit: NaN })` throws `Error: datatype
mismatch`.

## Acceptance criteria

- [ ] `GET /api/events?limit=abc` returns **400** `{ error: ... }` with a
      human-readable message (e.g. `limit must be a number`), not a 500.
  - Alternative acceptable behavior: silently fall back to the default limit
    of 50. Pick one and document it in the issue you publish; don't do both.
- [ ] Negative, zero, and fractional values keep the existing clamp behavior
      (1–500); large values still clamp to 500.
- [ ] API test in `apps/api/src/test/api.test.ts`: `?limit=abc` → 400,
      `?limit=10` still works, `?limit=99999` clamps to ≤ 500 rows.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.

## Hints

- The parsing happens at the `GET /api/events` handler in `server.ts` (look
  for `url.searchParams.get('limit')`). Validate there and throw the existing
  `ValidationError` class — the top-level handler already maps it to a 400.
- The clamping logic lives in `queryEvents` in `store.ts`; the bug is that
  `NaN` survives the clamp. You can fix at either layer, but the 400 belongs
  in the HTTP layer.
- Check whether the same `Number(...)` pattern exists on any other route
  while you're in there (`API_PORT` is env, not user input — out of scope).

## Notes for reviewer

This is a real, reproducible 500 today — good demonstration that the fix is
verified by the new test, not just by reading the code.
