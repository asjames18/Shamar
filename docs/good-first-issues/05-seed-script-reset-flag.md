**Status:** done (PR #13 / `feat/seed-script-reset-flag`) — `--reset` / `--reset=true` deletes only exact known seeded demo agents, then seeds fresh; demo provider row retained (no DELETE /api/providers/:id).

# Draft issue — `--reset` flag for the demo seed script

**Suggested labels:** `good-first-issue`, `enhancement`
**Estimated effort:** S (< 1 hour)

## Context

`scripts/seed-demo.js` seeds 4 demo agents, a demo Ollama provider, and two
days of activity. It's idempotent by name (re-runs reuse agents, no
duplicates), which is great — but there is no way to start clean. Contributors
iterating on the dashboard or demo data have to delete the SQLite file by
hand (`data/` directory), which also wipes anything else they created. A
`--reset` flag that removes only the seeded demo entities before seeding would
make the demo loop tighter.

## Acceptance criteria

- [x] `node scripts/seed-demo.js --reset` (also accept `--reset=true`)
      deletes the seeded demo agents and demo provider **by their known seed
      names** and then seeds fresh. Exit code 0 on success.
- [x] Without the flag, behavior is unchanged (idempotent reuse by name).
- [x] The flag only touches entities created by the seed script — it must not
      delete agents or providers the user created themselves. Match on the
      exact seeded names, not on a pattern like "demo".
- [x] Print a short summary: how many demo agents/providers/events were
      removed, then the normal seed summary.
- [x] Update the seed-script section of `README.md` with the new flag.
- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all
      pass (script is plain JS — at minimum `node --check` it and do a live
      run against a temp DB, like the original verification did).

## Hints

- The seeded names are defined near the top of `scripts/seed-demo.js`; reuse
  those constants for the deletion filter so the two can't drift apart.
- Deletion goes through the API: `DELETE /api/agents/:id` exists, but there
  is currently no `DELETE /api/providers/:id` — you may need to look up the
  provider's events/agents only, or handle provider cleanup by deleting its
  agents and noting the provider row as a known limitation in the PR (a
  provider-delete endpoint is a separate issue; don't scope-creep this one).
- The original verification approach (fresh SQLite on a temp port, two runs,
  idempotency check) is documented in `docs/autonomous-log.md` — repeat it
  with a third `--reset` run.

## Notes for reviewer

Safety-critical detail: "only seeded names, never user data" must hold. The
PR description should show the before/after agent list from the live test run.
