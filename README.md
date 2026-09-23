# Shamar

> **Shamar** (Hebrew שמר — "to keep, guard, watch over") — Mission control for humans, agents, models, tools, and autonomous work. Open-source infrastructure for managing AI workforces. Name selected 2026-09-23 (see `docs/naming-screen-round3-shamar.md`); "AgentOS" was only ever the temporary working-directory name.

**Mission Control for an organization's AI workforce.** An open-source control plane to register, observe, govern, and operate AI agents — no matter which provider, framework, or model they use.

**The 60-second version:** organizations are accumulating AI agents (OpenAI, Anthropic, local Ollama models, third-party platforms, internal builds) with no single place to answer *"what agents do we have, what are they doing, what do they cost, and can they be trusted?"* Shamar is that place: an agent registry, an event/activity log, provider connections, budgets, and a dashboard — provider-neutral, local-first, and free to run.

## Quickstart

```bash
git clone <repo-url> && cd <repo>
cp .env.example .env
docker compose up
```

Then open:

- Dashboard: http://localhost:3000
- API: http://localhost:4000/api/dashboard/summary

Register your first agent and send events with the example client:

```bash
cd examples && node register-and-report.js
```

Watch the agent and its activity appear on the dashboard. No cloud account, no API credits, no paid model needed.

Want a pre-populated demo workforce? Seed 4 demo agents with two days of realistic activity:

```bash
SHAMAR_API_KEY=<your-dev-key> node scripts/seed-demo.js
```

The seed script is idempotent (reuses agents by name) and leaves a fresh round of recent events each run so the dashboard's activity view stays alive.

## What works today (Phase 0/1 skeleton)

- Agent Registry: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`
- Heartbeats: `POST /api/agents/:id/heartbeat`
- Event ingestion: `POST /api/events` (validated, append-only)
- Dashboard summary: `GET /api/dashboard/summary`
- Minimal web dashboard (total agents, active agents, recent activity)
- Example client script demonstrating register → heartbeat → events

## Repo layout

```
/apps/api        REST API (Node + TypeScript)
/apps/web        Dashboard (Next.js)
/packages/types  Shared TS types: Agent, AgentEvent, Provider
/packages/core   Registry domain logic (planned)
/packages/providers  Provider adapters — Ollama first (planned)
/packages/telemetry   Event schema + cost computation (planned)
/packages/sdk    TypeScript SDK — register/heartbeat/event helpers (zero deps)
/docs            Vision, roadmap, architecture, ADRs, competitive landscape
/examples        Sample clients
```

## Docs

- [VISION.md](VISION.md) — the problem, principles, north star
- [ROADMAP.md](ROADMAP.md) — phased plan from MVP to org view
- [ARCHITECTURE.md](ARCHITECTURE.md) — modular monolith, data model, API
- [docs/adr/](docs/adr/) — architecture decision records
- [docs/competitive-landscape.md](docs/competitive-landscape.md) — what's out there, gaps we exploit
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md)
- [CONTRIBUTORS.md](CONTRIBUTORS.md) — who builds and maintains Shamar

## Principles

- **Zero-cost local operation.** SQLite by default; Ollama for free local models. No mandatory cloud.
- **Provider-neutral.** BYOK, official OAuth where offered, local models, OpenAI-compatible endpoints.
- **Security from day one.** Secrets in env only, API keys hashed, no prompt/response bodies logged by default.
- **Evidence over hype.** Unknown costs are recorded as unknown — never guessed.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Small, tested, documented PRs welcome. See [CONTRIBUTORS.md](CONTRIBUTORS.md) for who is credited.

## License

Apache 2.0 — see [LICENSE](LICENSE). License approved by Antonio 2026-09-23; tradeoff analysis in [docs/license-strategy.md](docs/license-strategy.md).
