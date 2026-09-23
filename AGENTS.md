# AGENTS.md — Shamar

**Shamar** (שמר — "to keep, guard, watch over") is open-source mission control for AI workforces: agent registry, provider registry, event log, dashboard. Apache 2.0. Provider-neutral, local-first, zero-budget friendly.

**Start here, in this order:** `README.md` (60-second pitch) → `VISION.md` → `ARCHITECTURE.md` → `docs/adr/` (the *why* behind design decisions) → `ROADMAP.md` (what's done, what's next).

## Layout

```
apps/api          REST API (Node + TypeScript, zero runtime dependencies). Agents, events,
                  providers, dashboard summary. SQLite via node:sqlite (default, zero-config).
apps/web          Dashboard UI (static; served by nginx in Docker).
packages/types    Shared types: Agent, AgentEvent, Provider, ProviderAdapter, event types.
packages/providers Provider adapters behind the ProviderAdapter interface (ADR-0004).
                  Ollama implemented; others throw honest 501s until built.
packages/sdk      TypeScript SDK for external agents.
packages/core, packages/telemetry
                  Reserved for future extraction; currently empty.
scripts/seed-demo.js   Seeds demo data via the SDK.
examples/register-and-report.js
                  Zero-dependency example client: register → heartbeat → events.
docs/adr/         Architecture Decision Records — read before changing core design.
docs/autonomous-log.md
                  Running log of work cycles. READ THE TAIL BEFORE STARTING WORK.
docs/good-first-issues/
                  Scoped starter tasks (title, context, acceptance criteria, hints, effort).
.github/workflows/ci.yml
                  CI: lint → typecheck → test → build → secret scan.
```

The public landing + demo site is a **separate static Cloudflare Worker** (canned sample data, no backend) — its source lives outside this repo. The in-repo dashboard is `apps/web`.

## Commands (verified 2026-09-23)

```bash
npm install              # install (Node >= 22)
npm run dev:api          # run the API directly (apps/api, tsx watch)

npm run lint             # eslint, zero warnings allowed
npm run typecheck        # tsc project references
npm test                 # builds, then runs node --test (API + SDK + providers)
npm run build            # production build

cp .env.example .env
docker compose up        # full stack: api (4000) + web (3000)
```

API auth: `AGENTOS_DEV_API_KEY` from `.env` (server stores only a scrypt hash). Database: SQLite at `SQLITE_PATH` by default; set `DATABASE_URL` for Postgres. `data/` is gitignored — never commit database files.

**Every command you document must be one you actually ran.** If `docker compose up` can't run in your environment, say so instead of claiming it works.

## Working conventions

- **One meaningful unit of work per change.** Small, tested, documented beats big.
- **Checks must pass before merge:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — same as CI.
- **Conventional commits:** `type(scope): short description` — e.g. `feat(registry): add agent heartbeat endpoint`, `fix(events): reject unknown event types with hint`, `docs(adr): record provider interface decision`.
- **ADRs for architecture decisions.** If you change core design (storage, event schema, provider interface, auth), write `docs/adr/NNNN-topic.md` first.
- **Evidence over hype.** Never commit placeholder numbers as real data; unknown costs stay `null`. Never estimate, never guess.
- **Update `ROADMAP.md`** when you complete or re-scope a milestone. It is the shared source of truth for project status.

## Non-negotiables

- **No secrets in git. Ever.** API keys, tokens, private keys stay in `.env`. CI scans for leaked secrets and fails the build.
- **Zero-cost local operation must keep working.** Anything requiring paid infra needs a free local path too.
- **Provider-neutral.** Provider specifics live in `packages/providers` adapters. No hard dependency on one LLM company in core.
- **Documented provider APIs only.** No scraping, no session automation, no undocumented auth workarounds.
- **Don't log sensitive data by default.** Prompt/response bodies are never persisted (see `apps/api` event handling).
- **Security issues → `SECURITY.md`,** never public issues.

## Multi-agent coordination (read this — two agents work here)

Duplicated work is the failure mode. Follow this protocol:

1. **Orient before you start.** Read the tail of `docs/autonomous-log.md`, `git log --oneline -10`, `ROADMAP.md` status, and `docs/good-first-issues/` (check the README there for claimed tasks).
2. **Claim work before writing code.** Append an entry to `docs/autonomous-log.md`:
   `## <date> — IN PROGRESS: <one-line task> (agent: <your name/handle>)`
   Your completion entry at the end closes the claim.
3. **If someone already claimed what you wanted,** pick something else. If you must collaborate on it, say so in the log — don't silently double-build.
4. **Keep claims small and short-lived.** One task at a time. A claim older than a day with no completion entry is stale — note it in the log before taking over.
5. **Make your work visible in git.** Small commits with conventional messages; push or open a PR promptly so the other agent sees it in `git log`.
6. **ROADMAP.md stays current.** If you finish, re-scope, or abandon something, update it in the same change.

## Git rules

- Land work via **pull request against `main`** so CI runs and the other agent can review. Trivial doc/log-only updates may commit directly.
- **Never force-push `main`. Never rewrite history on `main`.** If a bad commit lands, revert it with a new commit.
- Keep secrets, database files (`data/`), and `node_modules/` out of git — `.gitignore` covers them; don't override it.

## When in doubt

Ask in the log, pick the smaller change, and leave the repo buildable. A "no change needed, investigated X" log entry beats an unverified change.
