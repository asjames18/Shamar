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
  AgentBudgetState,
  AgentDetail,
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentInput,
  DepartmentBudgetState,
  DepartmentSummary,
  SetDepartmentBudgetInput,
  OrgAgentNode,
  OrgView,
  AgentStatus,
  ApprovalDecisionInput,
  ApprovalInput,
  ApprovalRequest,
  ApprovalStatus,
  AnalyticsSummary,
  AnalyticsBreakdownRow,
  AnalyticsTotals,
  AnalyticsValue,
  DashboardSummary,
  EventActor,
  Provider,
  ProviderInput,
} from '@control-plane/types';
import { KNOWN_EVENT_TYPES } from '@control-plane/types';

/**
 * Max `human_minutes_saved` accepted on a single event (ADR-0008).
 * 100 years of continuous wall-clock minutes: 100 * 365 * 24 * 60 = 52_560_000.
 * A single-task claim above a century of continuous human time is not credible;
 * the cap also keeps values well inside Number.MAX_SAFE_INTEGER so SQLite
 * integers cannot RangeError when node:sqlite marshals analytics aggregates.
 */
export const MAX_HUMAN_MINUTES_SAVED_PER_EVENT = 100 * 365 * 24 * 60; // 52_560_000


export interface Storage {
  // agents
  listAgents(): Agent[];
  getAgent(id: string): Agent | null;
  createAgent(input: AgentInput): Agent;
  updateAgent(id: string, patch: Partial<AgentInput> & { status?: AgentStatus }): Agent | null;
  deleteAgent(id: string): boolean;
  heartbeat(id: string): Agent | null;
  /**
   * Agent lifecycle transitions (Phase 5). pause/resume/retire move the
   * agent's status with server-side transition rules (retire is terminal);
   * a call that requests the status the agent already holds is an idempotent
   * no-op returning the agent unchanged. Each effective transition emits a
   * matching `agent.paused|resumed|retired` audit event on the agent's
   * timeline (ADR-0003: events are the audit log).
   *
   * Returns null when the agent does not exist; throws ValidationError for
   * a malformed `reason`; throws ConflictError when the transition is
   * disallowed from the current status.
   */
  lifecycleTransition(id: string, action: 'pause' | 'resume' | 'retire', reason?: unknown): Agent | null;
  /**
   * Clone an agent's configuration into a new idle agent (Phase 5). Copies
   * description, department, owner, supervisor_agent_id, provider, model,
   * tools, permissions, budget and autonomy level — never runtime state
   * (status, heartbeats, events). Emits `agent.cloned` on the new agent with
   * `data.source_agent_id`. Any status may be cloned; the source's config is
   * just a template.
   *
   * Returns null when the source agent does not exist; throws ValidationError
   * for a malformed `name` override.
   */
  cloneAgent(id: string, name?: unknown): Agent | null;
  // agent detail
  getAgentDetail(id: string): AgentDetail | null;
  // events
  appendEvent(input: AgentEventInput): AgentEvent;
  /**
   * Live budget meter for an agent, or null when it has no monthly budget.
   * Spend is the sum of real reported costs (cost_usd NOT NULL) this calendar
   * month — unknown costs stay out, never estimated (ADR-0003).
   */
  budgetState(agentId: string): AgentBudgetState | null;
  /**
   * Fire edge-triggered budget alerts (`budget.warning` at 80%, `budget.exceeded`
   * at 100%). Each alert is emitted at most once per calendar month. Safe to
   * call any time; no-op when the agent has no budget.
   */
  checkBudget(agentId: string): void;
  /**
   * Set or clear a department's monthly budget cap (Phase 4 governance,
   * ADR-0007). A null cap clears the budget; fired-alert months reset when a
   * new cap is set so the next cycle alerts again.
   */
  setDepartmentBudget(name: string, input: SetDepartmentBudgetInput): DepartmentBudgetState | null;
  /**
   * Live budget meter for a department's shared pool, or null when it has no
   * monthly budget. Spend is summed across member agents this calendar month —
   * only real reported costs (cost_usd NOT NULL); unknown costs stay out,
   * never estimated (ADR-0003).
   */
  departmentBudgetState(name: string): DepartmentBudgetState | null;
  /**
   * Every department derived from agents (plus any with a stored cap but
   * currently zero agents), with agent counts and budget meters.
   */
  listDepartments(): DepartmentSummary[];
  /**
   * The workforce as an org chart (Phase 5): departments with their agents,
   * unassigned agents, agent -> agent delegation links
   * (supervisor_agent_id), and human -> agent ownership rows. Read-only —
   * no schema changes, built from the agents table.
   */
  orgView(): OrgView;
  /**
   * Fire edge-triggered department budget alerts (`budget.warning` at 80%,
   * `budget.exceeded` at 100%). Each alert is emitted at most once per
   * calendar month; the alert is recorded on `triggeringAgentId`'s timeline
   * with `data.department` set, since events are agent-scoped (ADR-0007).
   * Safe to call any time; no-op when the department has no budget.
   */
  checkDepartmentBudget(department: string, triggeringAgentId: string): void;
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
  // approvals (Phase 4: human-in-the-loop governance)
  /** Record an approval request; emits approval.requested. */
  requestApproval(input: ApprovalInput): ApprovalRequest;
  getApproval(id: string): ApprovalRequest | null;
  listApprovals(opts: { agent_id?: string; status?: ApprovalStatus }): ApprovalRequest[];
  /**
   * Grant or deny a pending request; emits approval.granted/approval.denied.
   * Returns null when the request does not exist; throws ValidationError when
   * it was already decided (fail closed — no un-deciding, no double-deciding).
   */
  decideApproval(id: string, decision: ApprovalDecisionInput): ApprovalRequest | null;
  /** True when the agent has a granted approval decided within the trailing window (ADR-0006, L1 gate). */
  hasRecentGrant(agentId: string, windowMs: number): boolean;
  // analytics (Phase 6 first slice)
  /**
   * Cost + task metrics rolled up by agent, department, model, and provider.
   * Sums cost_usd only from known/non-null values (ADR-0003). Optional since
   * ISO lower bound; null/omit = all-time. Value block: explicit human_minutes_saved only (ADR-0008).
   */
  analyticsSummary(opts?: { since?: string | null; window?: AnalyticsSummary['window'] }): AnalyticsSummary;
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
  autonomy_level INTEGER NOT NULL DEFAULT 3,
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
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL DEFAULT 'agent',
  decided_by TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id, status);
