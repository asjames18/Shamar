# ADR-0007: Per-department budget pools

**Status:** accepted 2026-09-23
**Context:** Phase 4 governance has per-agent monthly budgets (20:30 cycle) with warning
(80%) / exceeded (100%) alerts and an invoke gate. Teams also need a shared pool: the
"Research" department's ten agents draw from one pot, not ten independent caps. The
remaining Phase 4 item after the 21:45 cycle was per-department budgets.

**Decision:** a department is a named, shared monthly budget pool.

- **Storage:** `department_budgets` table — `name` (PK), `budget_monthly_usd`, plus
  `warning_fired_month` / `exceeded_fired_month` ('YYYY-MM') for edge-trigger dedup.
  Set via `PUT /api/departments/:name/budget` (`budget_monthly_usd: number | null`;
  null clears, a cleared department keeps its row out of the table). Validation is
  fail-closed: non-finite or negative caps are 400-rejected. No migration —
  `CREATE TABLE IF NOT EXISTS` alongside the other tables.
- **Spend:** sum of `cost_usd` this calendar month across events joined to agents whose
  `department` matches — only real reported costs (unknown stays out, never estimated,
  ADR-0003/ADR-0005). A $0 cap means "spend nothing": any pool with a cap is exceeded
  immediately (same rule as per-agent budgets).
- **Alerts:** warning at 80%, exceeded at 100%, each at most once per calendar month
  (tracked in the table, not in the event trail, because there is no department row to
  anchor a query on). Events are agent-scoped, so a department alert is recorded on the
  **triggering agent's** timeline with `data.department` set and `data.department_budget:
  true`. The alert types are **`department.budget.warning` / `department.budget.exceeded`** —
  deliberately distinct from the per-agent `budget.warning` / `budget.exceeded` types,
  so the two pools' dedup logic can never cross-contaminate (a department alert on an
  agent's timeline must not suppress that agent's own personal-budget alert).
- **Enforcement:** the invoke gate order is autonomy → per-agent budget → department
  budget. When a department's pool is exceeded, any member agent's invoke is 403 with
  `reason: department_budget_exceeded` and a `policy.blocked` audit event — checked
  before any provider call, so no cost can be incurred while throttled. Autonomy still
  never overrides a hard money cap.
- **Reads:** `GET /api/departments/:name/budget` (404 when no cap is set),
  `GET /api/departments` (every department derived from agents plus any with a stored
  cap, with agent counts and meters), and `department_budget` on the agent detail
  payload so a throttled agent can see the pool blocking it.
- **Alert attribution:** a department alert lands on the triggering agent's timeline —
  the alternative (broadcast to every member) would be noisy and duplicate dedup
  state; the dashboard's department card is the shared surface.

**Alternatives considered:**

- *Per-agent-only budgets with a dashboard sum:* cheaper to build, but no shared
  enforcement — one spendy agent can't be throttled by the pool, which is the whole
  point of a department cap.
- *Reusing `budget.warning`/`budget.exceeded` for department alerts:* rejected — the
  per-agent `checkBudget` dedup query matches by (agent_id, type, month), and a
  department alert on the triggering agent's timeline would suppress that agent's own
  personal-budget alert. Distinct types keep the semantics truthful.
- *A synthetic "department agent" row to anchor alerts:* rejected — it would pollute
  the agent registry, heartbeat semantics, and dashboard counts with a fake agent.

**Consequences:**

- Departments with no cap behave exactly as before; the feature is purely additive.
- Renaming an agent's `department` moves its future spend to the new pool; past events
  stay with the old department (spend is joined at query time, so moving an agent
  mid-month changes both pools' current-month spend — documented here, not silently).
- The dashboard's department card is the UI surface (meters + set/clear); agent detail
  shows the pool meter so throttled agents can see why invokes fail.
