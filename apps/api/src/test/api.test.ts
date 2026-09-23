/**
 * API smoke tests. Run via `npm test` (builds first, then node --test on dist).
 * Uses in-memory SQLite and an ephemeral port — no external services.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.js';
import { SqliteStorage } from '../store.js';

process.env.AGENTOS_DEV_API_KEY = 'test-key';

const storage = new SqliteStorage(':memory:');
const server = createApp(storage);
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  storage.close();
});

const headers = { 'content-type': 'application/json', 'x-api-key': 'test-key' };

interface TestAgent {
  id: string;
  name: string;
  status: string;
  last_heartbeat_at: string | null;
}
interface TestEvent {
  type: string;
  cost_usd: number | null;
}
interface AgentUsage {
  events_total: number;
  events_last_24h: number;
  events_by_type: Record<string, number>;
  tokens_in_total: number;
  tokens_out_total: number;
  model_calls: number;
  tool_calls: number;
  tasks_completed: number;
  tasks_failed: number;
  first_seen_at: string | null;
  last_event_at: string | null;
}
interface ApiJson {
  ok?: boolean;
  error?: string;
  agent?: TestAgent;
  agents?: TestAgent[];
  events?: TestEvent | TestEvent[];
  providers?: Array<{ id: string; has_credential?: boolean }>;
  provider?: { id: string; has_credential: boolean; credential?: string };
  total_agents?: number;
  agents_by_status?: Record<string, number>;
  events_last_24h?: number;
  recent_events?: Array<{ type: string; summary: string; occurred_at: string; tokens_in: number | null; tokens_out: number | null; duration_ms: number | null; cost_usd: number | null }>;
  last_check_in?: string | null;
  usage?: AgentUsage;
}

function req<T>(v: T | undefined | null, what: string): T {
  assert.ok(v !== undefined && v !== null, `expected ${what} in response`);
  return v;
}

async function api(method: string, path: string, body?: unknown, key = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: key ? headers : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as ApiJson;
  return { status: res.status, json };
}

let agentId = '';

test('health needs no auth', async () => {
  const { status, json } = await api('GET', '/api/health', undefined, false);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('api routes require a key', async () => {
  const { status } = await api('GET', '/api/agents', undefined, false);
  assert.equal(status, 401);
});

test('wrong key is rejected', async () => {
  const res = await fetch(`${base}/api/agents`, { headers: { 'x-api-key': 'nope' } });
  assert.equal(res.status, 401);
});

test('create agent validates name', async () => {
  const { status, json } = await api('POST', '/api/agents', { description: 'no name' });
  assert.equal(status, 400);
  assert.match(req(json.error, 'error'), /name is required/);
});

test('create agent', async () => {
  const { status, json } = await api('POST', '/api/agents', {
    name: 'Research Agent',
    description: 'Researches topics',
    department: 'Marketing',
    owner: 'antonio@example.com',
    provider: 'ollama-local',
    model: 'qwen3:8b',
    status: 'active',
    tools: ['web_search'],
    autonomy_level: 2,
  });
  assert.equal(status, 201);
  const agent = req(json.agent, 'agent');
  agentId = agent.id;
  assert.equal(agent.name, 'Research Agent');
  assert.equal(agent.status, 'active');
});

test('list + get agent', async () => {
  const list = await api('GET', '/api/agents');
  assert.equal(list.status, 200);
  assert.equal(req(list.json.agents, 'agents').length, 1);
  const one = await api('GET', `/api/agents/${agentId}`);
  assert.equal(req(one.json.agent, 'agent').id, agentId);
});

test('patch agent', async () => {
  const { status, json } = await api('PATCH', `/api/agents/${agentId}`, { status: 'paused' });
  assert.equal(status, 200);
  assert.equal(req(json.agent, 'agent').status, 'paused');
});

test('patch rejects invalid status', async () => {
  const { status } = await api('PATCH', `/api/agents/${agentId}`, { status: 'flying' });
  assert.equal(status, 400);
});

test('heartbeat updates last_heartbeat_at and logs event', async () => {
  const { status, json } = await api('POST', `/api/agents/${agentId}/heartbeat`);
  assert.equal(status, 200);
  assert.ok(req(json.agent, 'agent').last_heartbeat_at);
  const events = await api('GET', `/api/events?agent_id=${agentId}&type=agent.heartbeat`);
  assert.equal((req(events.json.events, 'events') as TestEvent[]).length, 1);
});

test('event ingest rejects unknown types', async () => {
  const { status, json } = await api('POST', '/api/events', { agent_id: agentId, type: 'made.up' });
  assert.equal(status, 400);
  assert.match(req(json.error, 'error'), /unknown event type/);
});

test('event ingest + batch', async () => {
  const single = await api('POST', '/api/events', {
    agent_id: agentId,
    type: 'agent.started',
    summary: 'Agent started shift',
  });
  assert.equal(single.status, 201);
  const ev = req(single.json.events, 'event') as TestEvent;
  assert.equal(ev.type, 'agent.started');
  assert.equal(ev.cost_usd, null); // never guessed

  const batch = await api('POST', '/api/events', {
    events: [
      { agent_id: agentId, type: 'model.called', summary: 'summarize', tokens_in: 120, tokens_out: 45, duration_ms: 900 },
      { agent_id: agentId, type: 'task.completed', summary: 'Q3 lead list', duration_ms: 47000 },
    ],
  });
  assert.equal(batch.status, 201);
  assert.equal((req(batch.json.events, 'events') as TestEvent[]).length, 2);
});

test('event ingest rejects unknown agent', async () => {
  const { status } = await api('POST', '/api/events', { agent_id: 'nope', type: 'task.failed' });
  assert.equal(status, 400);
});

test('dashboard summary', async () => {
  const { status, json } = await api('GET', '/api/dashboard/summary');
  assert.equal(status, 200);
  assert.equal(json.total_agents, 1);
  assert.equal(req(json.agents_by_status, 'agents_by_status').paused, 1);
  assert.ok((json.events_last_24h ?? 0) >= 5);
  assert.ok(req(json.recent_events, 'recent_events').length > 0);
});

test('providers: create + list (no credential echo)', async () => {
  const { status, json } = await api('POST', '/api/providers', {
    kind: 'ollama',
    name: 'Local Ollama',
    base_url: 'http://localhost:11434',
    credential: 'sekret', // must never come back
  });
  assert.equal(status, 201);
  const provider = req(json.provider, 'provider');
  assert.equal(provider.has_credential, true);
  assert.ok(!('credential' in provider));
  const list = await api('GET', '/api/providers');
  assert.equal(req(list.json.providers, 'providers').length, 1);
});

test('agent detail 404 for unknown agent', async () => {
  const { status, json } = await api('GET', '/api/agents/nope/detail');
  assert.equal(status, 404);
  assert.match(req(json.error, 'error'), /agent not found/);
});

test('agent detail returns usage rollups + timeline', async () => {
  // Events so far for this agent: agent.created, agent.heartbeat, agent.started,
  // model.called (120 in / 45 out), task.completed.
  const { status, json } = await api('GET', `/api/agents/${agentId}/detail`);
  assert.equal(status, 200);
  const agent = req(json.agent, 'agent');
  assert.equal(agent.id, agentId);
  assert.ok(req(json.last_check_in, 'last_check_in')); // heartbeat set it
  const u = req(json.usage, 'usage');
  assert.equal(u.events_total, 5);
  assert.equal(u.events_last_24h, 5);
  assert.equal(u.model_calls, 1);
  assert.equal(u.tool_calls, 0);
  assert.equal(u.tasks_completed, 1);
  assert.equal(u.tasks_failed, 0);
  assert.equal(u.tokens_in_total, 120);
  assert.equal(u.tokens_out_total, 45);
  assert.equal(u.events_by_type['model.called'], 1);
  assert.equal(u.events_by_type['agent.heartbeat'], 1);
  assert.ok(req(u.first_seen_at, 'first_seen_at'));
  assert.ok(req(u.last_event_at, 'last_event_at'));
  const timeline = req(json.recent_events, 'recent_events');
  assert.equal(timeline.length, 5);
  assert.equal(timeline[0].type, 'task.completed'); // newest first
  assert.equal(timeline[0].cost_usd, null); // never guessed
  assert.equal(timeline[0].duration_ms, 47000);
  // occurred_at is non-increasing down the timeline
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(timeline[i - 1].occurred_at >= timeline[i].occurred_at, 'timeline must be newest-first');
  }
});

test('delete agent', async () => {
  const { status } = await api('DELETE', `/api/agents/${agentId}`);
  assert.equal(status, 200);
  const gone = await api('GET', `/api/agents/${agentId}`);
  assert.equal(gone.status, 404);
});
