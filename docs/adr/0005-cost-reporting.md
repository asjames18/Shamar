# ADR-0005: Cost Reporting Semantics (self-reported vs. server-measured)

**Status:** Accepted
**Date:** 2026-09-23
**Supersedes:** ADR-0003 §"Rules" rule 3 ("cost_usd is computed server-side at ingest from provider pricing tables; clients may not assert their own cost")

## Context

ADR-0003 rule 3 assumed provider pricing tables would land in Phase 3 (server computes `cost_usd` at ingest, clients can't assert cost). Two things changed:

1. **Pricing tables were never built, deliberately.** The project's evidence-over-hype principle forbids cost estimation: no provider exposes a reliable pricing endpoint, and guessing rates produces fabricated spend numbers. The null-cost rule stands — unknown costs stay `null`, never estimated (ADR-0003 rules stand everywhere else).
2. **The code drifted from the doc.** `AgentEventInput.cost_usd` is typed "accepted but ignored in v0.1," but `appendEventInternal` stores whatever the client sends (`input.cost_usd ?? null`), and Phase 4 budget accounting (`spendSince`) trusts any non-null stored cost. The lying doc comment had to go one way or the other.

This ADR resolves the mismatch and sets the semantics all Phase 4 governance (budgets, throttling) will lean on.

## Decision

1. **The server never computes or estimates cost.** There is no server-side pricing table and there will be none in v0.1. `cost_usd` is populated only when asserted by a reporter.
2. **Two legitimate reporters:**
   - **Server-measured (invoke path).** `POST /api/providers/:id/invoke` sets `cost_usd` from the adapter's `estimateCost` on the adapter's own reported usage (real token counts from the provider's API), or `0` for local inference (Ollama) — zero provider charge is definitional, not estimated.
   - **Client self-reported (public ingest path).** External agents reporting through `POST /api/events` (or SDK `modelCalled`) may assert their own `cost_usd`. This is **reported** data, not server-verified — e.g. an agent running behind its own provider account knows its real bill. The audit trail is honest about provenance implicitly: ingest-path events carry `actor: agent` and arrive via the public API; invoke-path events are written by the server.
3. **Self-reported costs are validated, not trusted blindly.** A client-asserted `cost_usd` must be a finite, non-negative number (or null/absent). Negative, NaN, or infinite values are rejected with 400. A malicious or buggy client can only inflate *its own* agent's budget meter — budgets are per-agent, so cost fabrication self-throttles; there is no cross-tenant attack surface in v0.1's single-tenant design.
4. **Null still means unknown.** Everything else in ADR-0003 (null-cost semantics, immutable events, no prompt/response storage) is unchanged.

## Consequences

- **Good:** doc, types, and code finally agree. Budgets meter real reported spend from both server-mediated and external agents; external agents' spend is no longer silently dropped or, worse, stored under a lie.
- **Good:** no pricing-table maintenance burden, no estimated numbers anywhere — the audit trail stays evidence-based.
- **Bad:** self-reported costs can be wrong (under-reported spend evades budget throttling). Accepted for v0.1: the control plane observes; verification of external agents' self-reported spend is a future Phase 4 concern, not a v0.1 blocker.
- **Unchanged:** `estimateCost` adapters must return real data or `null` (ADR-0004); `null` never becomes a number server-side.

## Notes

`AgentEventInput.cost_usd` doc comment updated to match. `appendEventInternal` now enforces rule 3 validation (400 on invalid).
