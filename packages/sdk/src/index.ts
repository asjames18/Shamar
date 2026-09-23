/**
 * @shamar/sdk — zero-dependency TypeScript client for the Shamar API.
 *
 * Uses the global fetch (Node >= 18), so the SDK has no runtime dependencies.
 * All values are passed through as given; the server validates and computes
 * costs (cost_usd is ignored client-side — see ADR-0003, costs are never
 * asserted by clients).
 */

import type {
  Agent,
  AgentDetail,
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentInput,
  DashboardSummary,
  TokenUsage,
} from '../../types/src/index';

/** Connection options for the Shamar client. */
export interface ShamarClientOptions {
  /**
   * Base URL of the Shamar API, e.g. "http://localhost:4000".
   * Defaults to `SHAMAR_BASE_URL` env, else "http://localhost:4000".
   */
  baseUrl?: string;
  /**
   * API key for authenticated endpoints.
   * Defaults to `SHAMAR_API_KEY` env.
   */
  apiKey?: string;
}

/** Error thrown for HTTP-level failures. `status` is null for network errors. */
export class ShamarError extends Error {
  readonly status: number | null;
  readonly body: unknown;

  constructor(message: string, status: number | null, body?: unknown) {
    super(message);
    this.name = 'ShamarError';
    this.status = status;
    this.body = body;
  }
}

type Json = Record<string, unknown>;

/** Convenience payload for task lifecycle events. */
export interface TaskEventOptions {
  /** Human-readable title, e.g. "Q3 lead list". */
  title: string;
  /** Structured details (never prompt/response bodies by default). */
  data?: Record<string, unknown>;
  /** Wall-clock duration of the completed task. */
  durationMs?: number;
}

/** Convenience payload for model/tool call events. */
export interface CallEventOptions {
  /** Human-readable summary, e.g. "gpt-4o answered billing FAQ". */
  summary: string;
  model?: string;
  tool?: string;
  usage?: TokenUsage;
  durationMs?: number;
  data?: Record<string, unknown>;
}

