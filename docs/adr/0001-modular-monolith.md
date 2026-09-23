# ADR-0001: Modular Monolith

**Status:** Accepted
**Date:** 2026-09-23

## Context

The project needs a backend architecture that a small team and outside contributors can understand, run locally for free, and extend — without premature distributed-systems complexity.

Options considered: (a) microservices from day one, (b) serverless functions, (c) modular monolith.

## Decision

Build a **modular monolith**: one Node/TypeScript API process, one web frontend, shared packages (`types`, `core`, `providers`, `telemetry`, `sdk`) with enforced module boundaries (packages never import from `apps/`, providers never imported directly by route handlers — only through the adapter registry).

## Consequences

- **Good:** one deployable, one local dev command, easy debugging, zero-cost local run, simple CI.
- **Good:** module boundaries let us extract services later if real load demands it.
- **Bad:** a single process is a single failure domain; acceptable for v0.1–v1.
- **Risk:** boundaries erode without enforcement → mitigate with an eslint import rule and ADR review in PRs.

## Notes

Revisit only when we have measured load that a monolith cannot handle — not before.
