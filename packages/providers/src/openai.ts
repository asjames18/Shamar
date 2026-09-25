/**
 * OpenAI provider adapter (ADR-0004) — Phase 3, third BYOK cloud adapter.
 *
 * Uses only the documented OpenAI API:
 *   GET  /v1/models            — documented List Models endpoint; requires the
 *                                API key, so a 200 here doubles as credential
 *                                validation (401 = bad key). Makes no model
 *                                call, so validating costs nothing.
 *   POST /v1/chat/completions  — documented Chat Completions API; returns real
 *                                token usage (`usage.prompt_tokens`,
 *                                `usage.completion_tokens`).
 *
 * BYOK credential sourcing: the API key is passed to the constructor or read
 * from the `OPENAI_API_KEY` environment variable (set it in your `.env`;
 * never commit it). The key is sent only in the `Authorization: Bearer`
 * header — it is never logged, never stored by the adapter, and never echoed
 * back.
 *
 * Cost semantics: the OpenAI API exposes no pricing endpoint, so estimateCost
 * always returns null (never guessed), matching the null-cost rule in
 * ADR-0003. The dashboard still records real token usage from every invoke;
 * cost_usd on events stays null for OpenAI until the operator supplies their
 * own per-model rates.
 */

import type {
  HealthResult,
  InvokeRequest,
  InvokeResult,
  ModelInfo,
  ProviderAdapter,
  ProviderKind,
  TokenUsage,
} from '../../types/src/index';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com';

export interface OpenAIOptions {
  /** API key (BYOK). Defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string | null;
  /** Base URL. Defaults to https://api.openai.com. Overridable for tests. */
  baseUrl?: string | null;
}

interface OpenAIModelEntry {
  id?: string;
  owned_by?: string;
}

interface OpenAIModelsResponse {
  data?: OpenAIModelEntry[];
  error?: { message?: string; type?: string };
}

interface OpenAIChoiceMessage {
  content?: string | null;
}

interface OpenAIChoice {
  message?: OpenAIChoiceMessage;
}

interface OpenAICompletionsResponse {
  id?: string;
  model?: string;
  choices?: OpenAIChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

type FetchFn = typeof fetch;

export class OpenAIAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'openai';

  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchFn: FetchFn;

  constructor(opts: OpenAIOptions = {}, fetchFn: FetchFn = fetch) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
    const envKey = typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : undefined;
    this.apiKey = opts.apiKey ?? (envKey && envKey.trim() ? envKey.trim() : null);
    this.fetchFn = fetchFn;
  }

  /** Key is present — used only for internal gating, never surfaced. */
  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error('no OpenAI API key configured (set OPENAI_API_KEY)');
    }
    return this.apiKey;
  }

  private authHeaders(key: string): Record<string, string> {
    return { Authorization: `Bearer ${key}` };
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`OpenAI not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    return res;
  }

  private static async readError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { message?: string; type?: string } };
      return body.error?.message ?? body.error?.type ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const key = this.requireKey();
    const res = await this.request('/v1/models', { method: 'GET', headers: this.authHeaders(key) }, 15_000);
    if (!res.ok) throw new Error(`OpenAI model list failed: ${await OpenAIAdapter.readError(res)}`);
    const body = (await res.json()) as OpenAIModelsResponse;
    if (body.error) throw new Error(`OpenAI model list failed: ${body.error.message ?? body.error.type}`);
    return (body.data ?? [])
      .filter((m) => typeof m.id === 'string' && m.id.length > 0)
      .map((m) => ({ id: m.id as string, name: m.owned_by ? `${m.id as string} (${m.owned_by})` : (m.id as string) }));
  }

  /**
   * Credential validation via the documented GET /v1/models endpoint.
   * Makes no model call — validating a key costs nothing.
   */
  async validateCredentials(): Promise<HealthResult> {
    const start = Date.now();
    let key: string;
    try {
      key = this.requireKey();
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    try {
      const res = await this.request('/v1/models', { method: 'GET', headers: this.authHeaders(key) }, 15_000);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'OpenAI API key rejected (401/403)', latency_ms: Date.now() - start };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: `OpenAI key check failed: ${await OpenAIAdapter.readError(res)}`,
          latency_ms: Date.now() - start,
        };
      }
      return { ok: true, message: 'OpenAI API key valid', latency_ms: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, latency_ms: Date.now() - start };
    }
  }

  async healthCheck(): Promise<HealthResult> {
    return this.validateCredentials();
  }

  async invokeModel(req: InvokeRequest): Promise<InvokeResult> {
    if (!req.model?.trim()) throw new Error('model is required');
    if (!Array.isArray(req.messages) || req.messages.length === 0) {
      throw new Error('messages must be a non-empty array');
    }
    const key = this.requireKey();
    const start = Date.now();
    // The documented Chat Completions API takes a flat messages array and an
    // explicit completion cap; default a sane cap when unset.
    const res = await this.request(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.authHeaders(key),
        },
        body: JSON.stringify({
          model: req.model,
          max_completion_tokens: req.max_tokens ?? 1024,
          messages: req.messages,
          ...(req.options ?? {}),
        }),
      },
      120_000,
    );
    if (!res.ok) {
      throw new Error(`OpenAI chat completion failed: ${await OpenAIAdapter.readError(res)}`);
    }
    const body = (await res.json()) as OpenAICompletionsResponse;
    if (body.error) {
      throw new Error(`OpenAI chat completion failed: ${body.error.message ?? body.error.type}`);
    }
    const usage: TokenUsage = {
      tokens_in: body.usage?.prompt_tokens ?? 0,
      tokens_out: body.usage?.completion_tokens ?? 0,
    };
    const text = (body.choices ?? [])
      .map((c) => c.message?.content)
      .filter((c): c is string => typeof c === 'string')
      .join('\n');
    return {
      text,
      usage,
      latency_ms: Date.now() - start,
      model: body.model ?? req.model,
    };
  }

  /**
   * The OpenAI API exposes no pricing endpoint, so there is no documented
   * source to compute cost from — always returns null (never guessed),
   * matching the null-cost rule in ADR-0003. Token usage is still recorded
   * exactly on every invoke.
   */
  estimateCost(_usage: TokenUsage): number | null {
    return null;
  }
}
