/**
 * Storage layer (ADR-0002).
 *
 * The API depends on this narrow `Storage` interface, not on a driver.
 * Default implementation: SQLite via Node's built-in node:sqlite (zero deps, zero cost).
 * Set DATABASE_URL to switch to Postgres later (not yet implemented — interface is ready).
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  Agent,
  AgentDetail,
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentInput,
  AgentStatus,
  DashboardSummary,
  EventActor,
  Provider,
  ProviderInput,
} from '@control-plane/types';
import { KNOWN_EVENT_TYPES } from '@control-plane/types';

export interface Storage {
  // agents
  listAgents(): Agent[];
  getAgent(id: string): Agent | null;
  createAgent(input: AgentInput): Agent;
  updateAgent(id: string, patch: Partial<AgentInput> & { status?: AgentStatus }): Agent | null;
  deleteAgent(id: string): boolean;
  heartbeat(id: string): Agent | null;
  // agent detail
  getAgentDetail(id: string): AgentDetail | null;
  // events
  appendEvent(input: AgentEventInput): AgentEvent;
  /**
   * Server-side event append (internal use only, never exposed via /api/events).
   * Unlike appendEvent, the server may set cost_usd when it is known by
   * definition — e.g. 0 for local Ollama inference, which has no provider
   * charge. Client-asserted costs are never accepted (ADR-0003).
   */
  appendServerEvent(input: {
    agent_id: string;
    type: string;
    actor?: EventActor;
    summary?: string;
    data?: Record<string, unknown>;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    duration_ms?: number | null;
  }): AgentEvent;
  queryEvents(opts: { agent_id?: string; type?: string; limit?: number }): AgentEvent[];
  // providers
  listProviders(): Provider[];
  getProvider(id: string): Provider | null;
  createProvider(input: ProviderInput): Provider;
  /** Record a health-check outcome; updates status + last_health_check. */
  setProviderStatus(id: string, status: Provider['status']): Provider | null;
  // dashboard
  dashboardSummary(): DashboardSummary;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  supervisor_agent_id TEXT,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idle',
  tools TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '[]',
  budget_monthly_usd REAL,
  autonomy_level INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'agent',
  summary TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, occurred_at DESC);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT,
  has_credential INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_health_check TEXT,
  created_at TEXT NOT NULL
);
`;

const now = () => new Date().toISOString();

function rowToAgent(r: Record<string, unknown>): Agent {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    department: r.department as string,
    owner: r.owner as string,
    supervisor_agent_id: (r.supervisor_agent_id as string) ?? null,
    provider: r.provider as string,
    model: r.model as string,
    status: r.status as AgentStatus,
    tools: JSON.parse(r.tools as string) as string[],
    permissions: JSON.parse(r.permissions as string) as string[],
    budget_monthly_usd: (r.budget_monthly_usd as number) ?? null,
    autonomy_level: r.autonomy_level as Agent['autonomy_level'],
    last_heartbeat_at: (r.last_heartbeat_at as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    metadata: {},
  };
}

function rowToEvent(r: Record<string, unknown>): AgentEvent {
  return {
    id: r.id as string,
    agent_id: r.agent_id as string,
    type: r.type as AgentEventType,
    occurred_at: r.occurred_at as string,
    actor: r.actor as EventActor,
    summary: r.summary as string,
    data: JSON.parse(r.data as string) as Record<string, unknown>,
    tokens_in: (r.tokens_in as number) ?? null,
    tokens_out: (r.tokens_out as number) ?? null,
    cost_usd: (r.cost_usd as number) ?? null,
    duration_ms: (r.duration_ms as number) ?? null,
  };
}

const VALID_STATUSES: AgentStatus[] = ['active', 'idle', 'paused', 'retired', 'error'];

export class SqliteStorage implements Storage {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  listAgents(): Agent[] {
    return (this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(rowToAgent);
  }

  getAgent(id: string): Agent | null {
    const r = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? rowToAgent(r) : null;
  }

  createAgent(input: AgentInput): Agent {
    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      throw new ValidationError('name is required');
    }
    const status = input.status ?? 'idle';
    if (!VALID_STATUSES.includes(status)) throw new ValidationError(`invalid status: ${status}`);
    const autonomy = input.autonomy_level ?? 0;
    if (!Number.isInteger(autonomy) || autonomy < 0 || autonomy > 5) {
      throw new ValidationError('autonomy_level must be an integer 0-5');
    }
    if (input.supervisor_agent_id && !this.getAgent(input.supervisor_agent_id)) {
      throw new ValidationError('supervisor_agent_id does not reference an existing agent');
    }
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO agents (id, name, description, department, owner, supervisor_agent_id, provider, model, status, tools, permissions, budget_monthly_usd, autonomy_level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        input.description ?? '',
        input.department ?? '',
        input.owner ?? '',
        input.supervisor_agent_id ?? null,
        input.provider ?? '',
        input.model ?? '',
        status,
        JSON.stringify(input.tools ?? []),
        JSON.stringify(input.permissions ?? []),
        input.budget_monthly_usd ?? null,
        autonomy,
        ts,
        ts,
      );
    const agent = this.getAgent(id) as Agent;
    // Record creation in the audit trail (ADR-0003: events are the audit log).
    this.appendEventInternal({ agent_id: id, type: 'agent.created', actor: 'system', summary: `Agent created: ${agent.name}` });
    return { ...agent, metadata: input.metadata ?? {} };
  }

  updateAgent(id: string, patch: Partial<AgentInput> & { status?: AgentStatus }): Agent | null {
    const existing = this.getAgent(id);
    if (!existing) return null;
    if (patch.status !== undefined && !VALID_STATUSES.includes(patch.status)) {
      throw new ValidationError(`invalid status: ${patch.status}`);
    }
    if (patch.autonomy_level !== undefined && (!Number.isInteger(patch.autonomy_level) || patch.autonomy_level < 0 || patch.autonomy_level > 5)) {
      throw new ValidationError('autonomy_level must be an integer 0-5');
    }
    const sets: string[] = [];
    const vals: SQLInputValue[] = [];
    const set = (col: string, v: SQLInputValue) => { sets.push(`${col} = ?`); vals.push(v); };
    if (patch.name !== undefined) set('name', patch.name);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.department !== undefined) set('department', patch.department);
    if (patch.owner !== undefined) set('owner', patch.owner);
    if (patch.supervisor_agent_id !== undefined) set('supervisor_agent_id', patch.supervisor_agent_id);
    if (patch.provider !== undefined) set('provider', patch.provider);
    if (patch.model !== undefined) set('model', patch.model);
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.tools !== undefined) set('tools', JSON.stringify(patch.tools));
    if (patch.permissions !== undefined) set('permissions', JSON.stringify(patch.permissions));
    if (patch.budget_monthly_usd !== undefined) set('budget_monthly_usd', patch.budget_monthly_usd);
    if (patch.autonomy_level !== undefined) set('autonomy_level', patch.autonomy_level);
    set('updated_at', now());
    vals.push(id);
    this.db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return this.getAgent(id);
  }

  deleteAgent(id: string): boolean {
    const r = this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return Number(r.changes) > 0;
  }

  heartbeat(id: string): Agent | null {
    const agent = this.getAgent(id);
    if (!agent) return null;
    const ts = now();
    this.db.prepare('UPDATE agents SET last_heartbeat_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id);
    this.appendEventInternal({ agent_id: id, type: 'agent.heartbeat', actor: 'agent', summary: 'Heartbeat' });
    return this.getAgent(id);
  }

  getAgentDetail(id: string): AgentDetail | null {
    const agent = this.getAgent(id);
    if (!agent) return null;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS events_total,
                COALESCE(SUM(tokens_in), 0) AS tokens_in_total,
                COALESCE(SUM(tokens_out), 0) AS tokens_out_total,
                COALESCE(SUM(CASE WHEN type = 'model.called' THEN 1 ELSE 0 END), 0) AS model_calls,
                COALESCE(SUM(CASE WHEN type IN ('tool.called', 'tool.completed') THEN 1 ELSE 0 END), 0) AS tool_calls,
                COALESCE(SUM(CASE WHEN type = 'task.completed' THEN 1 ELSE 0 END), 0) AS tasks_completed,
                COALESCE(SUM(CASE WHEN type = 'task.failed' THEN 1 ELSE 0 END), 0) AS tasks_failed,
                MIN(occurred_at) AS first_seen_at,
                MAX(occurred_at) AS last_event_at
         FROM events WHERE agent_id = ?`,
      )
      .get(id) as Record<string, unknown>;
    const last24 = this.db
      .prepare('SELECT COUNT(*) AS c FROM events WHERE agent_id = ? AND occurred_at >= ?')
      .get(id, dayAgo) as { c: number };
    const byType = this.db
      .prepare('SELECT type, COUNT(*) AS c FROM events WHERE agent_id = ? GROUP BY type')
      .all(id) as Array<{ type: string; c: number }>;
    const events_by_type: AgentDetail['usage']['events_by_type'] = {};
    for (const row of byType) events_by_type[row.type as AgentEventType] = Number(row.c);
    const recent = this.db
      .prepare('SELECT * FROM events WHERE agent_id = ? ORDER BY occurred_at DESC, rowid DESC LIMIT 50')
      .all(id) as Record<string, unknown>[];
    return {
      agent,
      last_check_in: agent.last_heartbeat_at,
      usage: {
        events_total: Number(totals.events_total),
        events_last_24h: Number(last24.c),
        events_by_type,
        tokens_in_total: Number(totals.tokens_in_total),
        tokens_out_total: Number(totals.tokens_out_total),
        model_calls: Number(totals.model_calls),
        tool_calls: Number(totals.tool_calls),
        tasks_completed: Number(totals.tasks_completed),
        tasks_failed: Number(totals.tasks_failed),
        first_seen_at: (totals.first_seen_at as string) ?? null,
        last_event_at: (totals.last_event_at as string) ?? null,
      },
      recent_events: recent.map(rowToEvent),
    };
  }

  private appendEventInternal(input: {
    agent_id: string;
    type: string;
    actor?: EventActor;
    summary?: string;
    data?: Record<string, unknown>;
    tokens_in?: number | null;
    tokens_out?: number | null;
    /** Internal-only: set only when cost is known by definition (e.g. 0 for local inference). */
    cost_usd?: number | null;
    duration_ms?: number | null;
    occurred_at?: string;
  }): AgentEvent {
    if (!(KNOWN_EVENT_TYPES as readonly string[]).includes(input.type)) {
      throw new ValidationError(
        `unknown event type: ${input.type}. Known types: ${KNOWN_EVENT_TYPES.join(', ')}`,
      );
    }
    const id = randomUUID();
    const occurred_at = input.occurred_at ?? now();
    this.db
      .prepare(
        `INSERT INTO events (id, agent_id, type, occurred_at, actor, summary, data, tokens_in, tokens_out, cost_usd, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.agent_id,
        input.type,
        occurred_at,
        input.actor ?? 'agent',
        input.summary ?? '',
        JSON.stringify(input.data ?? {}),
        input.tokens_in ?? null,
        input.tokens_out ?? null,
        input.cost_usd ?? null,
        input.duration_ms ?? null,
      );
    // cost_usd defaults to NULL: unknown costs are recorded as unknown, never
    // guessed (ADR-0003). Server-side pricing tables land in Phase 3 (ADR-0004).
    const r = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown>;
    return rowToEvent(r);
  }

  appendEvent(input: AgentEventInput): AgentEvent {
    if (!this.getAgent(input.agent_id)) throw new ValidationError(`unknown agent_id: ${input.agent_id}`);
    return this.appendEventInternal(input);
  }

  appendServerEvent(input: {
    agent_id: string;
    type: string;
    actor?: EventActor;
    summary?: string;
    data?: Record<string, unknown>;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    duration_ms?: number | null;
  }): AgentEvent {
    if (!this.getAgent(input.agent_id)) throw new ValidationError(`unknown agent_id: ${input.agent_id}`);
    return this.appendEventInternal(input);
  }

  queryEvents(opts: { agent_id?: string; type?: string; limit?: number }): AgentEvent[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const conds: string[] = [];
    const vals: SQLInputValue[] = [];
    if (opts.agent_id) { conds.push('agent_id = ?'); vals.push(opts.agent_id); }
    if (opts.type) { conds.push('type = ?'); vals.push(opts.type); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(limit);
    return (
      this.db.prepare(`SELECT * FROM events ${where} ORDER BY occurred_at DESC LIMIT ?`).all(...vals) as Record<string, unknown>[]
    ).map(rowToEvent);
  }

  listProviders(): Provider[] {
    return (
      this.db.prepare('SELECT id, kind, name, base_url, has_credential, status, last_health_check, created_at FROM providers ORDER BY created_at DESC').all() as Record<string, unknown>[]
    ).map((r) => ({
      id: r.id as string,
      kind: r.kind as Provider['kind'],
      name: r.name as string,
      base_url: (r.base_url as string) ?? null,
      has_credential: Number(r.has_credential) === 1,
      status: r.status as Provider['status'],
      last_health_check: (r.last_health_check as string) ?? null,
      created_at: r.created_at as string,
    }));
  }

  createProvider(input: ProviderInput): Provider {
    if (!input.name?.trim()) throw new ValidationError('name is required');
    const validKinds = ['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'openai-compatible'];
    if (!validKinds.includes(input.kind)) throw new ValidationError(`invalid kind: ${input.kind}`);
    const id = randomUUID();
    // NOTE: v0.1 records only WHETHER a credential was supplied.
    // Secret storage (encrypted at rest, per-secret access) lands in Phase 4.
    this.db
      .prepare('INSERT INTO providers (id, kind, name, base_url, has_credential, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.kind, input.name.trim(), input.base_url ?? null, input.credential ? 1 : 0, 'unknown', now());
    return this.listProviders().find((p) => p.id === id) as Provider;
  }

  getProvider(id: string): Provider | null {
    return this.listProviders().find((p) => p.id === id) ?? null;
  }

  setProviderStatus(id: string, status: Provider['status']): Provider | null {
    if (!this.getProvider(id)) return null;
    this.db.prepare('UPDATE providers SET status = ?, last_health_check = ? WHERE id = ?').run(status, now(), id);
    return this.getProvider(id);
  }

  dashboardSummary(): DashboardSummary {
    const agents = this.listAgents();
    const byStatus = { active: 0, idle: 0, paused: 0, retired: 0, error: 0 } as Record<AgentStatus, number>;
    for (const a of agents) byStatus[a.status] += 1;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const eventsRow = this.db.prepare('SELECT COUNT(*) AS c FROM events WHERE occurred_at >= ?').get(dayAgo) as { c: number };
    const recent = (
      this.db.prepare('SELECT id, agent_id, type, occurred_at, summary FROM events ORDER BY occurred_at DESC LIMIT 10').all() as Record<string, unknown>[]
    ).map((r) => ({
      id: r.id as string,
      agent_id: r.agent_id as string,
      type: r.type as AgentEventType,
      occurred_at: r.occurred_at as string,
      summary: r.summary as string,
    }));
    return { total_agents: agents.length, active_agents: byStatus.active, agents_by_status: byStatus, events_last_24h: Number(eventsRow.c), recent_events: recent };
  }

  close(): void {
    this.db.close();
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Open a storage backend. DATABASE_URL (postgres) is reserved for the future; SQLite is the v0.1 path. */
export function openStorage(): Storage {
  if (process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is set but the Postgres backend is not implemented yet (see ADR-0002). Unset it to use SQLite.');
  }
  return new SqliteStorage(process.env.SQLITE_PATH ?? './data/control-plane.db');
}
