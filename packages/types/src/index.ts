/**
 * Shared domain types for the AI workforce control plane.
 * Single source of truth per ADR-0003 (agent/event schema) and ADR-0004 (provider interface).
 */

// ---------------------------------------------------------------- Agent

export type AgentStatus = 'active' | 'idle' | 'paused' | 'retired' | 'error';

/** Autonomy levels L0-L5 (charter section 18). */
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  /** Human owner, e.g. "antonio@example.com". */
  owner: string;
  /** Parent agent for agent -> agent delegation hierarchies. Null for top-level. */
  supervisor_agent_id: string | null;
  /** Provider id referencing the provider registry. */
  provider: string;
  model: string;
  status: AgentStatus;
  tools: string[];
  permissions: string[];
  /** Monthly spend cap in USD. Null = no cap. */
  budget_monthly_usd: number | null;
  /** Autonomy level L0–L5, server-enforced (ADR-0006). New agents default to L3 (Standard). */
  autonomy_level: AutonomyLevel;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface AgentInput {
  name: string;
  description?: string;
  department?: string;
  owner?: string;
  supervisor_agent_id?: string | null;
  provider?: string;
  model?: string;
  status?: AgentStatus;
  tools?: string[];
  permissions?: string[];
  budget_monthly_usd?: number | null;
  autonomy_level?: AutonomyLevel;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------- Events

/**
 * Known event types. The ingest API rejects unknown types (fail closed) per ADR-0003.
 * Propose additions via docs; do not invent ad-hoc types in clients.
 */
export const KNOWN_EVENT_TYPES = [
  'agent.created',
  'agent.started',
  'agent.stopped',
  'agent.paused',
  'agent.resumed',
  'agent.retired',
  'agent.cloned',
  'agent.heartbeat',
  'task.created',
  'task.started',
  'task.completed',
  'task.failed',
  'model.called',
  'tool.called',
  'tool.completed',
  'tool.failed',
  'agent.delegated',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'policy.blocked',
  'credential.accessed',
  'budget.warning',
  'budget.exceeded',
  // Department pool alerts (ADR-0007) — distinct from per-agent budget alerts
  // so the two pools' edge-triggered dedup can never cross-contaminate.
  'department.budget.warning',
  'department.budget.exceeded',
  'security.alert',
] as const;

export type AgentEventType = (typeof KNOWN_EVENT_TYPES)[number];

export type EventActor = 'agent' | 'human' | 'system';

export interface AgentEvent {
  id: string;
  agent_id: string;
  type: AgentEventType;
  occurred_at: string;
  actor: EventActor;
  /** Human-readable one-liner, e.g. "Task completed: Q3 lead list". */
  summary: string;
  /** Structured payload. Prompt/response bodies are NOT stored by default. */
  data: Record<string, unknown>;
  tokens_in: number | null;
  tokens_out: number | null;
  /** USD cost. Null = unknown (never guessed). */
  cost_usd: number | null;
  duration_ms: number | null;
}

export interface AgentEventInput {
  agent_id: string;
  type: string;
  occurred_at?: string;
  actor?: EventActor;
  summary?: string;
  data?: Record<string, unknown>;
  tokens_in?: number | null;
  tokens_out?: number | null;
  /**
   * Client-asserted cost in USD — stored as reported data, not server-verified
   * (ADR-0005). The server never estimates costs: null means unknown. Must be
   * a finite, non-negative number when present; invalid values are rejected
   * with 400. Server-measured costs (invoke paths) are set internally instead.
   */
  cost_usd?: number | null;
  duration_ms?: number | null;
}

// ---------------------------------------------------------------- Approvals

/**
 * Human-in-the-loop approval requests (Phase 4 governance).
 * An agent (or a human) requests approval for a sensitive action; a human
 * grants or denies it. Every transition is recorded in the event trail
 * (approval.requested / approval.granted / approval.denied). A decided
 * request can never be undecided or decided twice — fail closed.
 */
export type ApprovalStatus = 'pending' | 'granted' | 'denied';

export interface ApprovalRequest {
  id: string;
  agent_id: string;
  /** Short title for the request, e.g. "Send invoice to Acme Corp". */
  title: string;
  /** Free-form detail: what the agent wants to do and why. */
  detail: string;
  status: ApprovalStatus;
  requested_by: EventActor;
  /** Identifier of the human who decided, e.g. an email — or `agent:<id>` when an L5 supervisor agent decided. Null while pending. */
  decided_by: string | null;
  requested_at: string;
  decided_at: string | null;
}

export interface ApprovalInput {
  agent_id: string;
  title: string;
  detail?: string;
  requested_by?: EventActor;
}

export interface ApprovalDecisionInput {
  decision: 'granted' | 'denied';
  /**
   * Identifier of the deciding human, e.g. an email.
   * Mutually exclusive with decided_by_agent_id — exactly one is required.
   */
  decided_by?: string;
  /**
   * ID of an L5 supervisor agent deciding for an agent it supervises
   * (the request's agent must list it as supervisor_agent_id).
   * Mutually exclusive with decided_by — exactly one is required.
   * Recorded as `agent:<id>` on the request and the audit event.
   */
  decided_by_agent_id?: string;
  reason?: string;
}

// ---------------------------------------------------------------- Providers

export type ProviderKind =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'openrouter'
  | 'openai-compatible';

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  /** Base URL for local/compatible endpoints. Null for cloud defaults. */
  base_url: string | null;
  /** Credential is stored by reference only; NEVER returned by the API. */
  has_credential: boolean;
  status: 'unknown' | 'healthy' | 'unhealthy';
  last_health_check: string | null;
  created_at: string;
}

