# Shamar

[![CI](https://github.com/asjames18/Shamar/actions/workflows/ci.yml/badge.svg)](https://github.com/asjames18/Shamar/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> **Shamar** (שמר — Hebrew for "to keep, guard, watch over") is mission control for your AI workforce: register every agent, see everything they do, know what they cost. Provider-neutral, local-first, free to run.

🚀 **Try the live demo — no install:** https://shamar-site.asjames18.workers.dev/demo

## The problem

Organizations are accumulating AI agents — OpenAI and Anthropic assistants, local Ollama models, third-party platforms, internal builds — with no single place to answer *"what agents do we have, what are they doing, what do they cost, and can they be trusted?"* Agents get created in Slack threads and scripts, run with personal API keys, and nobody can audit them.

## What Shamar is

An open-source control plane for AI agents:

- **Agent registry** — identity, owner, model, provider, tools, and budget for every agent.
- **Event log** — append-only record of what agents actually do (`agent.started`, `model.called`, `task.completed`…).
- **Provider connections** — local Ollama for free, plus OpenAI/Anthropic/Gemini BYOK. Documented APIs only — no scraping, no session hacks.
- **Dashboard** — total/active agents, recent activity, usage and cost.
- **REST API + SDK** — external agents register, heartbeat, and report; any framework can plug in.

**Principles:** zero-cost local operation (SQLite, Ollama). Provider-neutral core. Security from day one (secrets in env only, keys hashed, prompt/response bodies never stored). Evidence over hype — unknown costs stay `null`, never guessed.

## Status

Phase 0 (research + foundation) ✅ · Phase 1 vertical slice ✅ · Phase 2 Ollama adapter ✅ against a mock daemon (one real-daemon run still pending). Full picture: [ROADMAP.md](ROADMAP.md) · [docs/STATUS.md](docs/STATUS.md).

## Quickstart — 5 minutes

Prerequisites: Node ≥ 22, git, npm. (Docker is optional — the compose path is listed but untested in some environments; see CONTRIBUTING.md.)

```bash
git clone https://github.com/asjames18/Shamar.git && cd Shamar
npm install
cp .env.example .env      # local-dev key + SQLite path; never commit .env
npm run dev:api           # build + start the API at http://localhost:4000
```

With the API running, seed a demo workforce and check it:

```bash
set -a && . ./.env && set +a    # load the local-dev key
node scripts/seed-demo.js       # 4 demo agents + ~2 days of activity; idempotent by name
curl -H "x-api-key: $AGENTOS_DEV_API_KEY" http://localhost:4000/api/dashboard/summary
```

Register your own agent and send events with the zero-dependency example client:

```bash
cd examples && node register-and-report.js
```

Prefer Docker? `docker compose up` gives the full stack — API on `:4000`, web dashboard on `:3000`. (The compose path can't be verified in every environment; CONTRIBUTING.md says so explicitly.)

## What works today

- Agent registry: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`, agent detail with usage rollups and activity timeline
- Heartbeats: `POST /api/agents/:id/heartbeat`
- Event ingestion: `POST /api/events` (validated, append-only; single + batch)
- Dashboard summary: `GET /api/dashboard/summary`
- Web dashboard: totals, active agents, recent activity, add-agent form, clickable agent detail view
- Provider model discovery: `GET /api/providers/:id/models` (Ollama installed models)
- Provider health validation: `POST /api/providers/:id/validate` (real reachability check)
- Test invocation: `POST /api/providers/:id/invoke` — prompt → response with real token counts and latency, recorded as a `model.called` event (prompt/response bodies are never stored; local cost is $0 by definition)
- TypeScript SDK (zero runtime deps): `packages/sdk`
- Demo seed script: `scripts/seed-demo.js`

## Repo layout

```
/apps/api        REST API (Node + TypeScript, zero runtime deps) — agents, events, providers, dashboard
/apps/web        Dashboard UI (static HTML + nginx in Docker)
/packages/types  Shared TS types: Agent, AgentEvent, Provider, ProviderAdapter
/packages/providers  Provider adapters — Ollama implemented; cloud adapters planned
/packages/sdk    TypeScript SDK — register/heartbeat/event helpers (zero deps)
/packages/core, /packages/telemetry  Reserved for future extraction; currently empty
/docs            Vision, roadmap, architecture, ADRs, competitive landscape
/examples        Sample clients (zero-dependency Node)
/scripts         Demo seed script
```

## Docs

- [VISION.md](VISION.md) — the problem, principles, north star
- [ROADMAP.md](ROADMAP.md) — phased plan from MVP to org view
- [ARCHITECTURE.md](ARCHITECTURE.md) — modular monolith, data model, API
- [docs/adr/](docs/adr/) — architecture decision records (read before changing core design)
- [docs/competitive-landscape.md](docs/competitive-landscape.md) — what's out there, gaps we exploit
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md)
- [CONTRIBUTORS.md](CONTRIBUTORS.md) — who builds and maintains Shamar

## Contributing

Small, tested, documented PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). New here? Start with a [good-first-issue draft](docs/good-first-issues/).

## License

**Apache 2.0** — see [LICENSE](LICENSE). Tradeoff analysis: [docs/license-strategy.md](docs/license-strategy.md).
