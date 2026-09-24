/**
 * API smoke tests. Run via `npm test` (builds first, then node --test on dist).
 * Uses in-memory SQLite and an ephemeral port — no external services.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.js';
import { SqliteStorage, ValidationError } from '../store.js';

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
  budget?: {
    limit_usd: number;
    spend_month_usd: number;
    pct_used: number;
    status: string;
    department?: string;
    agent_count?: number;
  } | null;
  department_budget?: {
    department: string;
    limit_usd: number;
    spend_month_usd: number;
    agent_count: number;
    pct_used: number;
    status: string;
  } | null;
  departments?: Array<{
    name: string;
    agent_count: number;
    budget: {
      department: string;
      limit_usd: number;
      spend_month_usd: number;
      agent_count: number;
      pct_used: number;
      status: string;
    } | null;
  }>;
  reason?: string;
  department?: string;
  agents_by_status?: Record<string, number>;
  events_last_24h?: number;
  pending_approvals?: number;
  approval?: { id: string; agent_id: string; title: string; status: string; decided_by: string | null; requested_at: string; decided_at: string | null };
  approvals?: Array<{ id: string; agent_id: string; title: string; status: string }>;
  status?: string;
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

test('providers: all kinds implemented — validate returns an honest result, never 501', async () => {
  const { status, json } = await api('POST', '/api/providers', { kind: 'gemini', name: 'Gemini BYOK' });
  assert.equal(status, 201);
  const id = req(json.provider, 'provider').id;
  const validate = await api('POST', `/api/providers/${id}/validate`);
  assert.notEqual(validate.status, 501);
  // No key configured -> honest failure (ok:false), never a faked check.
  assert.equal(validate.status, 200);
  assert.equal(validate.json.ok, false);
  assert.equal(validate.json.status, 'unhealthy');
});

test('approvals: request → grant flow with event trail', async () => {
  const created = await api('POST', '/api/agents', { name: 'Approval Test Agent' });
  const aid = req(created.json.agent, 'agent').id;

  // Request: title required, requested_by defaults to agent.
  const requested = await api('POST', '/api/approvals', {
    agent_id: aid,
    title: 'Send invoice to Acme Corp',
    detail: 'Invoice #1042 for $1,500',
  });
  assert.equal(requested.status, 201);
  const approval = req(requested.json.approval, 'approval');
  assert.equal(approval.status, 'pending');
  assert.equal(approval.decided_by, null);

  // Listing by status and agent.
  const listed = await api('GET', `/api/approvals?agent_id=${aid}&status=pending`);
  assert.equal(listed.status, 200);
  assert.ok(req(listed.json.approvals, 'approvals').some((a) => a.id === approval.id));

  // Dashboard summary counts it; agent detail shows it.
  const summary = await api('GET', '/api/dashboard/summary');
  assert.ok(req(summary.json.pending_approvals, 'pending_approvals') >= 1);
  const detail = await api('GET', `/api/agents/${aid}/detail`);
  const pending = (detail.json as { pending_approvals?: Array<{ id: string }> }).pending_approvals;
  assert.ok(pending?.some((p) => p.id === approval.id));

  // Grant: decided_by is required; decision is final.
  const granted = await api('POST', `/api/approvals/${approval.id}/grant`, {
    decided_by: 'antonio@example.com',
    reason: 'Verified against the books',
  });
  assert.equal(granted.status, 200);
  const decided = req(granted.json.approval, 'approval');
  assert.equal(decided.status, 'granted');
  assert.equal(decided.decided_by, 'antonio@example.com');
  assert.ok(decided.decided_at);

  // Double-decide fails closed.
  const again = await api('POST', `/api/approvals/${approval.id}/grant`, { decided_by: 'antonio@example.com' });
  assert.equal(again.status, 400);
  assert.match(req(again.json.error, 'error'), /already decided/);
  const denyAfterGrant = await api('POST', `/api/approvals/${approval.id}/deny`, { decided_by: 'antonio@example.com' });
  assert.equal(denyAfterGrant.status, 400);

  // Event trail: approval.requested + approval.granted, newest first.
  const events = await api('GET', `/api/events?agent_id=${aid}&limit=5`);
  const types = req(events.json.events, 'events') as Array<{ type: string }>;
  assert.ok(Array.isArray(types));
  const typeList = (types as Array<{ type: string }>).map((e) => e.type);
  assert.ok(typeList.includes('approval.requested') && typeList.includes('approval.granted'));
});

test('approvals: deny flow', async () => {
  const created = await api('POST', '/api/agents', { name: 'Deny Test Agent' });
  const aid = req(created.json.agent, 'agent').id;
  const requested = await api('POST', '/api/approvals', {
    agent_id: aid,
    title: 'Delete production database',
    requested_by: 'agent',
  });
  const id = req(requested.json.approval, 'approval').id;
  const denied = await api('POST', `/api/approvals/${id}/deny`, { decided_by: 'antonio@example.com' });
  assert.equal(denied.status, 200);
  assert.equal(req(denied.json.approval, 'approval').status, 'denied');
  const events = await api('GET', `/api/events?agent_id=${aid}&type=approval.denied`);
  const evts = req(events.json.events, 'events');
  assert.ok(Array.isArray(evts) && evts.length === 1);
});

test('approvals: validation fails closed', async () => {
  const created = await api('POST', '/api/agents', { name: 'Validation Test Agent' });
  const aid = req(created.json.agent, 'agent').id;

  const unknownAgent = await api('POST', '/api/approvals', { agent_id: 'nope', title: 'x' });
  assert.equal(unknownAgent.status, 400);
  assert.match(req(unknownAgent.json.error, 'error'), /unknown agent_id/);

  const noTitle = await api('POST', '/api/approvals', { agent_id: aid });
  assert.equal(noTitle.status, 400);
  assert.match(req(noTitle.json.error, 'error'), /title is required/);

  const badStatus = await api('GET', '/api/approvals?status=bogus');
  assert.equal(badStatus.status, 400);

  const requested = await api('POST', '/api/approvals', { agent_id: aid, title: 'Needs a decider' });
  const id = req(requested.json.approval, 'approval').id;
  const noDecider = await api('POST', `/api/approvals/${id}/grant`, {});
  assert.equal(noDecider.status, 400);
  assert.match(req(noDecider.json.error, 'error'), /exactly one of decided_by/);

  const unknownId = await api('POST', '/api/approvals/nope/grant', { decided_by: 'antonio@example.com' });
  assert.equal(unknownId.status, 404);
});

test('budgets: detail shows null budget when none is set', async () => {
  const created = await api('POST', '/api/agents', { name: 'No Budget Agent' });
  const aid = req(created.json.agent, 'agent').id;
  const detail = await api('GET', `/api/agents/${aid}/detail`);
  assert.equal(detail.status, 200);
  assert.equal((detail.json as ApiJson).budget, null);
});

test('budgets: warning at 80% then exceeded once at 100% (edge-triggered)', async () => {
  const created = await api('POST', '/api/agents', { name: 'Budget Test Agent', budget_monthly_usd: 1.0 });
  const aid = req(created.json.agent, 'agent').id;
  const call = (cost: number) =>
    api('POST', '/api/events', { agent_id: aid, type: 'model.called', cost_usd: cost, summary: `call $${cost}` });
  const budgetOf = async () => {
    const detail = await api('GET', `/api/agents/${aid}/detail`);
    assert.equal(detail.status, 200);
    const json = detail.json as ApiJson;
    return { budget: req(json.budget, 'budget'), counts: req(json.usage, 'usage').events_by_type };
  };

  await call(0.5); // 50% — no alert
  let { budget, counts } = await budgetOf();
  assert.equal(budget.status, 'ok');
  assert.equal(budget.spend_month_usd, 0.5);
  assert.equal(counts['budget.warning'] ?? 0, 0);

  await call(0.3); // 80% — warning fires
  ({ budget, counts } = await budgetOf());
  assert.equal(budget.status, 'warning');
  assert.equal(counts['budget.warning'], 1);

  await call(0.15); // 95% — still warning, no duplicate
  ({ budget, counts } = await budgetOf());
  assert.equal(budget.status, 'warning');
  assert.equal(counts['budget.warning'], 1);
  assert.equal(counts['budget.exceeded'] ?? 0, 0);

  await call(0.1); // 105% — exceeded fires, warning count frozen
  ({ budget, counts } = await budgetOf());
  assert.equal(budget.status, 'exceeded');
  assert.equal(counts['budget.exceeded'], 1);
  assert.equal(counts['budget.warning'], 1);

  await call(0.01); // more spend — exceeded must not duplicate
  ({ counts } = await budgetOf());
  assert.equal(counts['budget.exceeded'], 1);
});

test('budgets: invoke blocked at budget (403) with policy.blocked audit; open gate passes through', async () => {
  const providerId = await createOllamaProvider('http://localhost:1'); // unreachable — budget gate runs before any network call

  // $0 budget = spend nothing: invokes are throttled immediately.
  const created = await api('POST', '/api/agents', { name: 'Throttle Test Agent', budget_monthly_usd: 0 });
  const aid = req(created.json.agent, 'agent').id;
  const invoke = (id: string) =>
    api('POST', `/api/providers/${providerId}/invoke`, {
      agent_id: id,
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });

  const blocked = await invoke(aid);
  assert.equal(blocked.status, 403);
  assert.match(req((blocked.json as ApiJson).error, 'error'), /budget/);
  const detail = await api('GET', `/api/agents/${aid}/detail`);
  const counts = req((detail.json as ApiJson).usage, 'usage').events_by_type;
  assert.equal(counts['policy.blocked'], 1);
  assert.equal(counts['budget.exceeded'], 1); // alert made the audit trail even without a spend event

  // An agent with headroom in its budget sails through the gate: the daemon is
  // unreachable, so the failure is a 502 from the adapter — not a 403.
  const created2 = await api('POST', '/api/agents', { name: 'Headroom Agent', budget_monthly_usd: 100 });
  const aid2 = req(created2.json.agent, 'agent').id;
  const passthrough = await invoke(aid2);
  assert.equal(passthrough.status, 502);
});

test('costs: valid self-reported cost is stored as reported data (ADR-0005)', async () => {
  const created = await api('POST', '/api/agents', { name: 'Cost Reporter' });
  const id = req(created.json.agent, 'agent').id;
  const { status, json } = await api('POST', '/api/events', {
    agent_id: id,
    type: 'model.called',
    summary: 'external run',
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0012,
  });
  assert.equal(status, 201);
  assert.equal((req(json.events, 'event') as TestEvent).cost_usd, 0.0012);
});

test('costs: negative cost is rejected (400)', async () => {
  const created = await api('POST', '/api/agents', { name: 'Cost Skeptic' });
  const id = req(created.json.agent, 'agent').id;
  const { status, json } = await api('POST', '/api/events', {
    agent_id: id,
    type: 'model.called',
    summary: 'bad cost',
    cost_usd: -1,
  });
  assert.equal(status, 400);
  assert.match(req(json.error, 'error'), /cost_usd/);
});

test('costs: non-finite cost is rejected at the store level (400)', async () => {
  // NaN/Infinity can't survive a JSON round-trip, so exercise the store directly.
  const created = await api('POST', '/api/agents', { name: 'Cost Skeptic 2' });
  const id = req(created.json.agent, 'agent').id;
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => storage.appendEvent({ agent_id: id, type: 'model.called', summary: 'bad cost', cost_usd: bad }),
      (err: unknown) => err instanceof ValidationError && /cost_usd/.test(err.message),
    );
  }
});

test('autonomy: L0 agent invoke is blocked (403) with policy.blocked audit', async () => {
  const providerId = await createOllamaProvider('http://localhost:1'); // unreachable — gate runs before any network call
  const created = await api('POST', '/api/agents', { name: 'L0 Monitored Agent', autonomy_level: 0 });
  const aid = req(created.json.agent, 'agent').id;
  const { status, json } = await api('POST', `/api/providers/${providerId}/invoke`, {
    agent_id: aid,
    model: 'x',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(status, 403);
  assert.match(req(json.error, 'error'), /L0/);
  const detail = await api('GET', `/api/agents/${aid}/detail`);
  assert.equal(req(detail.json.usage, 'usage').events_by_type['policy.blocked'], 1);
});

test('autonomy: L1 invoke needs a human grant inside 24h; then passes the gate', async () => {
  const providerId = await createOllamaProvider('http://localhost:1'); // unreachable — 502 means the gate passed
  const created = await api('POST', '/api/agents', { name: 'L1 Supervised Agent', autonomy_level: 1 });
  const aid = req(created.json.agent, 'agent').id;
  const invoke = () =>
    api('POST', `/api/providers/${providerId}/invoke`, {
      agent_id: aid,
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });

  const blocked = await invoke();
  assert.equal(blocked.status, 403);
  assert.match(req(blocked.json.error, 'error'), /POST \/api\/approvals/);

  const req1 = await api('POST', '/api/approvals', { agent_id: aid, title: 'Invoke for weekly summary' });
  const approvalId = req(req1.json.approval, 'approval').id;
  const grant = await api('POST', `/api/approvals/${approvalId}/grant`, { decided_by: 'ops@example.com' });
  assert.equal(grant.status, 200);

  const passthrough = await invoke();
  assert.equal(passthrough.status, 502); // gate passed; failure is the unreachable mock daemon
});

test('autonomy: L2 invoke clamps max_tokens to 1024 and reports it', async () => {
  const providerId = await createOllamaProvider(mockBase);
  const created = await api('POST', '/api/agents', { name: 'L2 Assisted Agent', autonomy_level: 2 });
  const aid = req(created.json.agent, 'agent').id;
  const { status, json } = await api('POST', `/api/providers/${providerId}/invoke`, {
    agent_id: aid,
    model: 'llama3.2:latest',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5000,
  });
  assert.equal(status, 200);
  const policy = (json as { policy?: { max_tokens_clamped?: boolean; max_tokens_effective?: number } }).policy;
  assert.equal(req(policy, 'policy').max_tokens_clamped, true);
  assert.equal(req(policy, 'policy').max_tokens_effective, 1024);
});

test('autonomy: L5 supervisor can grant/deny for supervised agents; others cannot', async () => {
  const sup = await api('POST', '/api/agents', { name: 'Ops Supervisor', autonomy_level: 5 });
  const supId = req(sup.json.agent, 'agent').id;
  const worker = await api('POST', '/api/agents', {
    name: 'Supervised Worker',
    autonomy_level: 1,
    supervisor_agent_id: supId,
  });
  const workerId = req(worker.json.agent, 'agent').id;
  const loner = await api('POST', '/api/agents', { name: 'Unsupervised Agent', autonomy_level: 1 });
  const lonerId = req(loner.json.agent, 'agent').id;
  const notSup = await api('POST', '/api/agents', { name: 'Junior Agent', autonomy_level: 2 });
  const notSupId = req(notSup.json.agent, 'agent').id;

  const mkReq = (agent_id: string) => api('POST', '/api/approvals', { agent_id, title: 'Do the thing' });

  // Supervisor grants for its supervised agent — decided_by recorded as agent:<id>.
  const r1 = await mkReq(workerId);
  const g1 = await api('POST', `/api/approvals/${req(r1.json.approval, 'a').id}/grant`, { decided_by_agent_id: supId });
  assert.equal(g1.status, 200);
  assert.equal(req(g1.json.approval, 'a').decided_by, `agent:${supId}`);

  // Same supervisor denies for its supervised agent.
  const r2 = await mkReq(workerId);
  const d1 = await api('POST', `/api/approvals/${req(r2.json.approval, 'a').id}/deny`, {
    decided_by_agent_id: supId,
    reason: 'too risky',
  });
  assert.equal(d1.status, 200);
  assert.equal(req(d1.json.approval, 'a').status, 'denied');

  // Non-L5 agent cannot decide, even with an explicit id.
  const r3 = await mkReq(workerId);
  const bad1 = await api('POST', `/api/approvals/${req(r3.json.approval, 'a').id}/grant`, {
    decided_by_agent_id: notSupId,
  });
  assert.equal(bad1.status, 400);
  assert.match(req(bad1.json.error, 'error'), /L5/);

  // L5 supervisor cannot decide for an agent it does not supervise.
  const r4 = await mkReq(lonerId);
  const bad2 = await api('POST', `/api/approvals/${req(r4.json.approval, 'a').id}/grant`, {
    decided_by_agent_id: supId,
  });
  assert.equal(bad2.status, 400);
  assert.match(req(bad2.json.error, 'error'), /supervise/);

  // Both decider fields at once, or neither, is rejected.
  const r5 = await mkReq(workerId);
  const bad3 = await api('POST', `/api/approvals/${req(r5.json.approval, 'a').id}/grant`, {
    decided_by: 'ops@example.com',
    decided_by_agent_id: supId,
  });
  assert.equal(bad3.status, 400);
  const bad4 = await api('POST', `/api/approvals/${req(r5.json.approval, 'a').id}/grant`, {});
  assert.equal(bad4.status, 400);
});

test('autonomy: human grant/deny flow is unchanged', async () => {
  const created = await api('POST', '/api/agents', { name: 'Human Flow Agent' });
  const aid = req(created.json.agent, 'agent').id;
  const req1 = await api('POST', '/api/approvals', { agent_id: aid, title: 'Send the invoice' });
  const approvalId = req(req1.json.approval, 'approval').id;
  const grant = await api('POST', `/api/approvals/${approvalId}/grant`, { decided_by: 'ops@example.com' });
  assert.equal(grant.status, 200);
  assert.equal(req(grant.json.approval, 'a').decided_by, 'ops@example.com');
});

test('department budgets: set → state → clear', async () => {
  const a1 = await api('POST', '/api/agents', { name: 'Sales Agent 1', department: 'Sales' });
  await api('POST', '/api/agents', { name: 'Sales Agent 2', department: 'Sales' });
  const aid1 = req(a1.json.agent, 'agent').id;

  // No budget yet: state endpoint 404s, list shows null meter.
  const missing = await api('GET', '/api/departments/Sales/budget');
  assert.equal(missing.status, 404);
  const listed = await api('GET', '/api/departments');
  const sales = req(listed.json.departments, 'departments').find((d) => d.name === 'Sales');
  assert.ok(sales);
  assert.equal(sales.agent_count, 2);
  assert.equal(sales.budget, null);

  const set = await api('PUT', '/api/departments/Sales/budget', { budget_monthly_usd: 10 });
  assert.equal(set.status, 200);
  const b = req((set.json as ApiJson).budget, 'budget');
  assert.equal(b.limit_usd, 10);
  assert.equal(b.spend_month_usd, 0);
  assert.equal(b.agent_count, 2);
  assert.equal(b.status, 'ok');

  const detail = await api('GET', `/api/agents/${aid1}/detail`);
  const db = req((detail.json as ApiJson).department_budget, 'department_budget');
  assert.equal(db.department, 'Sales');
  assert.equal(db.limit_usd, 10);
  assert.equal((detail.json as ApiJson).budget, null); // personal budget untouched

  const cleared = await api('PUT', '/api/departments/Sales/budget', { budget_monthly_usd: null });
  assert.equal(cleared.status, 200);
  assert.equal((cleared.json as ApiJson).budget, null);
  const gone = await api('GET', '/api/departments/Sales/budget');
  assert.equal(gone.status, 404);
});

test('department budgets: validation fails closed', async () => {
  for (const bad of [-5, 'abc', true]) {
    const r = await api('PUT', '/api/departments/Research/budget', { budget_monthly_usd: bad });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    assert.match(req(r.json.error, 'error'), /budget_monthly_usd/);
  }
  // The rejected writes must not have left a budget behind.
  const check = await api('GET', '/api/departments/Research/budget');
  assert.equal(check.status, 404);
});

test('department budgets: shared pool sums across agents; alerts edge-triggered on the triggering agent', async () => {
  const a1 = await api('POST', '/api/agents', { name: 'Dept Pool Agent 1', department: 'PoolDept' });
  const a2 = await api('POST', '/api/agents', { name: 'Dept Pool Agent 2', department: 'PoolDept' });
  const aid1 = req(a1.json.agent, 'agent').id;
  const aid2 = req(a2.json.agent, 'agent').id;
  await api('PUT', '/api/departments/PoolDept/budget', { budget_monthly_usd: 1.0 });

  const call = (id: string, cost: number) =>
    api('POST', '/api/events', { agent_id: id, type: 'model.called', cost_usd: cost, summary: `call $${cost}` });
  const countsOf = async (id: string) => {
    const detail = await api('GET', `/api/agents/${id}/detail`);
    return req((detail.json as ApiJson).usage, 'usage').events_by_type;
  };
  const deptState = async () => {
    const r = await api('GET', '/api/departments/PoolDept/budget');
    assert.equal(r.status, 200);
    return req((r.json as ApiJson).budget, 'budget');
  };

  await call(aid1, 0.5); // 50% — no alert
  let st = await deptState();
  assert.equal(st.status, 'ok');
  assert.equal(st.spend_month_usd, 0.5);
  assert.equal(st.agent_count, 2);
  assert.equal((await countsOf(aid1))['department.budget.warning'] ?? 0, 0);

  await call(aid2, 0.3); // 80% — warning lands on the triggering agent (aid2)
  st = await deptState();
  assert.equal(st.status, 'warning');
  assert.equal(st.spend_month_usd, 0.8);
  assert.equal((await countsOf(aid2))['department.budget.warning'], 1);
  assert.equal((await countsOf(aid1))['department.budget.warning'] ?? 0, 0);
  // Per-agent budget alerts must not be contaminated by the department alert.
  assert.equal((await countsOf(aid2))['budget.warning'] ?? 0, 0);

  await call(aid1, 0.3); // 110% — exceeded fires on aid1, exactly once
  st = await deptState();
  assert.equal(st.status, 'exceeded');
  assert.equal((await countsOf(aid1))['department.budget.exceeded'], 1);

  await call(aid2, 0.1); // more spend — no duplicate exceeded anywhere
  assert.equal((await countsOf(aid1))['department.budget.exceeded'], 1);
  assert.equal((await countsOf(aid2))['department.budget.exceeded'] ?? 0, 0);
});

test('department budgets: invoke blocked at department cap (403, reason department_budget_exceeded)', async () => {
  const providerId = await createOllamaProvider('http://localhost:1'); // unreachable — gate runs before any network call
  // $0 department cap = spend nothing: the shared pool is exceeded immediately.
  await api('PUT', '/api/departments/SupportDept/budget', { budget_monthly_usd: 0 });
  const created = await api('POST', '/api/agents', { name: 'Support Agent', department: 'SupportDept' });
  const aid = req(created.json.agent, 'agent').id;
  const invoke = (id: string) =>
    api('POST', `/api/providers/${providerId}/invoke`, {
      agent_id: id,
      model: 'x',
      messages: [{ role: 'user', content: 'hi' }],
    });

  const blocked = await invoke(aid);
  assert.equal(blocked.status, 403);
  assert.equal((blocked.json as ApiJson).reason, 'department_budget_exceeded');
  assert.equal((blocked.json as ApiJson).department, 'SupportDept');
  assert.match(req((blocked.json as ApiJson).error, 'error'), /department/);
  const detail = await api('GET', `/api/agents/${aid}/detail`);
  const counts = req((detail.json as ApiJson).usage, 'usage').events_by_type;
  assert.equal(counts['policy.blocked'], 1);
  assert.equal(counts['department.budget.exceeded'], 1); // alert made the audit trail even without a spend event

  // Department with headroom: the agent sails through (502 = gate passed, unreachable daemon).
  await api('PUT', '/api/departments/OpenDept/budget', { budget_monthly_usd: 100 });
  const created2 = await api('POST', '/api/agents', { name: 'Open Agent', department: 'OpenDept' });
  const passthrough = await invoke(req(created2.json.agent, 'agent').id);
  assert.equal(passthrough.status, 502);
});
