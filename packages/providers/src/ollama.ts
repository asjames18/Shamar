/**
 * Ollama provider adapter (ADR-0004).
 *
 * Uses only the documented Ollama REST API (https://github.com/ollama/ollama/blob/main/docs/api.md):
 *   GET  /api/tags  — list installed models
 *   POST /api/chat  — chat completion, non-streaming
 *
 * Zero runtime dependencies: uses the global fetch (Node >= 18). A fetch
 * implementation can be injected for tests. The adapter never logs prompt or
 * response bodies; usage numbers come from Ollama's own eval counters
 * (`prompt_eval_count` / `eval_count`) and are never fabricated.
 */

import type {
  HealthResult,
  InvokeRequest,
  InvokeResult,
  ModelInfo,
  ProviderAdapter,
  TokenUsage,
} from '../../types/src/index';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

interface OllamaTagEntry {
  name: string;
  model?: string;
  size?: number;
  modified_at?: string;
  digest?: string;
  details?: { parameter_size?: string; quantization_level?: string };
}

interface OllamaTagsResponse {
  models?: OllamaTagEntry[];
}

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string };
  /** Tokens in the prompt, per Ollama docs (non-streaming responses). */
  prompt_eval_count?: number;
  /** Tokens in the response, per Ollama docs (non-streaming responses). */
  eval_count?: number;
  total_duration?: number;
}

export class OllamaAdapter implements ProviderAdapter {
  readonly kind = 'ollama' as const;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(baseUrl: string = DEFAULT_OLLAMA_BASE_URL, fetchFn: typeof fetch = globalThis.fetch) {
    // Normalize: strip trailing slashes so path joins are predictable.
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchFn = fetchFn;
  }

  private async get(path: string, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`Ollama not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    if (!res.ok) throw new Error(`Ollama request failed: GET ${path} -> HTTP ${res.status}`);
    return res;
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await this.get('/api/tags', 10_000);
    const body = (await res.json()) as OllamaTagsResponse;
    return (body.models ?? []).map((m) => ({ id: m.name, name: m.name }));
  }

  /**
   * Ollama has no credentials — "validation" is endpoint reachability.
   * Refuses to fake a credential check (honest stub principle, ADR-0004).
   */
  async validateCredentials(): Promise<HealthResult> {
    const start = Date.now();
    try {
      await this.get('/api/tags', 10_000);
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
    return {
      ok: true,
      message: 'Ollama requires no credentials; endpoint reachable',
      latency_ms: Date.now() - start,
    };
  }

  async healthCheck(): Promise<HealthResult> {
    return this.validateCredentials();
  }

  async invokeModel(req: InvokeRequest): Promise<InvokeResult> {
    if (!req.model?.trim()) throw new Error('model is required');
    if (!Array.isArray(req.messages) || req.messages.length === 0) {
      throw new Error('messages must be a non-empty array');
    }
    const start = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: false,
          ...(req.max_tokens !== undefined ? { options: { num_predict: req.max_tokens } } : {}),
          ...(req.options ?? {}),
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      throw new Error(`Ollama not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Ollama invocation failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
    }
    const body = (await res.json()) as OllamaChatResponse;
    const text = body.message?.content ?? '';
    // Token counts come from Ollama's own counters. When absent (older
    // versions), they are 0 — never guessed from text length.
    const usage: TokenUsage = {
      tokens_in: body.prompt_eval_count ?? 0,
      tokens_out: body.eval_count ?? 0,
    };
    return { text, usage, latency_ms, model: body.model ?? req.model };
  }

  /**
   * Local inference has no provider charge, so cost is 0 by definition —
   * this is a fact about the deployment, not an estimate of a bill.
   */
  estimateCost(_usage: TokenUsage): number | null {
    return 0;
  }
}
