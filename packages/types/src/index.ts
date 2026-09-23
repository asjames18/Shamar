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
  /** Clients must not assert cost; the server computes it. Accepted but ignored in v0.1. */
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
  /** Identifier of the human who decided, e.g. an email. Null while pending. */
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
  /** Identifier of the deciding human, e.g. an email. */
  decided_by: string;
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
export interface AgentDetail {
  agent: Agent;
  /** Convenience alias for agent.last_heartbeat_at. */
  last_check_in: string | null;
  usage: AgentUsage;
  /** Activity timeline, newest first. */
  recent_events: AgentEvent[];
  /** Approval requests still waiting on a human decision, newest first. */
  pending_approvals: ApprovalRequest[];
}
