#!/usr/bin/env node
/**
 * Shamar demo-data seeder — registers a small demo workforce and backfills
 * realistic activity via the @shamar/sdk client, so the dashboard has
 * something to show right after `npm run dev`.
 *
 * Usage:
 *   SHAMAR_API_KEY=... node scripts/seed-demo.js [base-url] [api-key]
 *   # or: AGENTOS_DEV_API_KEY=... node scripts/seed-demo.js
 *
 * Idempotent: agents/providers are matched by name and reused; each run
 * appends a fresh round of recent events so the dashboard "recent activity"
 * stays fresh. Event timestamps are spread over the last ~2 days; costs are
 * never asserted (server keeps cost_usd NULL per ADR-0003).
 */
const path = require('node:path');

const BASE_URL = process.argv[2] || process.env.SHAMAR_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000';
const API_KEY = process.argv[3] || process.env.SHAMAR_API_KEY || process.env.AGENTOS_DEV_API_KEY || '';
if (!API_KEY) {
  console.error('Missing API key: set SHAMAR_API_KEY (or AGENTOS_DEV_API_KEY), or pass it as argv[2].');
  process.exit(1);
}

const sdkPath = path.join(__dirname, '..', 'packages', 'sdk', 'dist', 'index.js');
let ShamarClient;
try {
  ({ ShamarClient } = require(sdkPath));
} catch {
  console.error(`SDK build not found at ${sdkPath} — run \`npm run build\` first.`);
  process.exit(1);
}

const client = new ShamarClient({ baseUrl: BASE_URL, apiKey: API_KEY });

const isoMinutesAgo = (mins) => new Date(Date.now() - mins * 60_000).toISOString();

const AGENTS = [
  {
    name: 'Support Responder',
    description: 'Triages inbound support tickets and drafts first replies',
    department: 'Support',
    owner: 'ops-demo',
    provider: 'ollama-local',
    model: 'llama3.1:8b',
    status: 'active',
    tools: ['ticket_read', 'knowledge_search'],
    permissions: ['read:tickets'],
    autonomy_level: 1,
  },
  {
    name: 'SDR Prospector',
    description: 'Researches target accounts and drafts outreach sequences',
    department: 'Sales',
    owner: 'sales-demo',
    provider: 'openrouter',
    model: 'openai/gpt-4o-mini',
    status: 'active',
    tools: ['web_search', 'crm_lookup'],
    permissions: ['read:crm'],
    autonomy_level: 2,
  },
  {
    name: 'Research Analyst',
    description: 'Summarizes documents and extracts key findings',
    department: 'Research',
    owner: 'ops-demo',
    provider: 'ollama-local',
    model: 'qwen3:8b',
    status: 'active',
    tools: ['doc_parse', 'web_search'],
    permissions: ['read:docs'],
    autonomy_level: 2,
  },
  {
    name: 'Invoice Watcher',
    description: 'Watches AP inbox and flags invoices that need approval',
    department: 'Finance',
    owner: 'finance-demo',
    provider: 'openai-byok',
    model: 'gpt-4o-mini',
    status: 'idle',
    tools: ['email_read'],
    permissions: ['read:inbox'],
    autonomy_level: 1,
  },
];

const PROVIDERS = [
  { kind: 'ollama', name: 'Local Ollama', base_url: 'http://localhost:11434' },
];

/** Backfilled task cycles: [dayOffsetMinutes, title, tokensIn, tokensOut, durationMs, failed?] */
const WORK_CYCLES = [
  ['Q3 support backlog triage', 1840, 320, 42000, false],
  ['Draft replies for 12 tickets', 2310, 640, 61000, false],
  ['Weekend coverage report', 960, 180, 18000, true],
];

