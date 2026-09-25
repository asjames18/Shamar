/**
 * SDK tests. Run via `npm test` (builds first, then node --test on dist).
 * Drives the SDK against a mock HTTP server that mirrors the API contract
 * (paths, auth headers, response shapes) — no external services.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ShamarClient, ShamarError } from '../index.js';

const VALID_KEY = 'sdk-test-key';

interface RecordedRequest {
  method: string;
  path: string;
  authHeader: string;
  body: unknown;
}

let server: Server;
let base = '';
const recorded: RecordedRequest[] = [];

/** Mutable agent store so lifecycle tests can assert real state transitions. */
const agentsById = new Map<string, MockAgent>();
let cloneSeq = 0;

interface MockAgent {
  id: string;
  name: string;
  last_heartbeat_at: string | null;
  [key: string]: unknown;
}

function agent(id: string, name: string): MockAgent {
  return {
    id,
    name,
    description: null,
    department: 'ops',
    owner: null,
    provider: null,
    model: null,
    status: 'active',
    tools: [],
    budget_usd: null,
    autonomy_level: 1,
    created_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
    last_heartbeat_at: null,
  };
}

function readBody(req: NodeJS.ReadableStream): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : null));
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    recorded.push({
      method: req.method ?? '',
      path,
      authHeader: String(req.headers['authorization'] ?? ''),
      body,
    });

    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (String(req.headers['authorization']) !== `Bearer ${VALID_KEY}`) {
      return send(401, { error: 'unauthorized' });
    }

    const hbMatch = path.match(/^\/api\/agents\/([^/]+)\/heartbeat$/);
    if (hbMatch && req.method === 'POST') {
      const a = agent(decodeURIComponent(hbMatch[1]!), 'n');
      a.last_heartbeat_at = new Date().toISOString();
      return send(200, { agent: a });
    }

    const detailMatch = path.match(/^\/api\/agents\/([^/]+)\/detail$/);
    if (detailMatch && req.method === 'GET') {
      const id = decodeURIComponent(detailMatch[1]!);
      if (id === 'missing') return send(404, { error: 'agent not found' });
      return send(200, {
        agent: agent(id, 'detail-agent'),
        last_check_in: null,
        usage: {
          events_total: 1,
          events_last_24h: 1,
          events_by_type: { 'task.completed': 1 },
          tokens_in_total: 100,
          tokens_out_total: 25,
          model_calls: 1,
          tool_calls: 0,
          tasks_completed: 1,
          tasks_failed: 0,
          first_seen_at: '2026-09-23T00:00:00.000Z',
          last_event_at: '2026-09-23T00:00:01.000Z',
        },
        recent_events: [],
      });
    }

    const lifeMatch = path.match(/^\/api\/agents\/([^/]+)\/(pause|resume|retire|clone)$/);
    if (lifeMatch && req.method === 'POST') {
      const id = decodeURIComponent(lifeMatch[1]!);
      const action = lifeMatch[2] as 'pause' | 'resume' | 'retire' | 'clone';
      if (id === 'missing' || !agentsById.has(id)) {
        return send(404, { error: 'agent not found' });
      }
      const current = agentsById.get(id)!;
      const b = (body ?? {}) as { reason?: string; name?: string };

      if (action === 'clone') {
        cloneSeq += 1;
        const cloned: MockAgent = {
          ...current,
          id: `clone-${cloneSeq}`,
          name: b.name ?? `${current.name} (copy)`,
          status: 'idle',
          last_heartbeat_at: null,
          created_at: '2026-09-25T00:00:00.000Z',
          updated_at: '2026-09-25T00:00:00.000Z',
        };
        agentsById.set(cloned.id, cloned);
        return send(200, { agent: cloned });
      }

      if (action === 'pause') {
        if (current.status === 'retired') {
          return send(409, {
            error:
              'cannot pause a retired agent — retire is terminal; clone it to start over',
          });
        }
        if (current.status !== 'paused') {
          current.status = 'paused';
          current.updated_at = new Date().toISOString();
        }
        return send(200, { agent: { ...current } });
      }

      if (action === 'resume') {
        if (current.status === 'retired') {
          return send(409, {
            error:
              'cannot resume a retired agent — retire is terminal; clone it to start over',
          });
        }
        if (current.status === 'paused') {
          current.status = 'active';
          current.updated_at = new Date().toISOString();
        }
        return send(200, { agent: { ...current } });
      }

      // retire
      if (current.status !== 'retired') {
        current.status = 'retired';
        current.updated_at = new Date().toISOString();
      }
      return send(200, { agent: { ...current } });
    }

    const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/);
    if (agentMatch) {
      const id = decodeURIComponent(agentMatch[1]!);
      if (id === 'missing') return send(404, { error: 'agent not found' });
      if (req.method === 'GET') return send(200, { agent: agent(id, 'n') });
      if (req.method === 'PATCH')
        return send(200, {
          agent: { ...agent(id, 'n'), ...(body as object) },
        });
    }

    if (path === '/api/agents' && req.method === 'POST') {
      const name = (body as { name: string }).name;
      // Keep 'agent-1' for the classic roundtrip test; unique ids otherwise.
      const id = name === 'sdk-agent' || agentsById.size === 0 ? 'agent-1' : `agent-${agentsById.size + 1}`;
      const created = agent(id, name);
      created.department = (body as { department?: string }).department ?? 'ops';
      created.provider = (body as { provider?: string | null }).provider ?? null;
      created.model = (body as { model?: string | null }).model ?? null;
      agentsById.set(created.id, { ...created });
      return send(201, { agent: created });
    }
    if (path === '/api/agents' && req.method === 'GET') {
      return send(200, { agents: [agent('agent-1', 'sdk-list-agent')] });
    }

    if (path === '/api/events' && req.method === 'POST') {
      const b = body as { events?: unknown[] } & Record<string, unknown>;
      const inputs = Array.isArray(b.events) ? b.events : [b];
      const events = inputs.map((e, i) => ({
        ...(e as object),
        id: `evt-${i}`,
        occurred_at: '2026-09-23T00:00:00.000Z',
        actor: 'agent',
        tokens_in: (e as { tokens_in?: number }).tokens_in ?? null,
        tokens_out: (e as { tokens_out?: number }).tokens_out ?? null,
        cost_usd: null,
        duration_ms: (e as { duration_ms?: number }).duration_ms ?? null,
      }));
      // Mirror the real server: single non-batch posts return the bare event.
      return send(201, {
        events: inputs.length === 1 && !b.events ? events[0] : events,
      });
    }

    if (path === '/api/dashboard/summary' && req.method === 'GET') {
      return send(200, {
        total_agents: 2,
        active_agents: 2,
        agents_by_status: { active: 2 },
        events_last_24h: 7,
        recent_events: [],
      });
    }

    return send(404, { error: 'not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const client = () => new ShamarClient({ baseUrl: base, apiKey: VALID_KEY });
const lastRequest = () => recorded[recorded.length - 1]!;

test('constructor throws without an API key', () => {
  const prev = process.env['SHAMAR_API_KEY'];
  delete process.env['SHAMAR_API_KEY'];
  assert.throws(
    () => new ShamarClient({ baseUrl: base }),
    (e) => e instanceof ShamarError && e.status === null,
  );
  if (prev !== undefined) process.env['SHAMAR_API_KEY'] = prev;
});

test('constructor reads key from SHAMAR_API_KEY env', () => {
  process.env['SHAMAR_API_KEY'] = VALID_KEY;
  assert.ok(new ShamarClient({ baseUrl: base }) instanceof ShamarClient);
  delete process.env['SHAMAR_API_KEY'];
});

test('sends Bearer auth header', async () => {
  await client().listAgents();
  assert.equal(lastRequest().authHeader, `Bearer ${VALID_KEY}`);
});

test('register -> getAgent -> heartbeat roundtrip', async () => {
  const c = client();
  const registered = await c.register({ name: 'sdk-agent', department: 'ops' });
  assert.equal(registered.id, 'agent-1');
  assert.equal(registered.name, 'sdk-agent');
  assert.equal(lastRequest().method, 'POST');
  assert.equal(lastRequest().path, '/api/agents');

  const fetched = await c.getAgent('agent-1');
  assert.equal(fetched.id, 'agent-1');

  const hb = await c.heartbeat('agent-1');
  assert.ok(hb.last_heartbeat_at !== null);
  assert.equal(lastRequest().path, '/api/agents/agent-1/heartbeat');
});

test('updateAgent PATCHes partial fields', async () => {
  const updated = await client().updateAgent('agent-1', {
    name: 'renamed',
  } as never);
  assert.equal(updated.name, 'renamed');
  assert.equal(lastRequest().method, 'PATCH');
});

test('listAgents returns agent array', async () => {
  const agents = await client().listAgents();
  assert.ok(agents.some((a) => a.name === 'sdk-list-agent'));
});

test('event + convenience helpers use expected types and summaries', async () => {
  const c = client();

  const started = await c.agentStarted('agent-1');
  assert.equal(started.type, 'agent.started');
  assert.equal(started.id, 'evt-0');

  const t = await c.taskStarted('agent-1', { title: 'inbox triage' });
  assert.equal(t.type, 'task.started');
  assert.equal(t.summary, 'Task started: inbox triage');

  const done = await c.taskCompleted('agent-1', {
    title: 'inbox triage',
    durationMs: 1234,
  });
  assert.equal(done.type, 'task.completed');
  assert.equal(done.duration_ms, 1234);

  const failed = await c.taskFailed('agent-1', {
    title: 'refund call',
    error: 'customer hung up',
  });
  assert.equal(failed.type, 'task.failed');
  assert.equal(
    (failed.data as Record<string, unknown>)['error'],
    'customer hung up',
  );

  const mc = await c.modelCalled('agent-1', {
    summary: 'answered FAQ',
    model: 'ollama:llama3',
    usage: { tokens_in: 100, tokens_out: 25 },
  });
  assert.equal(mc.type, 'model.called');
  assert.equal(mc.tokens_in, 100);
  assert.equal(mc.tokens_out, 25);
  assert.equal(mc.cost_usd, null); // server never takes cost from clients
  assert.equal(
    (mc.data as Record<string, unknown>)['model'],
    'ollama:llama3',
  );

  const tc = await c.toolCalled('agent-1', {
    summary: 'searched tickets',
    tool: 'zendesk.search',
  });
  assert.equal(tc.type, 'tool.called');
  assert.equal(
    (tc.data as Record<string, unknown>)['tool'],
    'zendesk.search',
  );
});

test('eventsBatch posts { events } wrapper and returns the array', async () => {
  const events = await client().eventsBatch([
    { agent_id: 'agent-1', type: 'task.started', summary: 'one' },
    { agent_id: 'agent-1', type: 'task.completed', summary: 'two' },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, 'task.started');
  const body = lastRequest().body as { events: unknown[] };
  assert.ok(Array.isArray(body.events));
  assert.equal(body.events.length, 2);
});

test('eventsBatch([]) skips the network call', async () => {
  const before = recorded.length;
  assert.deepEqual(await client().eventsBatch([]), []);
  assert.equal(recorded.length, before);
});

test('getAgentDetail returns identity + usage + timeline', async () => {
  const detail = await client().getAgentDetail('agent-1');
  assert.equal(detail.agent.id, 'agent-1');
  assert.equal(detail.usage.events_total, 1);
  assert.equal(detail.usage.tasks_completed, 1);
  assert.equal(lastRequest().path, '/api/agents/agent-1/detail');
});

test('dashboardSummary returns rollups', async () => {
  const summary = await client().dashboardSummary();
  assert.equal(summary.total_agents, 2);
  assert.equal(summary.events_last_24h, 7);
});

test('unknown agent id throws ShamarError with 404', async () => {
  await assert.rejects(
    () => client().getAgent('missing'),
    (e) => e instanceof ShamarError && e.status === 404,
  );
});

test('wrong API key throws ShamarError with 401', async () => {
  const c = new ShamarClient({ baseUrl: base, apiKey: 'wrong-key' });
  await assert.rejects(
    () => c.listAgents(),
    (e) => e instanceof ShamarError && e.status === 401,
  );
});

test('unreachable server throws ShamarError with null status', async () => {
  const c = new ShamarClient({ baseUrl: 'http://127.0.0.1:1', apiKey: VALID_KEY });
  await assert.rejects(
    () => c.listAgents(),
    (e) =>
      e instanceof ShamarError &&
      e.status === null &&
      /network error/i.test(e.message),
  );
});

test('lifecycle: pause → resume → retire state transitions', async () => {
  const c = client();
  const registered = await c.register({
    name: 'lifecycle-agent',
    department: 'ops',
  });
  assert.equal(registered.status, 'active');

  const paused = await c.pause(registered.id, 'weekly freeze');
  assert.equal(paused.status, 'paused');
  assert.equal(lastRequest().method, 'POST');
  assert.equal(lastRequest().path, `/api/agents/${registered.id}/pause`);
  assert.deepEqual(lastRequest().body, { reason: 'weekly freeze' });

  const resumed = await c.resume(registered.id);
  assert.equal(resumed.status, 'active');
  assert.equal(lastRequest().path, `/api/agents/${registered.id}/resume`);

  const retired = await c.retire(registered.id, 'superseded');
  assert.equal(retired.status, 'retired');
  assert.equal(lastRequest().path, `/api/agents/${registered.id}/retire`);
  assert.deepEqual(lastRequest().body, { reason: 'superseded' });
});

test('lifecycle: clone starts idle with copied config', async () => {
  const c = client();
  const registered = await c.register({
    name: 'source-agent',
    department: 'research',
    provider: 'ollama',
    model: 'llama3.2',
  });
  assert.equal(registered.department, 'research');

  const cloned = await c.clone(registered.id, 'source-agent-v2');
  assert.equal(cloned.status, 'idle');
  assert.equal(cloned.name, 'source-agent-v2');
  assert.equal(cloned.department, registered.department);
  assert.equal(cloned.provider, registered.provider);
  assert.equal(cloned.model, registered.model);
  assert.notEqual(cloned.id, registered.id);
  assert.equal(lastRequest().path, `/api/agents/${registered.id}/clone`);
  assert.deepEqual(lastRequest().body, { name: 'source-agent-v2' });
});

test('lifecycle: 409 on illegal terminal transitions; 404 on unknown agent', async () => {
  const c = client();
  const registered = await c.register({ name: 'terminal-agent', department: 'ops' });
  await c.retire(registered.id);

  await assert.rejects(
    () => c.pause(registered.id),
    (e) => e instanceof ShamarError && e.status === 409,
  );
  await assert.rejects(
    () => c.resume(registered.id),
    (e) => e instanceof ShamarError && e.status === 409,
  );

  await assert.rejects(
    () => c.pause('missing'),
    (e) => e instanceof ShamarError && e.status === 404,
  );
  await assert.rejects(
    () => c.clone('missing'),
    (e) => e instanceof ShamarError && e.status === 404,
  );
});
