# Good first issues — drafts

Each file in this directory is a **draft GitHub issue** for a new contributor.
They are NOT published GitHub issues — the maintainer reviews these files and
creates the actual issues (with the `good-first-issue` label) when the project
is ready for public contributors.

## How a draft is structured

- **Title** — the suggested issue title
- **Context** — why it matters and what's actually true in the codebase today
- **Acceptance criteria** — what "done" means (the bar a PR must clear)
- **Hints** — files and functions to look at, patterns to copy
- **Estimated effort** — S (< 1 hour), M (1–3 hours), L (half a day)

## House rules for contributors picking these up

1. Claim one issue at a time; keep the PR to one issue.
2. Every PR must pass `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
3. Follow the ground rules in `CONTRIBUTING.md`: no secrets in git, zero-cost local
   operation must keep working, provider-neutral core, no placeholder numbers as
   real data.
4. Security issues are never public — see `SECURITY.md`.

## Current drafts

| # | Draft | Effort |
|---|-------|--------|
| 01 | [Add `deleteAgent` to the SDK](01-sdk-delete-agent.md) | S |
| 02 | [Add `GET /api/providers/:id`](02-api-get-provider-by-id.md) | S |
| 03 | [Sanitize `?limit=` on `GET /api/events`](03-api-sanitize-event-limit.md) | S |
| 04 | [Python example client (stdlib only)](04-examples-python-client.md) | M |
| 05 | [`--reset` flag for the demo seed script](05-seed-script-reset-flag.md) | S |
| 06 | [Dashboard: provider list with health status](06-dashboard-provider-health.md) | M |
