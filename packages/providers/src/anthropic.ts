/**
 * Anthropic provider adapter (ADR-0004) — Phase 3, second BYOK cloud adapter.
 *
 * Uses only the documented Anthropic Messages API:
 *   GET  /v1/models            — documented List Models endpoint; requires the
 *                                API key, so a 200 here doubles as credential
 *                                validation (401 = bad key), 4xx = key or
 *                                request problem. Makes no model call, so
 *                                validating costs nothing.
 *   POST /v1/messages          — documented Messages API (requires max_tokens).
 *
 * BYOK credential sourcing: the API key is passed to the constructor or read
 * from the `ANTHROPIC_API_KEY` environment variable (set it in your `.env`;
 * never commit it). The key is sent only in the `x-api-key` header — it is
 * never logged, never stored by the adapter, and never echoed back.
 *
 * Cost semantics: the Anthropic API exposes no pricing endpoint, so
 * estimateCost always returns null (never guessed), matching the null-cost
 * rule in ADR-0003. The dashboard still records real token usage from every
 * invoke; cost_usd on events stays null for Anthropic until the operator
 * supplies their own per-model rates.
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

export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
/** Documented version header pinned for the Messages + Models endpoints. */
export const ANTHROPIC_API_VERSION = '2023-06-01';

export interface AnthropicOptions {
  /** API key (BYOK). Defaults to process.env.ANTHROPIC_API_KEY. */
  apiKey?: string | null;
  /** Base URL. Defaults to https://api.anthropic.com. Overridable for tests. */
  baseUrl?: string | null;
}

interface AnthropicModelEntry {
  id?: string;
  display_name?: string;
}

interface AnthropicModelsResponse {
  data?: AnthropicModelEntry[];
  error?: { type?: string; message?: string };
}

interface AnthropicMessageContent {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  model?: string;
  content?: AnthropicMessageContent[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

type FetchFn = typeof fetch;

export class AnthropicAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'anthropic';

  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchFn: FetchFn;

  constructor(opts: AnthropicOptions = {}, fetchFn: FetchFn = fetch) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL).replace(/\/+$/, '');
    const envKey = typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : undefined;
    this.apiKey = opts.apiKey ?? (envKey && envKey.trim() ? envKey.trim() : null);
    this.fetchFn = fetchFn;
  }

  /** Key is present — used only for internal gating, never surfaced. */
  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error('no Anthropic API key configured (set ANTHROPIC_API_KEY)');
    }
    return this.apiKey;
  }

  private authHeaders(key: string): Record<string, string> {
    return {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`Anthropic not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    return res;
  }

  private static async readError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { type?: string; message?: string } };
      return body.error?.message ?? body.error?.type ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const key = this.requireKey();
    const res = await this.request(
      '/v1/models',
      { method: 'GET', headers: this.authHeaders(key) },
      15_000,
    );
    if (!res.ok) throw new Error(`Anthropic model list failed: ${await AnthropicAdapter.readError(res)}`);
    const body = (await res.json()) as AnthropicModelsResponse;
    if (body.error) throw new Error(`Anthropic model list failed: ${body.error.message ?? body.error.type}`);
    return (body.data ?? [])
      .filter((m) => typeof m.id === 'string' && m.id.length > 0)
      .map((m) => ({ id: m.id as string, name: m.display_name ?? (m.id as string) }));
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
        return { ok: false, message: 'Anthropic API key rejected (401/403)', latency_ms: Date.now() - start };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: `Anthropic key check failed: ${await AnthropicAdapter.readError(res)}`,
          latency_ms: Date.now() - start,
        };
      }
      return { ok: true, message: 'Anthropic API key valid', latency_ms: Date.now() - start };
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
    // The documented Messages API takes a flat messages array (no system
    // field) and requires max_tokens; default a sane cap when unset.
    const res = await this.request(
      '/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.authHeaders(key),
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.max_tokens ?? 1024,
          messages: req.messages,
          ...(req.options ?? {}),
        }),
      },
      120_000,
    );
    if (!res.ok) {
      throw new Error(`Anthropic message creation failed: ${await AnthropicAdapter.readError(res)}`);
    }
    const body = (await res.json()) as AnthropicMessageResponse;
    if (body.error) {
      throw new Error(`Anthropic message creation failed: ${body.error.message ?? body.error.type}`);
    }
    const usage: TokenUsage = {
      tokens_in: body.usage?.input_tokens ?? 0,
      tokens_out: body.usage?.output_tokens ?? 0,
    };
    const text = (body.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n');
    return {
      text,
      usage,
      latency_ms: Date.now() - start,
      model: body.model ?? req.model,
    };
  }

  /**
   * The Anthropic API exposes no pricing endpoint, so there is no documented
   * source to compute cost from — always returns null (never guessed),
   * matching the null-cost rule in ADR-0003. Token usage is still recorded
   * exactly on every invoke.
   */
  estimateCost(_usage: TokenUsage): number | null {
    return null;
  }
}
