# Vision — Shamar

**Shamar** — Mission control for humans, agents, models, tools, and autonomous work. Open-source infrastructure for managing AI workforces.

**Name.** Shamar (Hebrew שמר — "to keep, guard, watch over"). Selected 2026-09-23 after a three-round naming screen (see `docs/naming-screen-round3-shamar.md`); pending Antonio's final sign-off. "AgentOS" was only ever a temporary working-directory name, never the product name. No logos, brand assets, or domains created yet.

## The Problem

Organizations are accumulating AI agents faster than they can track them. Some come from OpenAI, Anthropic, or Gemini. Some run on local open-source models through Ollama. Some arrive inside business applications or third-party agent platforms. Some are built internally.

No one can answer the basic operational questions:

- What AI agents do we have?
- What does each one do, and who owns it?
- What systems can it access, and with what permissions?
- What did it do, and what is it doing right now?
- What did it cost, and what value did it create?
- Did anything fail or violate policy?

## The Vision

**Mission Control for an organization's AI workforce.**

Shamar is an open-source control plane that manages, observes, governs, connects, and operates agents created across many ecosystems. It is not another agent framework — there are enough of those. It is the layer *around* the agents: the registry, the identity system, the telemetry store, the budget guardrails, the org chart.

Think: Kubernetes for AI workers, Datadog for agents, an HRIS for digital workers. But the first versions are dramatically simpler than those analogies.

## Principles

1. **Provider-neutral.** Agents should not be coupled to one LLM company. BYOK, official OAuth where it exists, local models (Ollama first), and OpenAI-compatible endpoints.
2. **Local-first, zero-cost.** `git clone` + `docker compose up` should give a meaningful system with SQLite, no cloud bill, no model API credits required.
3. **Open source that is genuinely useful.** The community edition is the product; we do not cripple it. Commercial value later comes from hosting, enterprise features, and services.
4. **Human-readable operations.** Permissions, budgets, and activity must make sense to non-technical managers, not just developers.
5. **Security from day one.** Least privilege, secret isolation, auditable actions, safe logging defaults. Security is not a later feature.
6. **Evidence over hype.** No placeholders standing as real data. No fabricated statistics in our own copy.

## The North Star

Any organization using AI agents can connect them to one platform and understand: who each agent is, what it does, why it exists, who owns it, what it can access, what it is doing, what it has done, what it costs, what value it created, what risks it introduces, whether it is healthy, and whether it should continue operating.

## What Success Looks Like Early

A stranger clones the repo, runs it locally for free, registers an agent, submits activity from a script, watches it appear on the dashboard, connects a local Ollama model, inspects the agent, understands the architecture, and could contribute without talking to us.
