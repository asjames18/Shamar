# AGENT_START — Shamar agent onboarding

Read this first. Then `docs/STATUS.md`, then `AGENTS.md`. Five minutes, then you're oriented the same way as everyone else on this project — Mosheh, Platform, and Antonio all start here.

## What this is

**Shamar** (שמר — "to keep, guard, watch over"): open-source mission control for AI workforces. Agent registry, provider registry, event log, dashboard. Apache 2.0. Provider-neutral, local-first, zero-budget friendly.

- 60-second pitch: `README.md`
- Vision: `VISION.md` · Design: `ARCHITECTURE.md` + `docs/adr/` (read the ADRs before changing core design)

## The docs and what each is for

| Doc | Job |
|---|---|
| `AGENT_START.md` | This file — orient any agent in 5 minutes. |
| `docs/STATUS.md` | **Living snapshot**: what we're doing now, what's next, open PRs, blockers, how to run. Read first, update when state changes. |
| `AGENTS.md` | Working manual: commands, conventions, non-negotiables, coordination protocol, git rules, PR description template. |
| `ROADMAP.md` | Phases with exit criteria. "Where we are" box at the top = done / in progress / next. |
| `docs/autonomous-log.md` | Append-only log, one entry per work cycle. **Claim work here before starting; close the claim when done.** |
| `CONTRIBUTING.md` | Human-contributor guide (what outside contributors see). |

## Identity

You build **as Antonio** (the maintainer). Commits, log entries, docs, and PR descriptions are in his voice, under his name. Don't announce or explain the arrangement; just build that way.

## Coordination (two agents work here)

1. Read `docs/STATUS.md` and the tail of `docs/autonomous-log.md` **before** starting.
2. Claim work with an `IN PROGRESS` log entry before writing code. Use a distinct handle per agent (e.g. `antonio/loop`) so claims can't collide.
3. If it's already claimed, pick something else. Don't silently double-build.
4. Small commits, conventional messages (`type(scope): description`), push or open a PR promptly so the other agent sees it in `git log`.
5. Update `ROADMAP.md` and `docs/STATUS.md` when state changes. **Never force-push `main`.**

## First-session checklist

- [ ] Read this file, `docs/STATUS.md`, `AGENTS.md`.
- [ ] `npm install`, then `npm run lint`, `npm run typecheck`, `npm test` — all green before touching code.
- [ ] Pick up the top "next" item in `docs/STATUS.md`, or the highest-priority unclaimed item in `ROADMAP.md`.
- [ ] Claim it in the log → do it → verify it → log it → update `STATUS.md`.

## PR descriptions

Must stand alone (template in `AGENTS.md`): context, what changed, why, verification, risks. A stranger should understand the PR without asking you anything.
