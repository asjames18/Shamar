---
name: Bug report
about: Something isn't working as documented
title: "fix: "
labels: ["bug"]
---

## What happened

A clear description of the bug — what you expected vs. what actually happened.

## Steps to reproduce

1. Start the API (`AGENTOS_DEV_API_KEY=dev npm run dev --workspace @shamar/api` or `docker compose up`)
2. ...
3. ...

## Expected behavior

## Actual behavior

Include the HTTP status, response body, and any server log output. **Do not paste API keys, tokens, or secrets — redact them.**

## Environment

- Shamar commit: (output of `git rev-parse --short HEAD`)
- Node version: (`node --version`)
- How you ran it: (docker compose / npm dev / built API)
- OS:

## Relevant code

Link to the file(s) you think are involved, e.g. `apps/api/src/server.ts`, and the exact error message.
