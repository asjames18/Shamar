# Architecture — Shamar

See also: `docs/adr/` for the decisions behind this design.

## Overview

Shamar is a **modular monolith** (ADR-0001): one deployable backend, one web frontend, shared TypeScript packages, with clear module boundaries so pieces can be extracted later if real scale demands it.

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                    │
│  Dashboard · Agent Registry UI · Agent Detail · Activity feed │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST / JSON
┌──────────────────────────▼──────────────────────────────────┐
│                        apps/api (Node/TS)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │ agents   │  │ events   │  │ providers │  │ telemetry  │  │
│  │ registry │  │ ingest   │  │ registry  │  │ + cost     │  │
│  └──────────┘  └──────────┘  └───────────┘  └────────────┘  │
│                    ┌──────────────────┐                      │
│                    │  storage layer   │  (ADR-0002)          │
│                    │ SQLite ⇄ Postgres│                      │
│                    └──────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
         ▲                                   ▲
         │ SDK / REST                        │ Provider APIs
┌────────┴──────────┐              ┌──────────┴──────────┐
│ External agents    │              │ Ollama · OpenAI   │
│ (any framework)    │              │ Anthropic · etc.  │
└───────────────────┘              └───────────────────┘
```

## Repository Layout

```
/apps/web        Next.js dashboard (starts minimal; plain HTML placeholder in skeleton)
/apps/api        REST API (Node + TypeScript; Fastify)
/packages/types  Shared TypeScript types: Agent, AgentEvent, Provider (ADR-0003/0004)
/packages/core   Agent registry domain logic, validation, budgets
/packages/providers  ProviderAdapter implementations (Ollama, OpenAI, Anthropic, Gemini, OpenRouter)
/packages/telemetry   Event schema, cost computation, usage aggregation
/packages/sdk    TypeScript SDK: register, heartbeat, event, task helpers
/docs            Vision-adjacent docs, competitive landscape, autonomous log
/docs/adr        Architecture Decision Records
/examples        Sample clients that talk to the API
/scripts         Dev utilities
```

## Data Model (v0.1)

**Agent** — see ADR-0003 and `packages/types`. Core fields: `id`, `name`, `description`, `department`, `owner`, `supervisor_agent_id`, `provider`, `model`, `status` (active/idle/paused/retired/error), `tools[]`, `permissions[]`, `budget_monthly_usd`, `autonomy_level` (0–5), `last_heartbeat_at`, timestamps, `metadata`.

**AgentEvent** — append-only: `id`, `agent_id`, `type` (e.g. `agent.started`, `task.completed`, `model.called`, `tool.called`, `policy.blocked`), `occurred_at`, `actor`, `summary`, `data` (JSON), `cost_usd`, `tokens_in/out`, `duration_ms`.

**Provider** — `id`, `kind` (ollama/openai/anthropic/gemini/openrouter/compatible), `name`, `auth` (secret reference only — never the raw key in responses), `base_url`, `status`, `last_health_check`.

## API Surface (v0.1)

- `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`
- `POST /api/agents/:id/heartbeat`
- `POST /api/events` — ingest one event or a batch
- `GET /api/events?agent_id=…&type=…&limit=…`
- `GET/POST /api/providers`, `POST /api/providers/:id/validate`
- `GET /api/dashboard/summary` — totals, active count, recent events

Auth v0.1: API keys (server-issued, hashed at rest). Local dev default key documented in `.env.example`. No auth theater — keys are real, checked on every write.

## Provider Abstraction (ADR-0004)

```ts
interface ProviderAdapter {
  kind: string;
  listModels(): Promise<ModelInfo[]>;
  validateCredentials(): Promise<HealthResult>;
  invokeModel(req: InvokeRequest): Promise<InvokeResult>; // tokens, latency
  estimateCost(usage: TokenUsage): number | null;        // null = unknown, never guess
  healthCheck(): Promise<HealthResult>;
}
```

Adapters live in `packages/providers`; the API never imports provider SDKs directly.

## Event Flow

External agent/SDK → `POST /api/events` → validation (schema + API key + agent exists) → append to event store → update agent rollups (last activity, task counters) → dashboard reads via query endpoints. Cost computed at ingest from provider pricing tables when documented; local models record $0.

## Security Posture (charter §24)

- Secrets live in env/secret store; API never returns credential material.
- API keys hashed (scrypt) at rest; per-key scopes (ingest vs admin).
- Input validation on all endpoints (zod); output redaction of prompt/response bodies by default — bodies opt-in per org.
- SQLite file permissions 0600; Postgres via connection string in env.
- Dependency scanning in CI; secure headers; no secrets in frontend bundles or git.

## Non-Goals (v0.1)

Multi-tenancy, SSO, real-time websockets (polling is fine), workflow orchestration, prompt playgrounds, marketplace. Keep the monolith boring and working.
