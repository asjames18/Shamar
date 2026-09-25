# Example clients

Zero-dependency sample clients that register an agent, send a heartbeat, and
submit `agent.started` / `model.called` / `task.completed` events against a
running Shamar API. Both mirror the same flow so output is comparable.

## Prerequisites

1. API running locally (from the repo root):

   ```bash
   cp .env.example .env      # once; never commit .env
   npm install
   npm run dev:api           # http://localhost:4000
   ```

2. Local-dev API key loaded from `.env` (`AGENTOS_DEV_API_KEY`, default
   `dev-local-key-change-me` in `.env.example`).

Optional: `docker compose up` for API `:4000` + web dashboard `:3000`.

## Node (stdlib `fetch`)

```bash
# from repo root, with AGENTOS_DEV_API_KEY set (or pass argv)
node examples/register-and-report.js
# or: node examples/register-and-report.js http://localhost:4000 <api-key>
```

## Python (stdlib only — `urllib`, `json`, `os`, `sys`)

```bash
# from repo root, with AGENTOS_DEV_API_KEY / SHAMAR_API_KEY set (or pass argv)
python examples/register-and-report.py
# or: python examples/register-and-report.py http://localhost:4000 <api-key>
```

No `pip install` required. On Windows, `python` is typical; on macOS/Linux,
`python3` works the same.

## What they do

1. Register (or reuse by name) a demo **Research Agent**
2. `POST /api/agents/:id/heartbeat`
3. Submit three events (single `agent.started`, then a batch of `model.called`
   + `task.completed`) via `POST /api/events` with the `x-api-key` header
4. Print the agent id, a dashboard summary JSON, and a link to open the
   dashboard detail view