export interface ProviderInput {
  kind: ProviderKind;
  name: string;
  base_url?: string | null;
  /** Raw credential material. Stored server-side only; never echoed back. */
  credential?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_window?: number;
}

export interface HealthResult {
  ok: boolean;
  message: string;
  latency_ms?: number;
}

export interface TokenUsage {
  tokens_in: number;
  tokens_out: number;
}

export interface InvokeRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  max_tokens?: number;
  options?: Record<string, unknown>;
}

export interface InvokeResult {
  text: string;
  usage: TokenUsage;
  latency_ms: number;
  model: string;
}

/**
 * Provider adapter interface (ADR-0004). Implemented in packages/providers.
 * Adapters use only documented provider APIs. estimateCost returns null
 * when pricing is unknown — never guess billing numbers.
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  listModels(): Promise<ModelInfo[]>;
  validateCredentials(): Promise<HealthResult>;
  invokeModel(req: InvokeRequest): Promise<InvokeResult>;
  estimateCost(usage: TokenUsage): number | null;
  healthCheck(): Promise<HealthResult>;
}

// ---------------------------------------------------------------- Dashboard

export interface DashboardSummary {
  total_agents: number;
  active_agents: number;
  agents_by_status: Record<AgentStatus, number>;
  events_last_24h: number;
  /** Approval requests still waiting on a human decision. */
  pending_approvals: number;
  recent_events: Array<Pick<AgentEvent, 'id' | 'agent_id' | 'type' | 'occurred_at' | 'summary'>>;
}


// ---------------------------------------------------------------- Analytics (Phase 6)

/**
 * One row of a cost/task breakdown (by agent, department, model, or provider).
 * cost_usd sums only known/non-null event costs — unknown costs stay out of
 * totals and are never fabricated (ADR-0003).
 */
export interface AnalyticsBreakdownRow {
  /** Grouping key (agent id, department name, model string, or provider string). */
  key: string;
  /** Human-readable label when distinct from key (e.g. agent name). Same as key otherwise. */
  label: string;
  /** Sum of real reported cost_usd in the window (null costs excluded). */
  cost_usd: number;
  /** Number of events that contributed a known cost. */
  events_with_cost: number;
  tasks_completed: number;
  tasks_failed: number;
  /**
   * tasks_completed / (tasks_completed + tasks_failed).
   * Null when there were no completed or failed tasks in the window.
   */
  task_success_rate: number | null;
  /**
   * Average duration_ms across events that reported a duration.
   * Null when no event in the group had duration_ms set.
   */
  avg_duration_ms: number | null;
  /** Number of events that contributed to avg_duration_ms. */
  events_with_duration: number;
  /** Count of error-class events (task.failed + tool.failed) in the window. */
  error_events: number;
  /** Total events attributed to this group in the window. */
  total_events: number;
}

