# ADR-0008: Human hours saved — explicit estimates only

**Status:** Accepted  
**Date:** 2026-09-25  
**Related:** ADR-0003 (event schema), ADR-0005 (cost reporting semantics)

## Context

Phase 6 analytics already roll up known `cost_usd` with the same honesty rule as the rest of the product: unknown stays unknown — never invent a number. The roadmap also asks for a first pass at **value** metrics (tasks completed, human hours saved). The failure mode to avoid is inventing a default minutes-per-task or converting hours into dollar ROI.

## Decision

1. **Optional explicit field only.** Clients may put `human_minutes_saved` (finite, non-negative number) on the `data` object of a `task.completed` event. Absent or `null` means unknown. Invalid values (negative, NaN, non-finite, wrong type) are rejected with 400 — same posture as `cost_usd` (ADR-0005).
2. **Analytics `value` block** on `GET /api/analytics/summary`:
   - `tasks_completed` — count of `task.completed` in the window
   - `human_hours_saved` — sum of explicit `human_minutes_saved` / 60, or **`null` when `events_with_hours_estimate` is 0**
   - `events_with_hours_estimate` — count of `task.completed` events that carried a valid estimate
   - `estimated: true` — always; these are self-reported estimates, not measured wall-clock savings
3. **UI honesty.** When there are zero observations, render `—` / unknown — never `0.0h` pretending to be measured. Known zero (observations present, sum 0) may show `0.0h`.
4. **No dollar ROI.** Do not multiply hours by a wage or invent ROI dollars in API or UI.

## Consequences

- Good: value metrics follow the same evidence-over-hype rule as cost.
- Good: no schema migration — field lives in event `data` JSON; SQLite `json_extract` aggregates it.
- Bad: under-/over-reported minutes are possible (same class of risk as self-reported cost). Accepted for v0.1; verification of external estimates is out of scope.
- Unchanged: cost semantics (ADR-0005); null cost still means unknown.

## Notes

SDK `taskCompleted({ humanMinutesSaved })` maps to `data.human_minutes_saved`. Agents/config may also set the field directly on ingest.