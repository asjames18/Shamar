/**
 * OpenRouter provider adapter (ADR-0004) — Phase 3, first BYOK cloud adapter.
 *
 * Uses only the documented OpenRouter API:
 *   GET  /api/v1/models            — public model listing (no auth), includes
 *                                    documented per-token pricing strings
 *                                    (USD per token: pricing.prompt /
 *                                    pricing.completion)
 *   GET  /api/v1/auth/key          — validates an API key; 200 = valid
 *                                    (returns label/usage/limits, no model
 *                                    call, costs nothing), 401/403 = bad key
 *   POST /api/v1/chat/completions  — OpenAI-compatible chat completion
 *
 * BYOK credential sourcing: the API key is passed to the constructor or read
 * from the `OPENROUTER_API_KEY` environment variable (set it in your `.env`;
 * never commit it). The key is sent only in the Authorization header — it is
 * never logged, never stored by the adapter, and never echoed back.
 *
 * Cost semantics: estimateCost computes from the documented per-token prices
 * cached (process-wide) from listModels for the model used in the last
 * invoke. Pricing is unknown until listModels has been called in this
 * process, in which case estimateCost returns null (never guessed),
 * matching the null-cost rule. Pricing is as fresh as the last /models
 * call — fine for an estimate; documented here so callers know.
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

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai';

export interface OpenRouterOptions {
  /** API key (BYOK). Defaults to process.env.OPENROUTER_API_KEY. */
  apiKey?: string | null;
  /** Base URL. Defaults to https://openrouter.ai. Overridable for tests. */
  baseUrl?: string | null;
}

interface OpenRouterModelEntry {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelEntry[];
}

interface OpenRouterChatResponse {
  model?: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number; message?: string };
}

interface OpenRouterAuthKeyResponse {
  data?: { label?: string; usage?: number; limit?: number | null };
  error?: { code?: number; message?: string };
}

type FetchFn = typeof fetch;

/**
 * Process-wide per-model per-token USD pricing cache, populated by
 * listModels from the documented OpenRouter pricing feed. Shared across
 * adapter instances because the API constructs a fresh adapter per request —
 * a /models call anywhere in the process lets later /invoke calls estimate
 * cost honestly.
 */
const pricingCache = new Map<string, { prompt: number; completion: number }>();

/** Test-only: clear the pricing cache so tests stay isolated. */
export function resetPricingCache(): void {
  pricingCache.clear();
}

export class OpenRouterAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'openrouter';

  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchFn: FetchFn;
  /** Model id used by the most recent invoke — anchors estimateCost. */
  private lastInvokedModel: string | null = null;

  constructor(opts: OpenRouterOptions = {}, fetchFn: FetchFn = fetch) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/+$/, '');
    const envKey = typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : undefined;
    this.apiKey = opts.apiKey ?? (envKey && envKey.trim() ? envKey.trim() : null);
    this.fetchFn = fetchFn;
  }

  /** Key is present — used only for internal gating, never surfaced. */
  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error('no OpenRouter API key configured (set OPENROUTER_API_KEY)');
    }
    return this.apiKey;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`OpenRouter not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    return res;
  }

  private static async readError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { code?: number; message?: string } };
      return body.error?.message ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.request('/api/v1/models', { method: 'GET' }, 15_000);
    if (!res.ok) throw new Error(`OpenRouter model list failed: ${await OpenRouterAdapter.readError(res)}`);
    const body = (await res.json()) as OpenRouterModelsResponse;
    const models = (body.data ?? []).filter((m) => typeof m.id === 'string' && m.id.length > 0);
    pricingCache.clear();
    for (const m of models) {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      if (m.id && Number.isFinite(prompt) && Number.isFinite(completion)) {
        pricingCache.set(m.id, { prompt, completion });
      }
    }
    return models.map((m) => ({
      id: m.id as string,
      name: m.name ?? (m.id as string),
      ...(typeof m.context_length === 'number' ? { context_window: m.context_length } : {}),
    }));
  }

  /**
   * Credential validation via the documented GET /api/v1/auth/key endpoint.
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
      const res = await this.request(
        '/api/v1/auth/key',
        { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
        15_000,
      );
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'OpenRouter API key rejected (401/403)', latency_ms: Date.now() - start };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: `OpenRouter key check failed: ${await OpenRouterAdapter.readError(res)}`,
          latency_ms: Date.now() - start,
        };
      }
      const body = (await res.json()) as OpenRouterAuthKeyResponse;
      const label = body.data?.label;
      return {
        ok: true,
        message: `OpenRouter API key valid${label ? ` (${label})` : ''}`,
        latency_ms: Date.now() - start,
      };
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
    const res = await this.request(
      '/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${key}`,
          // Optional documented attribution headers omitted; referrer/title
          // can be added here when the operator wants their app identified.
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
          ...(req.options ?? {}),
        }),
      },
      120_000,
    );
    if (!res.ok) {
      throw new Error(`OpenRouter chat completion failed: ${await OpenRouterAdapter.readError(res)}`);
    }
    const body = (await res.json()) as OpenRouterChatResponse;
    if (body.error) {
      throw new Error(`OpenRouter chat completion failed: ${body.error.message ?? `code ${body.error.code}`}`);
    }
    const choice = body.choices?.[0]?.message;
    const usage: TokenUsage = {
      tokens_in: body.usage?.prompt_tokens ?? 0,
      tokens_out: body.usage?.completion_tokens ?? 0,
    };
    this.lastInvokedModel = req.model;
    return {
      text: choice?.content ?? '',
      usage,
      latency_ms: Date.now() - start,
      model: body.model ?? req.model,
    };
  }

  /**
   * Computes cost ONLY from documented OpenRouter per-token pricing cached
   * (process-wide) from listModels for the last-invoked model. Returns null
   * when pricing is unknown (listModels not called in this process, or the
   * model carries no pricing) — never guesses.
   */
  estimateCost(usage: TokenUsage): number | null {
    if (!this.lastInvokedModel) return null;
    const pricing = pricingCache.get(this.lastInvokedModel);
    if (!pricing) return null;
    return pricing.prompt * usage.tokens_in + pricing.completion * usage.tokens_out;
  }
}