/** Totals block shared by AnalyticsSummary (same metrics as a breakdown row, no key/label). */
export interface AnalyticsTotals {
  cost_usd: number;
  events_with_cost: number;
  tasks_completed: number;
  tasks_failed: number;
  task_success_rate: number | null;
  avg_duration_ms: number | null;
  events_with_duration: number;
  error_events: number;
  total_events: number;
}

/**
 * Value / human-hours-saved rollup (Phase 6, ADR-0008).
 * Only explicit client-reported `human_minutes_saved` on `task.completed`
 * events contribute. Never invent defaults; never convert hours to dollar ROI.
 */
export interface AnalyticsValue {
  /** Count of `task.completed` events in the window (same as totals.tasks_completed). */
  tasks_completed: number;
  /**
   * Sum of explicit `human_minutes_saved` / 60 across observations.
   * Null when `events_with_hours_estimate` is 0 — unknown stays unknown
   * (never show 0.0 as a measured total).
   */
  human_hours_saved: number | null;
  /** Number of `task.completed` events that carried an explicit minutes estimate. */
  events_with_hours_estimate: number;
  /**
   * Always true: values are self-reported estimates, not measured wall-clock
   * savings. Mirrors cost honesty (ADR-0005 / ADR-0008).
   */
  estimated: true;
}

/**
 * GET /api/analytics/summary payload (Phase 6).
 * Cost + task metrics rolled up by agent, department, model, and provider.
 * `value` carries explicit human-hours-saved estimates only (ADR-0008).
 *
 * Default window is all-time (since=null). Pass `since` (ISO timestamp) or
 * `window` (24h|7d|30d|month) to narrow.
 */
export interface AnalyticsSummary {
  /** Inclusive lower bound of the window as ISO; null means all-time. */
  since: string | null;
  /** Documented window label: 'all' | '24h' | '7d' | '30d' | 'month' | 'custom'. */
  window: 'all' | '24h' | '7d' | '30d' | 'month' | 'custom';
  totals: AnalyticsTotals;
  /** Explicit value estimates only — see AnalyticsValue / ADR-0008. */
  value: AnalyticsValue;
  by_agent: AnalyticsBreakdownRow[];
  by_department: AnalyticsBreakdownRow[];
  by_model: AnalyticsBreakdownRow[];
  by_provider: AnalyticsBreakdownRow[];
}

// ---------------------------------------------------------------- Agent detail

/**
 * Usage rollups for one agent, computed from its events.
 * All counts are exact; tokens/cost are summed as reported by clients —
 * cost_usd is never estimated server-side (ADR-0003).
 */
export interface AgentUsage {
  events_total: number;
  events_last_24h: number;
  /** Event counts keyed by type; only types that occurred are present. */
  events_by_type: Partial<Record<AgentEventType, number>>;
  tokens_in_total: number;
  tokens_out_total: number;
  model_calls: number;
  tool_calls: number;
  tasks_completed: number;
  tasks_failed: number;
  /** ISO timestamp of the earliest recorded event; null when no events. */
  first_seen_at: string | null;
  /** ISO timestamp of the latest recorded event; null when no events. */
  last_event_at: string | null;
}

/** Agent detail view payload: identity + usage + activity timeline + pending approvals. */
// ---------------------------------------------------------------- Budgets

