# Security Policy

Security is foundational to this project, not a later feature.

## Reporting a vulnerability

**Do not open a public GitHub issue.** Email the maintainer privately (address to be published once the repo is public). Include:

- description and impact
- steps to reproduce
- any suggested fix

We will acknowledge within 72 hours and coordinate disclosure.

## Security principles (enforced in review)

- Least privilege; explicit permission scopes
- Secrets in env/secret stores only — never in git, logs, issues, docs, test fixtures, or client-side bundles
- API keys hashed at rest (scrypt); credential material never returned by the API
- Input validation on all endpoints; safe logging defaults (no prompt/response bodies logged unless explicitly opted in)
- Dependency scanning in CI; secure headers

## Supported versions

Only the latest `main` is supported during the pre-1.0 phase.