async function raw(method, p, body) {
  const res = await fetch(`${BASE_URL}${p}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function ensureAgents() {
  const existing = await client.listAgents();
  const out = [];
  for (const spec of AGENTS) {
    const found = existing.find((a) => a.name === spec.name);
    if (found) {
      console.log(`agent (reused): ${found.name} ${found.id}`);
      out.push(found);
    } else {
      const agent = await client.register(spec);
      await client.event({ agent_id: agent.id, type: 'agent.created', summary: `Agent registered: ${spec.name}` });
      console.log(`agent (registered): ${agent.name} ${agent.id}`);
      out.push(agent);
    }
  }
  return out;
}

async function ensureProviders() {
  const { providers } = await raw('GET', '/api/providers');
  for (const spec of PROVIDERS) {
    if (providers.some((p) => p.name === spec.name)) {
      console.log(`provider (reused): ${spec.name}`);
    } else {
      const { provider } = await raw('POST', '/api/providers', spec);
      console.log(`provider (registered): ${provider.name} ${provider.id}`);
    }
  }
}

function backfillFor(agent, startMinsAgo) {
  const events = [
    { agent_id: agent.id, type: 'agent.started', summary: 'Agent started', occurred_at: isoMinutesAgo(startMinsAgo) },
  ];
  let t = startMinsAgo;
  for (const [title, tokIn, tokOut, durMs, failed] of WORK_CYCLES) {
    t -= 25;
    events.push({ agent_id: agent.id, type: 'task.started', summary: `Task started: ${title}`, occurred_at: isoMinutesAgo(t) });
    t -= 4;
    events.push({
      agent_id: agent.id, type: 'model.called', summary: `${agent.model} answered for ${title}`,
      data: { model: agent.model }, tokens_in: tokIn, tokens_out: tokOut, duration_ms: Math.round(durMs * 0.6),
      occurred_at: isoMinutesAgo(t),
    });
    t -= 3;
    events.push({
      agent_id: agent.id, type: 'tool.called', summary: `tool.called: ${agent.tools?.[0] ?? 'web_search'} for ${title}`,
      data: { tool: agent.tools?.[0] ?? 'web_search' }, duration_ms: Math.round(durMs * 0.3),
      occurred_at: isoMinutesAgo(t),
    });
    t -= 2;
    events.push({
      agent_id: agent.id, type: failed ? 'task.failed' : 'task.completed',
      summary: failed ? `Task failed: ${title}` : `Task completed: ${title}`,
      data: failed ? { error: 'rate limit from provider' } : undefined,
      duration_ms: durMs, occurred_at: isoMinutesAgo(t),
    });
  }
  return events;
}

async function main() {
  const agents = await ensureAgents();
  await ensureProviders();

  // 1. Backfilled history (older activity so dashboards show a timeline).
  const backfill = [];
  agents.forEach((agent, i) => {
    backfill.push(...backfillFor(agent, 2 * 24 * 60 - i * 90)); // ~2 days ago, staggered
  });
  for (let i = 0; i < backfill.length; i += 50) {
    await client.eventsBatch(backfill.slice(i, i + 50));
  }
  console.log(`backfilled events: ${backfill.length}`);

  // 2. Fresh round of activity (within the last few minutes — dashboard's 24h view).
  const recent = [];
  for (const agent of agents.slice(0, 3)) {
    recent.push(
      { agent_id: agent.id, type: 'agent.started', summary: 'Agent started', occurred_at: isoMinutesAgo(6) },
      { agent_id: agent.id, type: 'task.started', summary: 'Task started: demo warm-up task', occurred_at: isoMinutesAgo(4) },
      {
        agent_id: agent.id, type: 'model.called', summary: `${agent.model} answered demo warm-up task`,
        data: { model: agent.model }, tokens_in: 640, tokens_out: 210, duration_ms: 9400,
        occurred_at: isoMinutesAgo(2),
      },
      { agent_id: agent.id, type: 'task.completed', summary: 'Task completed: demo warm-up task', duration_ms: 12300, occurred_at: isoMinutesAgo(1) },
    );
  }
  await client.eventsBatch(recent);
  console.log(`recent events: ${recent.length}`);

  // 3. Heartbeats (updates last_check_in on the agent detail page).
  for (const agent of agents) await client.heartbeat(agent.id);
  console.log(`heartbeats sent: ${agents.length}`);

  // 4. Sanity check via the read APIs.
  const summary = await client.dashboardSummary();
  const details = await Promise.all(agents.map((a) => client.getAgentDetail(a.id)));
  const totalEvents = details.reduce((n, d) => n + d.usage.events_total, 0);
  console.log(
    `verify: ${summary.total_agents} agents, ${summary.events_last_24h} events/24h, ` +
    `${totalEvents} total events across detail views`,
  );
  for (const d of details) {
    if (d.usage.events_total === 0) throw new Error(`no events recorded for ${d.agent.name}`);
  }
  console.log('seed complete.');
}

main().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});
