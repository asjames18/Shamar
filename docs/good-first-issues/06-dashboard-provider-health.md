# Draft issue — Dashboard: provider list with health status

**Suggested labels:** `good-first-issue`, `enhancement`
**Estimated effort:** M (1–3 hours)

## Context

The dashboard (`apps/web/index.html`) is agent-centric: it lists agents and
shows an agent detail view. Providers are invisible in the UI even though the
API has everything needed — `GET /api/providers` returns each provider's
`status` (`healthy`/`unhealthy`/unset) and `last_health_check`, and
`POST /api/providers/:id/validate` performs a real reachability check. A
contributor setting up their first Ollama provider currently has to use curl
to confirm it's healthy; the dashboard should show that.

## Acceptance criteria

- [ ] Dashboard gains a "Providers" section (below the agents list or as a
      tab — pick the smaller change) showing: name, kind, status badge
      (healthy / unhealthy / unknown), and last health-check time.
- [ ] Each provider row has a "Validate" button that calls
      `POST /api/providers/:id/validate` and refreshes the badge in place;
      failures surface the API's error message (e.g. "Ollama not reachable
      at …") instead of a silent no-op.
- [ ] New providers still get created via the API/seed script — this issue is
      display + validate only, not a provider registration form (separate
      issue if wanted).
- [ ] Follows the existing dashboard patterns: `fetch()` helpers with the
      `x-api-key` header, the `esc()` HTML-escaping helper on all rendered
      provider fields (provider names/URLs are user input), 5s auto-refresh
      keeps working.
- [ ] `node --check` on the page's JS (or equivalent extraction) passes;
      `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass;
      manual screenshot/GIF of the new section in the PR.

## Hints

- The dashboard is a single static `index.html` with inline JS — look at
  `refreshList()` and the existing `post()` helper (added for the Add-agent
  form) as the patterns to copy.
- `GET /api/providers` is unauthenticated only for `/api/health`; providers
  need the API key like everything else — reuse the key input the page
  already has.
- Status values in the DB: `setProviderStatus(id, 'healthy' | 'unhealthy')`
  in `apps/api/src/store.ts`. A provider that has never been validated has no
  status — render that as "unknown", not as a failure.

## Notes for reviewer

UI polish that unblocks real contributor onboarding (Ollama setup
verification) — fits the contributor-readiness sprint. Keep the visual style
consistent with the existing page; no new CSS framework.
