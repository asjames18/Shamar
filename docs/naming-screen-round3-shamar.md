# Naming Screen — Round 3: "Shamar" (solo)

Date: 2026-09-23. Method: same as rounds 1–2 (GitHub, npm, PyPI, domains, AI company/product collisions, USPTO web signals).
Candidate: **Shamar** — Hebrew שמר, "to keep, guard, watch over". Fallback screened: **Shamar HQ**.

## Screening table

| Check | Shamar | Shamar HQ |
|---|---|---|
| GitHub exact-name | **Collision (weak):** `coolsam726/shamar` — active (PR 2026-07-22, docs updated ~40 days ago), Filament-inspired AdonisJS admin panel, 1 star, solo dev. **Unrelated category** (admin panels, not AI/agents/workforce). Other hits are personal repos (file-integrity monitor, ML class projects) — noise. | No collisions surfaced |
| npm | Exact `shamar` package: **check failed** (registry fetch blocked) — unverified. **Confirmed:** `@shamar` scoped namespace is in use by coolsam726/shamar (`@shamar/core`, `@shamar/adonis`, …). Scoped `@shamar/*` packages are **not available** to us. | No collisions surfaced |
| PyPI | `shamar`: **check failed** (client challenge) — unverified | No collisions surfaced |
| Domains | `shamar.com` / `.io` / `.dev`: no availability signal found, no live site at shamar.com in results. `shamar.co.in` = small AI news-aggregator site (Indian dev, unrelated). `shamar.club` dead. `shamar.savannabits.com` = the coolsam726 project's deployment. | No collisions surfaced |
| AI company / product | **None.** No AI company, agent framework, or AI-infra product named Shamar. | None |
| Trademark (USPTO web signals) | **Favorable:** SHAMAR serial 88369600 (software class, mobile-app business) is **DEAD** as of 5/15/2026 — "continued use not filed, un-revivable". No live US software mark. Only live mark is "PROPHET SHAMAR J. BENNETT" (religious services, unrelated class, personal name). | No signals |

## Risk verdict

- **Shamar: MEDIUM.** One real but weak exact-name collision (1-star solo admin-panel project, unrelated category) plus the taken `@shamar` npm scope. No company, no funding, no AI overlap, dead trademark in the software class.
- **Shamar HQ: LOW** (no collisions surfaced anywhere). Clean fallback.

## Namespace costs Antonio should know (before final sign-off)

1. **npm scope:** `@shamar/*` is taken. Our SDK would ship as e.g. `@shamar-ai/sdk` or unscoped names. Solvable, but the prettiest package names are gone.
2. **GitHub:** `github.com/shamar` is a personal user page. The org would be `shamar-ai` or similar.
3. **Search noise:** "Shamar" is a common personal name — exact-name search results will always be noisy (people, ministries, small repos). Mild discoverability tax.
4. **Trademark field is clear:** the only software-class US mark is dead. A future filing path is open (needs real legal review before filing).
5. **Category separation is genuine:** the colliding project builds admin panels, not agent infrastructure. Confusion risk is low, but the name is not uniquely ours in software.

## Decision record

2026-09-23 — Antonio committed to **Shamar (solo)**. Screen returned Medium, not High: no ground for the "do not rename" rule. Decision: **rename in docs** (working dir `~/workspace/agentos/` unchanged — dev agent mid-work, cron references it). Positioning:

> **Shamar** — Mission control for humans, agents, models, tools, and autonomous work.
> Open-source infrastructure for managing AI workforces.

No logos, brand assets, or domains created. Final sign-off on the screen remains with Antonio — see namespace costs above.

## Caveats

- npm/PyPI direct fetches failed technically ("check failed" ≠ clearance).
- Trademark signals are web-search level, not independent USPTO TESS verification — preliminary screen, not legal clearance.
