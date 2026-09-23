#!/usr/bin/env node
/**
 * Example client: registers an agent, sends a heartbeat, and submits events.
 * Zero dependencies — uses only Node's built-in fetch.
 *
 * Usage:
 *   AGENTOS_DEV_API_KEY=dev-local-key-change-me node examples/register-and-report.js
 *   # or: node examples/register-and-report.js [api-base-url] [api-key]
 */
const BASE = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:4000';
const KEY = process.argv[3] || process.env.AGENTOS_DEV_API_KEY || '';

if (!KEY) {
  console.error('Set AGENTOS_DEV_API_KEY (see .env.example) or pass the key as argv[3].');
  process.exit(1);
}

const headers = { 'content-type': 'application/json', 'x-api-key': KEY };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // 1. Register the agent (idempotent-ish: reuse by name if it already exists)
  const existing = await api('GET', '/api/agents');
  let agent = existing.agents.find((a) => a.name === 'Research Agent');
  if (!agent) {
    ({ agent } = await api('POST', '/api/agents', {
      name: 'Research Agent',
      description: 'Researches topics and drafts briefs',
      department: 'Marketing',
      owner: 'demo-owner',
      provider: 'ollama-local',
      model: 'qwen3:8b',
      status: 'active',
      tools: ['web_search'],
      permissions: ['read:web'],
      autonomy_level: 2,
    }));
    console.log('registered agent:', agent.id);
  } else {
    console.log('reusing agent:', agent.id);
  }

  // 2. Heartbeat — tells the control plane the agent is alive
  await api('POST', `/api/agents/${agent.id}/heartbeat`);
  console.log('heartbeat sent');

  // 3. Submit events as the agent works
  await api('POST', '/api/events', {
    agent_id: agent.id,
    type: 'agent.started',
    summary: 'Research Agent started its shift',
  });
  await api('POST', '/api/events', {
    events: [
      {
        agent_id: agent.id,
        type: 'model.called',
        summary: 'Summarized 3 articles',
        data: { model: 'qwen3:8b', provider: 'ollama' },
        tokens_in: 1840,
        tokens_out: 320,
        duration_ms: 2100,
      },
      {
        agent_id: agent.id,
        type: 'task.completed',
        summary: 'Drafted competitive brief',
        duration_ms: 47000,
      },
    ],
  });
  console.log('events submitted (agent.started, model.called, task.completed)');

  // 4. Show the dashboard summary
  const summary = await api('GET', '/api/dashboard/summary');
  console.log('dashboard:', JSON.stringify(summary, null, 2));
  console.log(`\nOpen ${BASE.replace(':4000', ':3000')} to see it on the dashboard.`);
}

main().catch((err) => {
  console.error('example failed:', err.message);
  process.exit(1);
});