export class ShamarClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: ShamarClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env['SHAMAR_BASE_URL'] ?? 'http://localhost:4000';
    this.apiKey = options.apiKey ?? process.env['SHAMAR_API_KEY'] ?? '';
    if (!this.apiKey) {
      throw new ShamarError(
        'No API key: pass apiKey or set SHAMAR_API_KEY.',
        null,
      );
    }
  }

  /** Register a new agent. */
  async register(input: AgentInput): Promise<Agent> {
    const { agent } = await this.request<{ agent: Agent }>(
      'POST',
      '/api/agents',
      input as unknown as Json,
    );
    return agent;
  }

  /** Update an existing agent (partial). */
  async updateAgent(id: string, patch: Partial<AgentInput>): Promise<Agent> {
    const { agent } = await this.request<{ agent: Agent }>(
      'PATCH',
      `/api/agents/${encodeURIComponent(id)}`,
      patch as Json,
    );
    return agent;
  }

  /** List all registered agents. */
  async listAgents(): Promise<Agent[]> {
    const { agents } = await this.request<{ agents: Agent[] }>(
      'GET',
      '/api/agents',
    );
    return agents;
  }

  /** Fetch one agent by id. */
  async getAgent(id: string): Promise<Agent> {
    const { agent } = await this.request<{ agent: Agent }>(
      'GET',
      `/api/agents/${encodeURIComponent(id)}`,
    );
    return agent;
  }

  /** Fetch identity + usage rollups + activity timeline for one agent. */
  async getAgentDetail(id: string): Promise<AgentDetail> {
    return this.request<AgentDetail>(
      'GET',
      `/api/agents/${encodeURIComponent(id)}/detail`,
    );
  }

  /** Mark the agent as alive now. */
  async heartbeat(agentId: string): Promise<Agent> {
    const { agent } = await this.request<{ agent: Agent }>(
      'POST',
      `/api/agents/${encodeURIComponent(agentId)}/heartbeat`,
    );
    return agent;
  }

  /** Append a single event. */
  async event(input: AgentEventInput): Promise<AgentEvent> {
    const result = await this.request<{ events: AgentEvent | AgentEvent[] }>(
      'POST',
      '/api/events',
      input as unknown as Json,
    );
    // The server unwraps single (non-batch) posts: { events: <event> }.
    return Array.isArray(result.events)
      ? result.events[0]!
      : result.events;
  }

  /** Append multiple events in one request. */
  async eventsBatch(inputs: AgentEventInput[]): Promise<AgentEvent[]> {
    if (inputs.length === 0) return [];
    const { events } = await this.request<{ events: AgentEvent[] }>(
      'POST',
      '/api/events',
      { events: inputs },
    );
    return events;
  }

  /** Dashboard rollup: totals, status breakdown, last-24h counts, recent events. */
  async dashboardSummary(): Promise<DashboardSummary> {
    return this.request<DashboardSummary>('GET', '/api/dashboard/summary');
  }

  // --- convenience helpers ----------------------------------------------

  /** `agent.started` — call when the agent boots. */
  async agentStarted(
    agentId: string,
    summary = 'Agent started',
    data?: Record<string, unknown>,
  ): Promise<AgentEvent> {
    return this.event({ agent_id: agentId, type: 'agent.started', summary, data });
  }

  /** `task.started`. */
  async taskStarted(
    agentId: string,
    options: TaskEventOptions,
  ): Promise<AgentEvent> {
    return this.event({
      agent_id: agentId,
      type: 'task.started',
      summary: `Task started: ${options.title}`,
      data: options.data,
    });
  }

  /** `task.completed`. */
  async taskCompleted(
    agentId: string,
    options: TaskEventOptions,
  ): Promise<AgentEvent> {
    return this.event({
      agent_id: agentId,
      type: 'task.completed',
      summary: `Task completed: ${options.title}`,
      data: options.data,
      duration_ms: options.durationMs,
    });
  }

  /** `task.failed`. */
  async taskFailed(
    agentId: string,
    options: TaskEventOptions & { error?: string },
  ): Promise<AgentEvent> {
    return this.event({
      agent_id: agentId,
      type: 'task.failed',
      summary: `Task failed: ${options.title}`,
      data: { ...options.data, ...(options.error ? { error: options.error } : {}) },
      duration_ms: options.durationMs,
    });
  }

  /** `model.called` — tokens recorded as reported, cost never asserted (ADR-0003). */
  async modelCalled(
    agentId: string,
    options: CallEventOptions,
  ): Promise<AgentEvent> {
    return this.event({
      agent_id: agentId,
      type: 'model.called',
      summary: options.summary,
      data: { ...options.data, ...(options.model ? { model: options.model } : {}) },
      tokens_in: options.usage?.tokens_in ?? null,
      tokens_out: options.usage?.tokens_out ?? null,
      duration_ms: options.durationMs,
    });
  }

  /** `tool.called`. */
  async toolCalled(
    agentId: string,
    options: CallEventOptions,
  ): Promise<AgentEvent> {
    return this.event({
      agent_id: agentId,
      type: 'tool.called',
      summary: options.summary,
      data: { ...options.data, ...(options.tool ? { tool: options.tool } : {}) },
      tokens_in: options.usage?.tokens_in ?? null,
      tokens_out: options.usage?.tokens_out ?? null,
      duration_ms: options.durationMs,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Json,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new ShamarError(
        `Network error calling ${method} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
        null,
      );
    }
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const message =
        parsed !== null && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : res.statusText;
      throw new ShamarError(
        `${method} ${path} failed (${res.status}): ${message}`,
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }
}

export type {
  Agent,
  AgentDetail,
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentInput,
  DashboardSummary,
  TokenUsage,
};
