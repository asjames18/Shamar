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

// ---------------------------------------------------------------------------
// Phase 2: Ollama adapter endpoints (mock Ollama HTTP server — no daemon needed)
// ---------------------------------------------------------------------------

import { createServer as createMockServer } from 'node:http';

function readMockBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const mockOllama = createMockServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }));
    return;
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const body = JSON.parse(await readMockBody(req)) as { model?: string };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: body.model,
        message: { role: 'assistant', content: 'Mock reply' },
        prompt_eval_count: 120,
        eval_count: 410,
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

let mockBase = '';
before(async () => {
  await new Promise<void>((resolve) => mockOllama.listen(0, resolve));
  mockBase = `http://localhost:${(mockOllama.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
});

async function createOllamaProvider(baseUrl: string) {
  const { status, json } = await api('POST', '/api/providers', { kind: 'ollama', name: `Mock Ollama ${baseUrl}`, base_url: baseUrl });
  assert.equal(status, 201);
  return req(json.provider, 'provider').id as string;
}

test('ollama: models lists installed models from the daemon', async () => {
  const id = await createOllamaProvider(mockBase);
  const { status, json } = await api('GET', `/api/providers/${id}/models`);
  assert.equal(status, 200);
  const models = (json as { models?: Array<{ id: string; name: string }> }).models ?? [];
  assert.deepEqual(models.map((m) => m.name), ['llama3.2:latest']);
});

test('ollama: validate marks reachable provider healthy', async () => {
  const id = await createOllamaProvider(mockBase);
  const { status, json } = await api('POST', `/api/providers/${id}/validate`);
  assert.equal(status, 200);
  assert.equal((json as { ok?: boolean }).ok, true);
  const list = await api('GET', '/api/providers');
  const provider = req(list.json.providers, 'providers').find((p) => p.id === id);
  assert.equal(provider && (provider as { status?: string }).status, 'healthy');
});

test('ollama: validate marks unreachable provider unhealthy', async () => {
  const id = await createOllamaProvider('http://localhost:1');
  const { status, json } = await api('POST', `/api/providers/${id}/validate`);
  assert.equal(status, 200);
  assert.equal((json as { ok?: boolean }).ok, false);
  assert.match((json as { message?: string }).message ?? '', /not reachable/);
});

test('ollama: invoke records model.called with real tokens, latency, cost 0', async () => {
  const providerId = await createOllamaProvider(mockBase);
  const created = await api('POST', '/api/agents', { name: 'Invoke Test Agent' });
  const agentId = req(created.json.agent, 'agent').id;
  const { status, json } = await api('POST', `/api/providers/${providerId}/invoke`, {
    agent_id: agentId,
    model: 'llama3.2:latest',
    messages: [{ role: 'user', content: 'Say hi' }],
  });
  assert.equal(status, 200);
  const body = json as { text?: string; usage?: { tokens_in: number; tokens_out: number }; event?: { id: string; type: string; tokens_in: number; tokens_out: number; cost_usd: number | null; data: Record<string, unknown> } };
  assert.equal(body.text, 'Mock reply');
  assert.equal(body.usage?.tokens_in, 120);
  assert.equal(body.usage?.tokens_out, 410);
  const event = req(body.event, 'event');
  assert.equal(event.type, 'model.called');
  assert.equal(event.cost_usd, 0); // local inference: $0 by definition, not estimated
  // Prompt/response bodies must never be persisted:
  assert.ok(!('messages' in event.data) && !('content' in event.data) && !('text' in event.data));

  const detail = await api('GET', `/api/agents/${agentId}/detail`);
  assert.equal(detail.status, 200);
  const usage = req(detail.json.usage, 'usage');
  assert.equal(usage.model_calls, 1);
  assert.equal(usage.tokens_in_total, 120);
  assert.equal(usage.tokens_out_total, 410);
  assert.equal(usage.events_by_type['model.called'], 1);
});

test('ollama: invoke rejects bad input before touching the model', async () => {
  const providerId = await createOllamaProvider(mockBase);
  const missing = await api('POST', `/api/providers/${providerId}/invoke`, { model: 'x', messages: [] });
  assert.equal(missing.status, 400);
  const badAgent = await api('POST', `/api/providers/${providerId}/invoke`, {
    agent_id: 'nope',
    model: 'x',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(badAgent.status, 400);
  assert.match(req(badAgent.json.error, 'error'), /unknown agent_id/);
  const unknownProvider = await api('POST', '/api/providers/nope/invoke', {
    agent_id: 'nope',
    model: 'x',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(unknownProvider.status, 404);
});

test('providers: unimplemented kinds return honest 501', async () => {
  const { status, json } = await api('POST', '/api/providers', { kind: 'openai', name: 'OpenAI BYOK' });
  assert.equal(status, 201);
  const id = req(json.provider, 'provider').id;
  const validate = await api('POST', `/api/providers/${id}/validate`);
  assert.equal(validate.status, 501);
  const models = await api('GET', `/api/providers/${id}/models`);
  assert.equal(models.status, 501);
});
