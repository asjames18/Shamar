# ADR-0002: SQLite First, Postgres Later

**Status:** Accepted
**Date:** 2026-09-23

## Context

Zero-budget local operation is a hard requirement: `git clone` + `docker compose up` must yield a working system with no cloud bill. We also need a credible path to Postgres for teams that outgrow a single file.

## Decision

- **Default:** SQLite (file-based, zero config, zero cost). All schema migrations written against a minimal SQL subset that works on both engines.
- **Abstraction:** a small `Storage` interface in `packages/core` (`getAgent`, `saveAgent`, `appendEvent`, `queryEvents`, …). The API depends on the interface, not on a driver.
- **Postgres:** supported via `DATABASE_URL` env var; when set, the Postgres implementation is used. Migrations are plain versioned SQL files runnable on both.

## Consequences

- **Good:** local dev and demos need nothing but the repo; SQLite file is trivially backed up.
- **Good:** no ORM lock-in; the query surface is small enough to hand-write safely.
- **Bad:** hand-rolled abstraction can drift (two implementations to test) → mitigate by keeping the interface narrow and testing both in CI (Postgres via service container).
- **Constraint:** avoid SQLite-only or Postgres-only SQL in migrations; CI lints for it.

## Notes

Evaluate a query builder (e.g. Kysely) only if the hand-rolled surface grows past ~20 methods.
