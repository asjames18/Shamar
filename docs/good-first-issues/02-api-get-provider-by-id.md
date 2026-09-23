# Draft issue — Add `GET /api/providers/:id`

**Suggested labels:** `good-first-issue`, `enhancement`
**Estimated effort:** S (< 1 hour)

## Context

The providers API in `apps/api/src/server.ts` currently exposes `GET /api/providers`
(list) and `POST /api/providers` (create), plus the sub-resource routes
`/:id/models`, `/:id/validate`, and `/:id/invoke`. There is no single-provider
read — `GET /api/providers/:id` — even though the agents API has the symmetric
`GET /api/agents/:id` right next to it. A client that wants to show one
provider's detail (e.g. the dashboard) has to fetch the whole list and filter
client-side.

`storage.getProvider(id)` already exists in `apps/api/src/store.ts` (used by
the models/validate/invoke routes), so this is a thin routing addition.

## Acceptance criteria

- [ ] `GET /api/providers/:id` returns `{ provider }` with the same shape as an
      item in `GET /api/providers` (id, kind, name, base_url, has_credential,
      status, last_health_check, created_at), behind the same API-key auth.
- [ ] Unknown id returns 404 `{ error: 'provider not found' }` — matching the
      error string the sibling sub-resource routes already use.
- [ ] API test in `apps/api/src/test/api.test.ts`: create a provider, fetch it
      by id, assert the shape; fetch a bogus id, assert 404.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.

## Hints

- Use an exact-match regex `^/api/providers/([^/]+)$` (with the `$` anchor) like the
  `agentMatch` block in `server.ts` — the anchor is what keeps it from
  colliding with the `/:id/models|validate|invoke` sub-resource routes,
  regardless of registration order.
- The 404 message convention: sub-resource routes use
  `{ error: 'provider not found' }`; keep it consistent.
- The provider list shape is defined by `listProviders()` in `store.ts`; the
  single read should reuse `getProvider()` so the shapes can't drift.

## Notes for reviewer

Read-only addition; no storage changes. Keep `has_credential` boolean-only —
never expose the credential itself (see `SECURITY.md`).
