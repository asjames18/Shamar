# @shamar/sdk

Zero-dependency TypeScript client for the Shamar API. Uses the global `fetch`
(Node ≥ 18), so it has **no runtime dependencies**.

## Install

The repo is a npm workspace — inside this repo, other packages import it
directly. For external projects, copy the package or publish a build.

## Usage

```ts
import { ShamarClient } from '@shamar/sdk';

const shamar = new ShamarClient({
  baseUrl: 'http://localhost:4000', // or SHAMAR_BASE_URL
  apiKey: 'your-key', // or SHAMAR_API_KEY
});

const agent = await shamar.register({ name: 'Research Agent', department: 'ops' });
await shamar.heartbeat(agent.id);
await shamar.agentStarted(agent.id);

const t0 = Date.now();
await shamar.taskStarted(agent.id, { title: 'summarize thread' });
// ... do the work ...
await shamar.modelCalled(agent.id, {
  summary: 'ollama answered from docs',
  model: 'ollama:llama3',
  usage: { tokens_in: 812, tokens_out: 145 },
});
await shamar.taskCompleted(agent.id, {
  title: 'summarize thread',
  durationMs: Date.now() - t0,
});

// Later: full identity + usage rollups + timeline
const detail = await shamar.getAgentDetail(agent.id);
```

Batch events to cut round-trips:

```ts
await shamar.eventsBatch([
  { agent_id: agent.id, type: 'task.started', summary: 'one' },
  { agent_id: agent.id, type: 'task.completed', summary: 'two' },
]);
```

## Errors

Failures throw `ShamarError` with `status` (HTTP code, or `null` for network
errors) and the parsed `body`.

## Design notes

- Tokens are reported as measured; the client **never asserts cost**
  (the server ignores `cost_usd` from clients — ADR-0003).
- Structured `data` payloads should not contain prompt/response bodies
  (see SECURITY.md).