-- Department budget caps (ADR-0007): one row per named department budget pool.
-- warning_fired_month / exceeded_fired_month hold 'YYYY-MM' of the last
-- edge-triggered alert, so each alert fires at most once per calendar month.
CREATE TABLE IF NOT EXISTS department_budgets (
  name TEXT PRIMARY KEY,
  budget_monthly_usd REAL,
  warning_fired_month TEXT,
  exceeded_fired_month TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const now = () => new Date().toISOString();

/** Normalize any parseable ISO timestamp to UTC Z form. Rejects garbage. */
function normalizeOccurredAt(value?: string): string {
  if (value === undefined || value === "") return now();
  const t = Date.parse(value);
  if (!Number.isFinite(t)) {
    throw new ValidationError('occurred_at must be a valid ISO timestamp');
  }
  return new Date(t).toISOString();
}

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

function rowToApproval(r: Record<string, unknown>): ApprovalRequest {
  return {
    id: r.id as string,
    agent_id: r.agent_id as string,
    title: r.title as string,
    detail: r.detail as string,
    status: r.status as ApprovalStatus,
    requested_by: r.requested_by as EventActor,
    decided_by: (r.decided_by as string) ?? null,
    requested_at: r.requested_at as string,
    decided_at: (r.decided_at as string) ?? null,
  };
}

const VALID_ACTORS: EventActor[] = ['agent', 'human', 'system'];
const VALID_APPROVAL_STATUSES: ApprovalStatus[] = ['pending', 'granted', 'denied'];

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
    const autonomy = input.autonomy_level ?? 3; // ADR-0006: new agents default to L3 (Standard)
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
    // Delegation guards (Phase 5): a supervisor assignment must reference a
    // real, different agent and must not close a delegation cycle — otherwise
    // the org view and L5 approval checks would follow a corrupt chain.
    // Clearing (null) is always allowed.
    if (patch.supervisor_agent_id !== undefined && patch.supervisor_agent_id !== null) {
      if (typeof patch.supervisor_agent_id !== 'string' || patch.supervisor_agent_id.trim() === '') {
        throw new ValidationError('supervisor_agent_id must be an agent id or null');
      }
      if (patch.supervisor_agent_id === id) {
        throw new ValidationError('an agent cannot supervise itself');
      }
      const target = this.getAgent(patch.supervisor_agent_id);
      if (!target) {
        throw new ValidationError('supervisor_agent_id does not reference an existing agent');
      }
      // Walk the target's supervisor chain; if it leads back to this agent,
      // the assignment would create a cycle.
      const seen = new Set<string>([id]);
      let cursor: string | null = target.supervisor_agent_id;
      while (cursor) {
        if (seen.has(cursor)) {
          throw new ValidationError('supervisor assignment would create a delegation cycle');
        }
        seen.add(cursor);
        const next = this.getAgent(cursor);
        cursor = next ? next.supervisor_agent_id : null;
      }
    }
    const sets: string[] = [];
    const vals: SQLInputValue[] = [];
    const set = (col: string, v: SQLInputValue) => { sets.push(`${col} = ?`); vals.push(v); };
    if (patch.name !== undefined) set('name', patch.name);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.department !== undefined) set('department', patch.department);
    if (patch.owner !== undefined) set('owner', patch.owner);
    if (patch.supervisor_agent_id !== undefined) set('supervisor_agent_id', patch.supervisor_agent_id);
    if (patch.provider !== undefined) set('provider', patch.provider);    if (patch.model !== undefined) set('model', patch.model);
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.tools !== undefined) set('tools', JSON.stringify(patch.tools));
    if (patch.permissions !== undefined) set('permissions', JSON.stringify(patch.permissions));
    if (patch.budget_monthly_usd !== undefined) set('budget_monthly_usd', patch.budget_monthly_usd);
    if (patch.autonomy_level !== undefined) set('autonomy_level', patch.autonomy_level);
    set('updated_at', now());
    vals.push(id);
    this.db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    const updated = this.getAgent(id) as Agent;
    // Audit delegation changes in the event trail (ADR-0003: events are the
    // audit log). Only fires when the delegation actually changed.
    const supChanged =
      patch.supervisor_agent_id !== undefined &&
      (patch.supervisor_agent_id ?? null) !== (existing.supervisor_agent_id ?? null);
    const ownerChanged =
      patch.owner !== undefined && (patch.owner || null) !== (existing.owner || null);
    if (supChanged || ownerChanged) {
      const parts: string[] = [];
      if (supChanged) {
        parts.push(`supervisor ${existing.supervisor_agent_id ?? 'none'} → ${updated.supervisor_agent_id ?? 'none'}`);
      }
      if (ownerChanged) {
        parts.push(`owner ${existing.owner || 'none'} → ${updated.owner || 'none'}`);
      }
      this.appendEventInternal({
        agent_id: id,
        type: 'agent.delegated',
        actor: 'human',
        summary: `Delegation changed for ${updated.name}: ${parts.join('; ')}`,
        data: {
          supervisor_from: existing.supervisor_agent_id,
          supervisor_to: updated.supervisor_agent_id,
          owner_from: existing.owner || null,
          owner_to: updated.owner || null,
        },
      });
    }
    return updated;
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

  lifecycleTransition(id: string, action: 'pause' | 'resume' | 'retire', reason?: unknown): Agent | null {
    const agent = this.getAgent(id);
    if (!agent) return null;
    if (reason !== undefined && (typeof reason !== 'string' || reason.trim() === '' || reason.length > 280)) {
      throw new ValidationError('reason must be a non-empty string of at most 280 characters');
    }
    const from = agent.status;
    // Transition table: retire is terminal; resume only un-pauses; pause
    // works from any live running state. Already-in-state is an idempotent
    // no-op (no duplicate audit event).
    const plan: { target: AgentStatus; event: 'agent.paused' | 'agent.resumed' | 'agent.retired' } | null =
      action === 'pause'
        ? from === 'paused'
          ? null
          : from === 'retired'
            ? (() => { throw new ConflictError('cannot pause a retired agent — retire is terminal; clone it to start over'); })()
            : { target: 'paused', event: 'agent.paused' }
        : action === 'resume'
          ? from === 'paused'
            ? { target: 'active', event: 'agent.resumed' }
            : from === 'retired'
              ? (() => { throw new ConflictError('cannot resume a retired agent — retire is terminal; clone it to start over'); })()
              : from === 'error'
                ? (() => { throw new ConflictError('cannot resume an agent in error state — clear it with a heartbeat or a new run first'); })()
                : null
          : // retire
            from === 'retired'
            ? null
            : { target: 'retired', event: 'agent.retired' };
    if (!plan) return agent;
    this.db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?').run(plan.target, now(), id);
    const summaries = {
      'agent.paused': `Agent paused: ${agent.name}`,
      'agent.resumed': `Agent resumed: ${agent.name}`,
      'agent.retired': `Agent retired: ${agent.name}`,
    } as const;
    this.appendEventInternal({
      agent_id: id,
      type: plan.event,
      actor: 'system',
      summary: summaries[plan.event],
      data: { from_status: from, to_status: plan.target, ...(reason !== undefined ? { reason: (reason as string).trim() } : {}) },
    });
    return this.getAgent(id);
  }

  cloneAgent(id: string, name?: unknown): Agent | null {
    const source = this.getAgent(id);
    if (!source) return null;
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      throw new ValidationError('name must be a non-empty string');
    }
    const cloneName = name !== undefined ? name.trim() : `${source.name} (copy)`;
    const newId = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO agents (id, name, description, department, owner, supervisor_agent_id, provider, model, status, tools, permissions, budget_monthly_usd, autonomy_level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId,
        cloneName,
        source.description,
        source.department,
        source.owner,
        source.supervisor_agent_id,
        source.provider,
        source.model,
        JSON.stringify(source.tools),
        JSON.stringify(source.permissions),
        source.budget_monthly_usd,
        source.autonomy_level,
        ts,
        ts,
      );
    this.appendEventInternal({
      agent_id: newId,
      type: 'agent.cloned',
      actor: 'system',
      summary: `Agent cloned from ${source.name}`,
      data: { source_agent_id: source.id, source_name: source.name },
    });
    return this.getAgent(newId);
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
      pending_approvals: this.listApprovals({ agent_id: id, status: 'pending' }),
      budget: this.budgetState(id),
      department_budget: agent.department ? this.departmentBudgetState(agent.department) : null,
    };
  }

  private monthStart(): string {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  /** Real reported spend (cost_usd IS NOT NULL) for an agent since the given ISO time. */
  spendSince(agentId: string, sinceIso: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS spend FROM events
         WHERE agent_id = ? AND occurred_at >= ? AND cost_usd IS NOT NULL`,
      )
      .get(agentId, sinceIso) as { spend: number };
    return Number(row.spend);
  }

  budgetState(agentId: string): AgentBudgetState | null {
    const agent = this.getAgent(agentId);
    if (!agent || agent.budget_monthly_usd == null) return null;
    const limit = Number(agent.budget_monthly_usd);
    if (!Number.isFinite(limit) || limit < 0) return null;
    const spend = this.spendSince(agentId, this.monthStart());
    if (limit === 0) {
      // A $0 budget means "spend nothing": any spend (or the mere cap) is exceeded.
      return { limit_usd: 0, spend_month_usd: spend, pct_used: 1, status: 'exceeded' };
    }
    const pct = spend / limit;
    return {
      limit_usd: limit,
      spend_month_usd: spend,
      pct_used: pct,
      status: pct >= 1 ? 'exceeded' : pct >= 0.8 ? 'warning' : 'ok',
    };
  }

  checkBudget(agentId: string): void {
    const state = this.budgetState(agentId);
    if (!state) return;
    const since = this.monthStart();
    const alerted = (type: string) =>
      (
        this.db
          .prepare(`SELECT COUNT(*) AS c FROM events WHERE agent_id = ? AND type = ? AND occurred_at >= ?`)
          .get(agentId, type, since) as { c: number }
      ).c > 0;
    const summaryOf = (verb: string) =>
      `Monthly budget ${verb}: $${state.spend_month_usd.toFixed(2)} of $${state.limit_usd.toFixed(2)} spent (${Math.round(state.pct_used * 100)}%)`;
    const data = { limit_usd: state.limit_usd, spend_month_usd: state.spend_month_usd, pct_used: state.pct_used };
    if (state.status === 'exceeded') {
      if (!alerted('budget.exceeded')) {
        this.appendEventInternal({ agent_id: agentId, type: 'budget.exceeded', actor: 'system', summary: summaryOf('exceeded'), data });
      }
      return;
    }
    if (state.status === 'warning' && !alerted('budget.warning') && !alerted('budget.exceeded')) {
      this.appendEventInternal({ agent_id: agentId, type: 'budget.warning', actor: 'system', summary: summaryOf('warning'), data });
    }
  }

  // --- department budgets (ADR-0007) ----------------------------------------

  /** 'YYYY-MM' in UTC for edge-trigger dedup. */
  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  setDepartmentBudget(name: string, input: SetDepartmentBudgetInput): DepartmentBudgetState | null {
    const trimmed = name.trim();
    if (!trimmed) throw new ValidationError('department name must not be empty');
    const cap = input.budget_monthly_usd;
    if (cap != null && (!Number.isFinite(cap) || cap < 0)) {
      throw new ValidationError('budget_monthly_usd must be a finite, non-negative number or null');
    }
    if (cap == null) {
      this.db.prepare('DELETE FROM department_budgets WHERE name = ?').run(trimmed);
      return null;
    }
    const existing = this.db
      .prepare('SELECT name FROM department_budgets WHERE name = ?')
      .get(trimmed) as { name: string } | undefined;
    if (existing) {
      // Reset fired-alert months: a newly set cap starts a fresh alert cycle.
      this.db
        .prepare(
          `UPDATE department_budgets
           SET budget_monthly_usd = ?, warning_fired_month = NULL, exceeded_fired_month = NULL, updated_at = ?
           WHERE name = ?`,
        )
        .run(cap, now(), trimmed);
    } else {
      this.db
        .prepare(
          `INSERT INTO department_budgets (name, budget_monthly_usd, warning_fired_month, exceeded_fired_month, created_at, updated_at)
           VALUES (?, ?, NULL, NULL, ?, ?)`,
        )
        .run(trimmed, cap, now(), now());
    }
    return this.departmentBudgetState(trimmed);
  }

  /** Real reported spend across a department's member agents since the given ISO time. */
  private departmentSpendSince(department: string, sinceIso: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(e.cost_usd), 0) AS spend FROM events e
         JOIN agents a ON a.id = e.agent_id
         WHERE a.department = ? AND e.occurred_at >= ? AND e.cost_usd IS NOT NULL`,
      )
      .get(department, sinceIso) as { spend: number };
    return Number(row.spend);
  }

  departmentBudgetState(name: string): DepartmentBudgetState | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const row = this.db
      .prepare('SELECT * FROM department_budgets WHERE name = ?')
      .get(trimmed) as Record<string, unknown> | undefined;
    if (!row || row.budget_monthly_usd == null) return null;
    const limit = Number(row.budget_monthly_usd);
    if (!Number.isFinite(limit) || limit < 0) return null;
    const spend = this.departmentSpendSince(trimmed, this.monthStart());
    const agent_count = (
      this.db.prepare('SELECT COUNT(*) AS c FROM agents WHERE department = ?').get(trimmed) as { c: number }
    ).c;
    if (limit === 0) {
      // A $0 budget means "spend nothing": any spend (or the mere cap) is exceeded.
      return { department: trimmed, limit_usd: 0, spend_month_usd: spend, agent_count, pct_used: 1, status: 'exceeded' };
    }
    const pct = spend / limit;
    return {
      department: trimmed,
      limit_usd: limit,
      spend_month_usd: spend,
      agent_count,
      pct_used: pct,
      status: pct >= 1 ? 'exceeded' : pct >= 0.8 ? 'warning' : 'ok',
    };
  }

  listDepartments(): DepartmentSummary[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT department AS name FROM agents WHERE department != ''
         UNION
         SELECT name FROM department_budgets
         ORDER BY name ASC`,
      )
      .all() as { name: string }[];
    return rows.map((r) => ({
      name: r.name,
      agent_count: (
        this.db.prepare('SELECT COUNT(*) AS c FROM agents WHERE department = ?').get(r.name) as { c: number }
      ).c,
      budget: this.departmentBudgetState(r.name),
    }));
  }

  orgView(): OrgView {
    const agents = this.listAgents();
    const byId = new Map(agents.map((a) => [a.id, a]));
    const node = (a: Agent): OrgAgentNode => ({
      id: a.id,
      name: a.name,
      status: a.status,
      owner: a.owner,
      autonomy_level: a.autonomy_level,
      supervisor_agent_id: a.supervisor_agent_id,
    });

    const byDepartment = new Map<string, OrgAgentNode[]>();
    const unassigned: OrgAgentNode[] = [];
    for (const a of agents) {
      const n = node(a);
      if (a.department) {
        if (!byDepartment.has(a.department)) byDepartment.set(a.department, []);
        byDepartment.get(a.department)!.push(n);
      } else {
        unassigned.push(n);
      }
    }
    const sortNodes = (ns: OrgAgentNode[]) =>
      ns.sort((x, y) => x.name.localeCompare(y.name));

    // Departments: every department that has agents, plus any that has a
    // stored budget cap but currently zero agents (so the org chart stays
    // truthful about configured pools).
    const names = new Set([...byDepartment.keys(), ...this.listDepartments().map((d) => d.name)]);
    const departments = [...names].sort().map((name) => ({
      name,
      budget: this.departmentBudgetState(name),
      agents: sortNodes(byDepartment.get(name) ?? []),
    }));

    const delegation = agents
      .filter((a) => a.supervisor_agent_id)
      .map((a) => ({
        agent_id: a.id,
        agent_name: a.name,
        supervisor_agent_id: a.supervisor_agent_id!,
        supervisor_name: byId.get(a.supervisor_agent_id!)?.name ?? null,
      }))
      .sort((x, y) => x.agent_name.localeCompare(y.agent_name));

    const ownerIds = new Map<string, string[]>();
    for (const a of agents) {
      if (!a.owner) continue;
      if (!ownerIds.has(a.owner)) ownerIds.set(a.owner, []);
      ownerIds.get(a.owner)!.push(a.id);
    }
    const owners = [...ownerIds.entries()]
      .map(([owner, agent_ids]) => ({ owner, agent_ids }))
      .sort((x, y) => x.owner.localeCompare(y.owner));

    return { departments, unassigned: sortNodes(unassigned), delegation, owners };
  }

  checkDepartmentBudget(department: string, triggeringAgentId: string): void {
    const state = this.departmentBudgetState(department);
    if (!state) return;
    const row = this.db
      .prepare('SELECT warning_fired_month, exceeded_fired_month FROM department_budgets WHERE name = ?')
      .get(state.department) as
      | { warning_fired_month: string | null; exceeded_fired_month: string | null }
      | undefined;
    if (!row) return;
    const month = this.currentMonth();
    const summaryOf = (verb: string) =>
      `Department budget ${verb}: ${state.department} — $${state.spend_month_usd.toFixed(2)} of $${state.limit_usd.toFixed(2)} spent across ${state.agent_count} agent${state.agent_count === 1 ? '' : 's'} (${Math.round(state.pct_used * 100)}%)`;
    const data = {
      department: state.department,
      department_budget: true,
      limit_usd: state.limit_usd,
      spend_month_usd: state.spend_month_usd,
      pct_used: state.pct_used,
      agent_count: state.agent_count,
    };
    // Events are agent-scoped, so the department alert lands on the triggering
    // agent's timeline with data.department set (ADR-0007). Types are
    // department.*-namespaced so per-agent budget dedup can never see them.
    // No recursion: budget.* events never re-enter the model.called hook.
    if (state.status === 'exceeded') {
      if (row.exceeded_fired_month !== month) {
        this.appendEventInternal({ agent_id: triggeringAgentId, type: 'department.budget.exceeded', actor: 'system', summary: summaryOf('exceeded'), data });
        this.db
          .prepare('UPDATE department_budgets SET exceeded_fired_month = ?, updated_at = ? WHERE name = ?')
          .run(month, now(), state.department);
      }
      return;
    }
    if (state.status === 'warning' && row.warning_fired_month !== month && row.exceeded_fired_month !== month) {
      this.appendEventInternal({ agent_id: triggeringAgentId, type: 'department.budget.warning', actor: 'system', summary: summaryOf('warning'), data });
      this.db
        .prepare('UPDATE department_budgets SET warning_fired_month = ?, updated_at = ? WHERE name = ?')
        .run(month, now(), state.department);
    }
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
    // ADR-0005: self-reported costs are stored as reported data, not verified —
    // but they must be sane. A negative or non-finite cost would poison the
    // budget meter, so reject it loudly (400) instead of silently storing.
    if (input.cost_usd != null && (!Number.isFinite(input.cost_usd) || input.cost_usd < 0)) {
      throw new ValidationError('cost_usd must be a finite, non-negative number or null');
    }
    // ADR-0008: optional self-reported human_minutes_saved on event data.
    // Finite non-negative and <= MAX_HUMAN_MINUTES_SAVED_PER_EVENT when present;
    // invalid / oversized values rejected (same honesty as cost_usd). Cap keeps
    // SQLite integers inside the JS safe range so analytics aggregation cannot RangeError.
    if (input.data != null && Object.prototype.hasOwnProperty.call(input.data, 'human_minutes_saved')) {
      const mins = input.data['human_minutes_saved'];
      if (mins !== null && mins !== undefined) {
        if (
          typeof mins !== 'number' ||
          !Number.isFinite(mins) ||
          mins < 0 ||
          mins > MAX_HUMAN_MINUTES_SAVED_PER_EVENT
        ) {
          throw new ValidationError(
            `human_minutes_saved must be a finite, non-negative number <= ${MAX_HUMAN_MINUTES_SAVED_PER_EVENT} (max minutes / event; ADR-0008), or null`,
          );
        }
      }
    }
    const id = randomUUID();
    // Store UTC Z so since/window filters stay chronological even when clients
    // send offset ISOs. analyticsSummary also uses datetime() for defense-in-depth.
    const occurred_at = normalizeOccurredAt(input.occurred_at);
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
    // Budget accounting only ever sees real reported costs. When a model call
    // lands with a known cost, fire edge-triggered budget alerts (warning at
    // 80%, exceeded at 100%) — one pass, no recursion (checkBudget emits
    // budget.* events, never model.called).
    if (input.type === 'model.called' && input.cost_usd != null) {
      this.checkBudget(input.agent_id);
      // Department pools share the same trigger: the triggering agent's spend
      // can push its department over a cap (ADR-0007).
      const agent = this.getAgent(input.agent_id);
      if (agent?.department) this.checkDepartmentBudget(agent.department, input.agent_id);
    }
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

  // --- approvals ------------------------------------------------------
  // Phase 4 governance: human-in-the-loop approval requests. Every state
  // transition is recorded in the event trail (approval.requested /
  // approval.granted / approval.denied); a decided request can never be
  // undecided or decided twice.

  requestApproval(input: ApprovalInput): ApprovalRequest {
    if (!this.getAgent(input.agent_id)) throw new ValidationError(`unknown agent_id: ${input.agent_id}`);
    if (!input.title || typeof input.title !== 'string' || input.title.trim() === '') {
      throw new ValidationError('title is required');
    }
    const requested_by = input.requested_by ?? 'agent';
    if (!VALID_ACTORS.includes(requested_by)) throw new ValidationError(`invalid requested_by: ${requested_by}`);
    const id = randomUUID();
    const requested_at = now();
    this.db
      .prepare(
        `INSERT INTO approvals (id, agent_id, title, detail, status, requested_by, requested_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, input.agent_id, input.title.trim(), input.detail ?? '', requested_by, requested_at);
    this.appendEventInternal({
      agent_id: input.agent_id,
      type: 'approval.requested',
      actor: requested_by,
      summary: `Approval requested: ${input.title.trim()}`,
      data: { approval_id: id },
    });
    return this.getApproval(id) as ApprovalRequest;
  }

  getApproval(id: string): ApprovalRequest | null {
    const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? rowToApproval(r) : null;
  }

  listApprovals(opts: { agent_id?: string; status?: ApprovalStatus }): ApprovalRequest[] {
    if (opts.status !== undefined && !VALID_APPROVAL_STATUSES.includes(opts.status)) {
      throw new ValidationError(`invalid status: ${opts.status}`);
    }
    const conds: string[] = [];
    const vals: SQLInputValue[] = [];
    if (opts.agent_id) { conds.push('agent_id = ?'); vals.push(opts.agent_id); }
    if (opts.status) { conds.push('status = ?'); vals.push(opts.status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return (
      this.db.prepare(`SELECT * FROM approvals ${where} ORDER BY requested_at DESC`).all(...vals) as Record<string, unknown>[]
    ).map(rowToApproval);
  }

  /**
   * True when the agent has a granted approval decided within the trailing
   * window (used by the L1 autonomy gate, ADR-0006).
   */
  hasRecentGrant(agentId: string, windowMs: number): boolean {
    const cutoff = new Date(Date.now() - windowMs).toISOString();
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM approvals
         WHERE agent_id = ? AND status = 'granted' AND decided_at >= ?
         LIMIT 1`,
      )
      .get(agentId, cutoff) as { ok: number } | undefined;
    return !!row;
  }

  decideApproval(id: string, decision: ApprovalDecisionInput): ApprovalRequest | null {
    const existing = this.getApproval(id);
    if (!existing) return null;
    if (existing.status !== 'pending') {
      throw new ValidationError(`approval request already decided (${existing.status}) — decisions are final`);
    }
    if (decision.decision !== 'granted' && decision.decision !== 'denied') {
      throw new ValidationError(`invalid decision: ${decision.decision} — must be granted or denied`);
    }
    // ADR-0006: exactly one decider — a human, or an L5 supervisor agent that
    // supervises the request's agent. Fail closed on anything else.
    const byHuman = typeof decision.decided_by === 'string' ? decision.decided_by.trim() : '';
    const byAgent = typeof decision.decided_by_agent_id === 'string' ? decision.decided_by_agent_id.trim() : '';
    if ((byHuman && byAgent) || (!byHuman && !byAgent)) {
      throw new ValidationError('provide exactly one of decided_by (human) or decided_by_agent_id (L5 supervisor agent)');
    }
    let decidedBy: string;
    let actor: EventActor = 'human';
    if (byAgent) {
      const supervisor = this.getAgent(byAgent);
      if (!supervisor) throw new ValidationError(`unknown supervisor agent: ${byAgent}`);
      if (supervisor.autonomy_level !== 5) {
        throw new ValidationError(
          `agent ${byAgent} cannot decide approvals: autonomy level L${supervisor.autonomy_level}, need L5 (Supervisor)`,
        );
      }
      const subject = this.getAgent(existing.agent_id);
      if (!subject || subject.supervisor_agent_id !== byAgent) {
        throw new ValidationError(`agent ${byAgent} does not supervise this approval's agent — only its supervisor may decide`);
      }
      decidedBy = `agent:${byAgent}`;
      actor = 'agent';
    } else {
      decidedBy = byHuman;
    }
    const decided_at = now();
    const status: ApprovalStatus = decision.decision;
    this.db
      .prepare('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
      .run(status, decidedBy, decided_at, id);
    this.appendEventInternal({
      agent_id: existing.agent_id,
      type: `approval.${status}`,
      actor,
      summary: `Approval ${status}: ${existing.title}`,
      data: { approval_id: id, decided_by: decidedBy, ...(decision.reason ? { reason: decision.reason } : {}) },
    });
    return this.getApproval(id) as ApprovalRequest;
  }


  analyticsSummary(opts?: { since?: string | null; window?: AnalyticsSummary['window'] }): AnalyticsSummary {
    const since = opts?.since ?? null;
    const windowLabel: AnalyticsSummary['window'] = opts?.window ?? (since ? 'custom' : 'all');
    // Chronological compare via SQLite datetime() — lexicographic TEXT compare on
    // offset ISOs wrongly drops in-window events (e.g. 08:00-05:00 vs 12:00Z).
    // Ingest also normalizes to UTC Z; datetime() covers legacy/raw offset rows.
    const sinceClause = since ? 'AND datetime(e.occurred_at) >= datetime(?)' : '';
    const sinceParams: SQLInputValue[] = since ? [since] : [];

    const rate = (completed: number, failed: number): number | null => {
      const n = completed + failed;
      return n === 0 ? null : completed / n;
    };
    const avg = (sum: number, count: number): number | null => (count === 0 ? null : sum / count);

    const totalsRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN e.cost_usd IS NOT NULL THEN e.cost_usd ELSE 0 END), 0) AS cost_usd,
           COALESCE(SUM(CASE WHEN e.cost_usd IS NOT NULL THEN 1 ELSE 0 END), 0) AS events_with_cost,
           COALESCE(SUM(CASE WHEN e.type = 'task.completed' THEN 1 ELSE 0 END), 0) AS tasks_completed,
           COALESCE(SUM(CASE WHEN e.type = 'task.failed' THEN 1 ELSE 0 END), 0) AS tasks_failed,
           COALESCE(SUM(CASE WHEN e.duration_ms IS NOT NULL THEN e.duration_ms ELSE 0 END), 0) AS duration_sum,
           COALESCE(SUM(CASE WHEN e.duration_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS events_with_duration,
           COALESCE(SUM(CASE WHEN e.type IN ('task.failed', 'tool.failed') THEN 1 ELSE 0 END), 0) AS error_events,
           COALESCE(SUM(CASE
             WHEN e.type = 'task.completed'
              AND json_extract(e.data, '$.human_minutes_saved') IS NOT NULL
              AND typeof(json_extract(e.data, '$.human_minutes_saved')) IN ('integer', 'real')
              AND json_extract(e.data, '$.human_minutes_saved') >= 0
              AND json_extract(e.data, '$.human_minutes_saved') <= ${MAX_HUMAN_MINUTES_SAVED_PER_EVENT}
             THEN CAST(json_extract(e.data, '$.human_minutes_saved') AS REAL) ELSE 0 END), 0) AS minutes_saved_sum,
           COALESCE(SUM(CASE
             WHEN e.type = 'task.completed'
              AND json_extract(e.data, '$.human_minutes_saved') IS NOT NULL
              AND typeof(json_extract(e.data, '$.human_minutes_saved')) IN ('integer', 'real')
              AND json_extract(e.data, '$.human_minutes_saved') >= 0
              AND json_extract(e.data, '$.human_minutes_saved') <= ${MAX_HUMAN_MINUTES_SAVED_PER_EVENT}
             THEN 1 ELSE 0 END), 0) AS events_with_hours_estimate,
           COUNT(*) AS total_events
         FROM events e
         WHERE 1=1 ${sinceClause}`,
      )
      .get(...sinceParams) as Record<string, unknown>;

    const totals: AnalyticsTotals = {
      cost_usd: Number(totalsRow.cost_usd),
      events_with_cost: Number(totalsRow.events_with_cost),
      tasks_completed: Number(totalsRow.tasks_completed),
      tasks_failed: Number(totalsRow.tasks_failed),
      task_success_rate: rate(Number(totalsRow.tasks_completed), Number(totalsRow.tasks_failed)),
      avg_duration_ms: avg(Number(totalsRow.duration_sum), Number(totalsRow.events_with_duration)),
      events_with_duration: Number(totalsRow.events_with_duration),
      error_events: Number(totalsRow.error_events),
      total_events: Number(totalsRow.total_events),
    };
    const eventsWithHours = Number(totalsRow.events_with_hours_estimate);
    const minutesSum = Number(totalsRow.minutes_saved_sum);
    const value: AnalyticsValue = {
      tasks_completed: Number(totalsRow.tasks_completed),
      human_hours_saved: eventsWithHours === 0 ? null : minutesSum / 60,
      events_with_hours_estimate: eventsWithHours,
      estimated: true,
    };

    const mapRows = (
      rows: Record<string, unknown>[],
      keyOf: (r: Record<string, unknown>) => string,
      labelOf: (r: Record<string, unknown>) => string,
    ): AnalyticsBreakdownRow[] =>
      rows.map((r) => {
        const completed = Number(r.tasks_completed);
        const failed = Number(r.tasks_failed);
        return {
          key: keyOf(r),
          label: labelOf(r),
          cost_usd: Number(r.cost_usd),
          events_with_cost: Number(r.events_with_cost),
          tasks_completed: completed,
          tasks_failed: failed,
          task_success_rate: rate(completed, failed),
          avg_duration_ms: avg(Number(r.duration_sum), Number(r.events_with_duration)),
          events_with_duration: Number(r.events_with_duration),
          error_events: Number(r.error_events),
          total_events: Number(r.total_events),
        };
      });

    const aggSelect = `
           COALESCE(SUM(CASE WHEN e.cost_usd IS NOT NULL THEN e.cost_usd ELSE 0 END), 0) AS cost_usd,
           COALESCE(SUM(CASE WHEN e.cost_usd IS NOT NULL THEN 1 ELSE 0 END), 0) AS events_with_cost,
           COALESCE(SUM(CASE WHEN e.type = 'task.completed' THEN 1 ELSE 0 END), 0) AS tasks_completed,
           COALESCE(SUM(CASE WHEN e.type = 'task.failed' THEN 1 ELSE 0 END), 0) AS tasks_failed,
           COALESCE(SUM(CASE WHEN e.duration_ms IS NOT NULL THEN e.duration_ms ELSE 0 END), 0) AS duration_sum,
           COALESCE(SUM(CASE WHEN e.duration_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS events_with_duration,
           COALESCE(SUM(CASE WHEN e.type IN ('task.failed', 'tool.failed') THEN 1 ELSE 0 END), 0) AS error_events,
           COUNT(*) AS total_events`;

    const byAgent = this.db
      .prepare(
        `SELECT a.id AS agent_id, a.name AS agent_name, ${aggSelect}
         FROM events e JOIN agents a ON a.id = e.agent_id
         WHERE 1=1 ${sinceClause}
         GROUP BY a.id, a.name
         ORDER BY cost_usd DESC, total_events DESC, a.name ASC`,
      )
      .all(...sinceParams) as Record<string, unknown>[];

    const byDepartment = this.db
      .prepare(
        `SELECT CASE WHEN a.department = '' OR a.department IS NULL THEN '(unassigned)' ELSE a.department END AS dept, ${aggSelect}
         FROM events e JOIN agents a ON a.id = e.agent_id
         WHERE 1=1 ${sinceClause}
         GROUP BY dept
         ORDER BY cost_usd DESC, total_events DESC, dept ASC`,
      )
      .all(...sinceParams) as Record<string, unknown>[];

    const byModel = this.db
      .prepare(
        `SELECT CASE WHEN a.model = '' OR a.model IS NULL THEN '(unassigned)' ELSE a.model END AS model, ${aggSelect}
         FROM events e JOIN agents a ON a.id = e.agent_id
         WHERE 1=1 ${sinceClause}
         GROUP BY model
         ORDER BY cost_usd DESC, total_events DESC, model ASC`,
      )
      .all(...sinceParams) as Record<string, unknown>[];

    const byProvider = this.db
      .prepare(
        `SELECT CASE WHEN a.provider = '' OR a.provider IS NULL THEN '(unassigned)' ELSE a.provider END AS provider, ${aggSelect}
         FROM events e JOIN agents a ON a.id = e.agent_id
         WHERE 1=1 ${sinceClause}
         GROUP BY provider
         ORDER BY cost_usd DESC, total_events DESC, provider ASC`,
      )
      .all(...sinceParams) as Record<string, unknown>[];

    return {
      since,
      window: windowLabel,
      totals,
      value,
      by_agent: mapRows(byAgent, (r) => r.agent_id as string, (r) => r.agent_name as string),
      by_department: mapRows(byDepartment, (r) => r.dept as string, (r) => r.dept as string),
      by_model: mapRows(byModel, (r) => r.model as string, (r) => r.model as string),
      by_provider: mapRows(byProvider, (r) => r.provider as string, (r) => r.provider as string),
    };
  }

  dashboardSummary(): DashboardSummary {
    const agents = this.listAgents();
    const byStatus = { active: 0, idle: 0, paused: 0, retired: 0, error: 0 } as Record<AgentStatus, number>;
    for (const a of agents) byStatus[a.status] += 1;
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const eventsRow = this.db.prepare('SELECT COUNT(*) AS c FROM events WHERE occurred_at >= ?').get(dayAgo) as { c: number };
    const pendingRow = this.db.prepare("SELECT COUNT(*) AS c FROM approvals WHERE status = 'pending'").get() as { c: number };
    const recent = (
      this.db.prepare('SELECT id, agent_id, type, occurred_at, summary FROM events ORDER BY occurred_at DESC LIMIT 10').all() as Record<string, unknown>[]
    ).map((r) => ({
      id: r.id as string,
      agent_id: r.agent_id as string,
      type: r.type as AgentEventType,
      occurred_at: r.occurred_at as string,
      summary: r.summary as string,
    }));
    return { total_agents: agents.length, active_agents: byStatus.active, agents_by_status: byStatus, events_last_24h: Number(eventsRow.c), pending_approvals: Number(pendingRow.c), recent_events: recent };
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

/** A request was well-formed but conflicts with the resource's current state (HTTP 409). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Open a storage backend. DATABASE_URL (postgres) is reserved for the future; SQLite is the v0.1 path. */
export function openStorage(): Storage {
  if (process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is set but the Postgres backend is not implemented yet (see ADR-0002). Unset it to use SQLite.');
  }
  return new SqliteStorage(process.env.SQLITE_PATH ?? './data/control-plane.db');
}
