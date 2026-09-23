# License Strategy — DECIDED: Apache 2.0 (approved by Antonio 2026-09-23)

**Decision:** Apache 2.0. `LICENSE` committed 2026-09-23.

## Candidates (evaluated)

| License | Adoption friendliness | Cloud-provider appropriation risk | SaaS-business friendliness |
|---|---|---|---|
| **Apache 2.0** | High; enterprise-safe, patent grant | Higher — a cloud vendor can host it unchanged | Good; standard for open-core |
| **MIT** | Highest; simplest | Highest — same as Apache, minus patent grant | Good |
| **AGPLv3** | Lower; scares some enterprises | Low — network use triggers source sharing | Strong protection, weaker adoption |

## Considerations

- **Community adoption:** permissive (MIT/Apache-2.0) maximizes contributors and local/homelab use — aligned with the zero-cost, local-first principle.
- **Managed-hosting business:** AGPL deters cloud appropriation but also deters enterprise adoption; Apache-2.0 is the common open-core choice (e.g. widely used by infra startups) but offers no appropriation defense.
- **Enterprise buyers** (universities, government — key local-first audiences) generally prefer Apache-2.0 over AGPL.
- **Patent grant:** Apache-2.0's explicit patent grant is meaningful for an AI-infra project.

## Current lean

**Apache 2.0**, pending Antonio's review — best balance of adoption, enterprise acceptance, and future open-core business. Documented here so the decision is explicit, not accidental.

## Action

- [x] Antonio reviewed and approved license choice (2026-09-23) — Apache 2.0
- [x] `LICENSE` committed
- [ ] Add license headers to source files per Apache conventions (Phase 1 hygiene)
- [ ] Revisit if a cloud provider ships a competing hosted fork
