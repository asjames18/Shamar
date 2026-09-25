# ADR-0006: Autonomy-level policy rules (L0–L5) with server-side enforcement

**Status:** accepted 2026-09-23
**Context:** `autonomy_level` (0–5) has been stored and validated on agents since Phase 1,
but it was a label with no teeth — an L0 "monitored only" agent could invoke models through
the control plane exactly like an L5 supervisor. Phase 4 governance needs the level to
mean something enforceable at the only place Shamar actually gates behavior:
`POST /api/providers/:id/invoke`, plus the approval workflow from ADR scope (human-in-the-loop).

**Decision:** every autonomy level gets defined, server-enforced semantics. The server fails
closed on every gate (blocked actions emit a `policy.blocked` audit event, same trail as the
budget gate from the 20:30 cycle).

| Level | Name | Invoke rule | Notes |
|---|---|---|---|
| L0 | Monitored | **Always blocked.** The agent is observed through Shamar, never acts through it. | 403 + `policy.blocked` (reason `autonomy_l0`). |
| L1 | Supervised | **Blocked unless a human granted an approval for the agent inside the trailing 24h.** | Grant window, not per-action: the approval titles what is permitted; the 24h window bounds it. 403 + `policy.blocked` (reason `autonomy_l1_approval_required`) otherwise. Response hints to `POST /api/approvals`. |
| L2 | Assisted | **Allowed, but `max_tokens` is clamped server-side to 1024** when the caller asks for more. | A guardrail for semi-supervised agents: shorter, cheaper generations. The effective value is returned so callers see the clamp. |
| L3 | Standard | Allowed. | Default level for new agents. |
| L4 | Trusted | Allowed. | Same invoke rights as L3 today; the distinction lives in approvals (a human may choose to auto-trust L4 requests — not automated in v0.1). |
| L5 | Supervisor | Allowed. **May grant/deny approval requests for agents that list it as `supervisor_agent_id`.** | Decisions land via `decided_by_agent_id` (see below). |

**Cross-cutting rules:**

1. **Budget gate still applies to every level.** Budgets are hard money caps (20:30 cycle); autonomy never
   overrides a `budget.exceeded` block. Autonomy gates run *before* the budget gate in the invoke path.
2. **L5 supervisor decisions.** `POST /api/approvals/:id/grant|deny` accepts `decided_by_agent_id` as an
   alternative to `decided_by` (exactly one required). The referenced agent must exist, have
   `autonomy_level === 5`, and the request's agent must have `supervisor_agent_id` equal to it —
   otherwise 400, fail closed. `ApprovalRequest.decided_by` records `agent:<id>` and the audit event's
   actor is `agent` (not `human`), so the trail stays truthful about who decided.
3. **No new tables.** L1's grant window reads the existing `approvals` table (`status='granted'`,
   `decided_at` inside 24h). No schema migration.
4. **Prompt/response bodies remain unstored** (ADR-0004 standing rule); `policy.blocked` events carry
   only the action, reason, and level — never secrets.

**Consequences:**

- L0 agents are now genuinely read-only observers — this is the safe default for agents under review.
- L1 gives teams a real human-in-the-loop loop: request → grant → a day of supervised operation.
- L2's clamp is a soft guardrail, not a block — it limits blast radius without stopping work.
- The dashboard shows the level as a labeled badge (Monitored / Supervised / Assisted / Standard /
  Trusted / Supervisor) with a one-line policy description, so the semantics are visible where the
  level is set (UI/UX track).
- Future: per-department budgets, L4 auto-trust policies, approval scopes/expiry (v0.2+).
