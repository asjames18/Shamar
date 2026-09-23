# Contributing to Shamar

Small, tested, documented PRs beat big ones. Read `ARCHITECTURE.md` and the ADRs in `docs/adr/` before changing core design.

## Ground rules

- **No secrets in git.** Ever. API keys, tokens, cookies, private keys stay in `.env` (see `.env.example`). PRs containing secrets will be closed.
- **Zero-cost local operation must keep working.** If your change requires paid infra, it needs a free local path too.
- **Provider-neutral.** No hard dependency on one LLM company in core code; provider specifics live in `packages/providers` adapters behind the `ProviderAdapter` interface (ADR-0004).
- **Evidence over hype.** Don't commit placeholder numbers as real data; unknown costs stay `null`.
- **One meaningful unit of work per PR.** Prefer completing one useful thing over starting several.

## Prerequisites

- **Node.js >= 22** (`node --version`). The API uses `node:sqlite`, which ships with Node 22.
- **npm** (ships with Node).
- **git**.
- **Docker** (optional) — only needed if you want to run the full stack (`api` + `web`) via Compose. The API and tests run fine without it.
- No cloud accounts, API credits, or paid models needed for development. Local SQLite + Ollama cover everything.

## Install and run

```bash
git clone https://github.com/asjames18/Shamar.git && cd Shamar
npm install
cp .env.example .env          # local-dev API key + SQLite path; never commit .env
docker compose up             # full stack: api :4000, web :3000
```

Run the API directly (no Docker) during development:

```bash
npm run dev:api               # build + run apps/api against local SQLite (one shot; re-run to pick up changes)
```

The example client and seed script read the API key from the environment — load it from `.env` once per shell:

```bash
set -a && . ./.env && set +a
```

Try the example client against your local API:

```bash
cd examples && node register-and-report.js
```

Seed a demo workforce (4 agents + ~2 days of activity; idempotent by name):

```bash
SHAMAR_API_KEY=<your-dev-key> node scripts/seed-demo.js
```

## How to run the checks

The same checks run in CI (`.github/workflows/ci.yml`). All must pass before merge:

```bash
npm run lint       # eslint, zero warnings allowed
npm run typecheck  # tsc project references
npm test           # builds, then runs node --test (API + SDK + providers)
npm run build      # production build
```

Run all four in that order before opening a PR. `npm test` rebuilds first, so a green test run implies a green build too. `docker compose up` cannot be verified in every environment — if it doesn't run in yours, say so in your PR instead of claiming it works ("every command you document must be one you actually ran").

## How to pick up an issue

1. Read the open issues; look for the `good-first-issue` label. Scoped starter write-ups (title, context, acceptance criteria, hints, effort) live in `docs/good-first-issues/`.
2. Leave a comment saying you're taking it, so two people don't build the same thing.
3. Follow the "Definition of done" below, then open a PR referencing the issue.

Use the bug report / feature request templates in `.github/ISSUE_TEMPLATE/` when filing new issues. **Security vulnerabilities go to `SECURITY.md`** — never open public issues for them.

The example client in `examples/` is a friendly place to start.

## Branch and PR conventions

- **Branch naming:** `<type>/<short-description>` — e.g. `feat/agent-delete-sdk`, `fix/event-limit-sanitization`, `docs/quickstart-commands`.
- **One PR per issue** (or per unit of work); keep PRs small enough to review in one sitting.
- **Conventional commits:** `type(scope): short description` — e.g. `feat(registry): add agent heartbeat endpoint`, `fix(events): reject unknown event types with hint`, `docs(adr): record provider interface decision`. The commit message must read correctly on its own: no "as discussed", no missing context.
- **PR descriptions must stand alone:** context, what changed, why this approach, verification (exact commands run + results), risks/notes. Template in `AGENTS.md` ("PR descriptions that stand alone"). A stranger should understand the PR without asking you anything.

## Code style

- TypeScript, strict-ish config in the workspace tsconfigs. `npm run typecheck` enforces it.
- ESLint with zero warnings tolerated (`--max-warnings=0`) — fix warnings, don't suppress them without a comment explaining why.
- No runtime dependencies unless genuinely needed. The API currently runs with **zero runtime dependencies**; keep it that way — every new dependency is a review discussion, not a default.
- Provider specifics stay in `packages/providers` behind the `ProviderAdapter` interface (ADR-0004). Documented provider APIs only — no scraping, no session automation.
- Don't log sensitive data: prompt/response bodies are never persisted. Event payloads that could contain secrets must be scrubbed at ingestion.
- Append-only event semantics (ADR-0003): events are immutable history. Don't mutate or delete them to fix bugs — fix the reader or issue a correcting event.

## Definition of done

A PR is done when **all** of these hold:

1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` are green (paste the results in the PR description).
2. New behavior has tests; bug fixes include a regression test that fails before the fix.
3. Docs updated where behavior changed (`README.md`, `ARCHITECTURE.md`, or the relevant package docs).
4. No secrets, no `data/` database files, no `node_modules/` committed.
5. Commit message follows the conventional format; PR description follows the standalone template.
6. The zero-cost local path still works (`npm run dev:api` against SQLite, no paid services required).

## The short version

Prereqs (Node 22+) → `npm install` → `cp .env.example .env` → `npm run dev:api` → pick a `good-first-issue` → comment on it → branch `type/short-desc` → small change → four checks green → standalone PR description. Welcome aboard.
