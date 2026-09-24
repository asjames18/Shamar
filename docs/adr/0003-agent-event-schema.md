# ADR-0003: Agent & Event Schema

**Status:** Accepted — rule 3 superseded by ADR-0005 (2026-09-23)
**Date:** 2026-09-23

> **Amendment (2026-09-23):** rule 3 ("cost_usd computed server-side; clients may not assert cost") is superseded by **ADR-0005**. The server never estimates costs; `cost_usd` is recorded only when asserted by a reporter — server-measured via invoke paths (real adapter usage, or 0 for local inference) or self-reported by clients via public ingest (validated: finite, non-negative). The rest of this ADR stands.

## Context

Everything in the control plane hangs off two concepts: the **Agent** (the digital worker's identity/registry record) and the **AgentEvent** (append-only log of what happened). The schema must be rich enough to be useful on day one, but not so large it calcifies before we learn from users.

## Decision

### Agent (registry record)

`id` (uuid), `name`, `description`, `department`, `owner` (human), `supervisor_agent_id` (nullable, for agent→agent hierarchy), `provider` (provider id), `model`, `status` (`active`|`idle`|`paused`|`retired`|`error`), `tools[]`, `permissions[]`, `budget_monthly_usd` (nullable), `autonomy_level` (0–5, see charter §18), `last_heartbeat_at`, `created_at`, `updated_at`, `metadata` (JSON, escape hatch).

Deliberately excluded for v0.1: cost rollups (derived from events), org-chart position (derived from department/supervisor), approval policies (Phase 4).

### AgentEvent (append-only)

`id` (uuid), `agent_id`, `type` (dot-namespaced string, e.g. `agent.started`, `task.created`, `task.completed`, `task.failed`, `model.called`, `tool.called`, `tool.failed`, `agent.delegated`, `approval.requested|granted|denied`, `policy.blocked`, `budget.warning|exceeded`, `agent.heartbeat`, `security.alert`), `occurred_at`, `actor` (`agent`|`human`|`system`), `summary` (human-readable one-liner), `data` (JSON payload), `tokens_in`, `tokens_out`, `cost_usd` (nullable — null means unknown, never 0-guessed), `duration_ms`.

### Rules

1. Events are **immutable** — no updates or deletes via API (retention/compaction is an explicit future admin operation).
2. `type` is validated against a registry of known types; unknown types are rejected (fail closed) with a hint to the docs.
3. `cost_usd` is computed server-side at ingest from provider pricing tables; clients may not assert their own cost.
4. Prompt/response bodies are **not stored by default**; only metadata. Body capture is an explicit opt-in per agent for privacy-sensitive orgs.

## Consequences

- **Good:** small, learnable surface; the event log doubles as the audit trail (charter §15).
- **Good:** null-cost semantics prevent fabricated spend numbers (ties to the project's evidence-over-hype principle).
- **Bad:** unknown-type rejection can annoy early integrators → mitigate with clear error messages and a documented process for proposing new types.

## Notes

Canonical TypeScript definitions live in `packages/types` and are the single source of truth; docs and validation import from there.
