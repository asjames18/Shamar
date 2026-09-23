# Contributing

Small, tested, documented PRs beat big ones. Read `ARCHITECTURE.md` and the ADRs in `docs/adr/` before changing core design.

## Ground rules

- **No secrets in git.** Ever. API keys, tokens, cookies, private keys stay in `.env` (see `.env.example`). PRs containing secrets will be closed.
- **Zero-cost local operation must keep working.** If your change requires paid infra, it needs a free local path too.
- **Provider-neutral.** No hard dependency on one LLM company in core code; provider specifics live in `packages/providers` adapters behind the `ProviderAdapter` interface (ADR-0004).
- **Evidence over hype.** Don't commit placeholder numbers as real data; unknown costs stay `null`.
- **One meaningful unit of work per PR.** Prefer completing one useful thing over starting several.

## Development

```bash
cp .env.example .env
docker compose up        # full stack
# or run the API directly:
cd apps/api && npm install && npm run dev
```

## Checks (must pass before merge)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Commit messages

`type(scope): short description` — e.g. `feat(registry): add agent heartbeat endpoint`, `fix(events): reject unknown event types with hint`, `docs(adr): record provider interface decision`.

## Good first issues

Look for the `good-first-issue` label. Draft write-ups live in
`docs/good-first-issues/` (title, acceptance criteria, hints, effort estimate);
the maintainer publishes them as real issues when ready. Use the bug report /
feature request templates in `.github/ISSUE_TEMPLATE/` when filing new ones.
The example client in `examples/` is a friendly place to start.

## Security issues

Do NOT open public issues for vulnerabilities — see `SECURITY.md`.