/** Live view of an agent's monthly spend against its budget (Phase 4 governance). */
export interface AgentBudgetState {
  /** Agent's monthly budget cap in USD. */
  limit_usd: number;
  /** Sum of real reported costs this calendar month (unknown costs stay out — never estimated). */
  spend_month_usd: number;
  /** spend_month_usd / limit_usd, e.g. 0.85 = 85% of budget used. */
  pct_used: number;
  /** 'ok' (< 80%), 'warning' (>= 80%, < 100%), 'exceeded' (>= 100%). */
  status: 'ok' | 'warning' | 'exceeded';
}

/**
 * Live view of a department's monthly spend against its shared budget cap
 * (Phase 4 governance, ADR-0007). Spend is summed across every agent whose
 * `department` field matches, this calendar month; only real reported costs
 * count (unknown costs stay out — never estimated).
 */
export interface DepartmentBudgetState {
  /** Department name this state describes. */
  department: string;
  /** Department's monthly budget cap in USD. */
  limit_usd: number;
  /** Sum of real reported costs across member agents this calendar month. */
  spend_month_usd: number;
  /** Number of agents currently in this department. */
  agent_count: number;
  /** spend_month_usd / limit_usd, e.g. 0.85 = 85% of budget used. */
  pct_used: number;
  /** 'ok' (< 80%), 'warning' (>= 80%, < 100%), 'exceeded' (>= 100%). */
  status: 'ok' | 'warning' | 'exceeded';
}

/** One row of the GET /api/departments response. */
export interface DepartmentSummary {
  /** Department name. */
  name: string;
  /** Number of agents currently in this department. */
  agent_count: number;
  /** Budget meter, or null when the department has no monthly budget set. */
  budget: DepartmentBudgetState | null;
}

/** Body for PUT /api/departments/:name/budget — set or clear a department's cap. */
export interface SetDepartmentBudgetInput {
  /** Monthly cap in USD; null clears the department's budget. Must be finite and non-negative when present. */
  budget_monthly_usd: number | null;
}

// ---------------------------------------------------------------- Org view

/**
 * One agent node in the GET /api/org response — identity plus org
 * relationships (department, owner, supervisor) only. Cost and event detail
 * live on the agent detail payload, not here.
 */
export interface OrgAgentNode {
  id: string;
  name: string;
  status: AgentStatus;
  owner: string;
  autonomy_level: AutonomyLevel;
  /** Parent agent for agent -> agent delegation. Null for top-level. */
  supervisor_agent_id: string | null;
}

/** One agent -> agent delegation link (Phase 5 org view). */
export interface OrgDelegationLink {
  agent_id: string;
  agent_name: string;
  supervisor_agent_id: string;
  /** Null when the referenced supervisor no longer exists (dangling link). */
  supervisor_name: string | null;
}

/** One department block of the GET /api/org response. */
export interface OrgDepartment {
  name: string;
  budget: DepartmentBudgetState | null;
  agents: OrgAgentNode[];
}

/** One human -> agent delegation row (agents owned by the same person). */
export interface OrgOwnerRow {
  owner: string;
  agent_ids: string[];
}

/**
 * GET /api/org response: the workforce as an org chart. Departments hold
 * their agents; agents with no department land in `unassigned`. Delegation
 * is explicit: `delegation` is agent -> agent (supervisor_agent_id),
 * `owners` is human -> agent (owner field).
 */
export interface OrgView {
  departments: OrgDepartment[];
  unassigned: OrgAgentNode[];
  delegation: OrgDelegationLink[];
  owners: OrgOwnerRow[];
}

export interface AgentDetail {
  agent: Agent;
  /** Convenience alias for agent.last_heartbeat_at. */
  last_check_in: string | null;
  usage: AgentUsage;
  /** Activity timeline, newest first. */
  recent_events: AgentEvent[];
  /** Approval requests still waiting on a human decision, newest first. */
  pending_approvals: ApprovalRequest[];
  /** Budget meter, or null when the agent has no monthly budget set. */
  budget: AgentBudgetState | null;
  /**
   * Department pool meter (ADR-0007), or null when the agent's department has
   * no monthly budget set. Present so an agent blocked by the shared pool can
   * see why its invokes are throttled.
   */
  department_budget: DepartmentBudgetState | null;
}
