/**
 * Gemini provider adapter (ADR-0004) — Phase 3, fourth and final BYOK cloud adapter.
 *
 * Uses only the documented Gemini API (Google AI Studio):
 *   GET  /v1beta/models           — documented List Models endpoint; requires
 *                                    the API key, so a 200 here doubles as
 *                                    credential validation (400/403 = bad key).
 *                                    Makes no model call, so validating costs
 *                                    nothing.
 *   POST /v1beta/models/{model}:generateContent
 *                                 — documented Generate Content endpoint;
 *                                   returns real token usage in
 *                                   `usageMetadata` (promptTokenCount,
 *                                   candidatesTokenCount).
 *
 * BYOK credential sourcing: the API key is passed to the constructor or read
 * from the `GEMINI_API_KEY` environment variable (set it in your `.env`;
 * never commit it). The key is sent only as the documented `key` query
 * parameter — it is never logged, never stored by the adapter, and never
 * echoed back.
 *
 * Cost semantics: the Gemini API exposes no pricing endpoint, so estimateCost
 * always returns null (never guessed), matching the null-cost rule in
 * ADR-0003. The dashboard still records real token usage from every invoke;
 * cost_usd on events stays null for Gemini until the operator supplies their
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

export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const GEMINI_API_VERSION = 'v1beta';

export interface GeminiOptions {
  /** API key (BYOK). Defaults to process.env.GEMINI_API_KEY. */
  apiKey?: string | null;
  /** Base URL. Defaults to https://generativelanguage.googleapis.com. Overridable for tests. */
  baseUrl?: string | null;
}

interface GeminiModelEntry {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models?: GeminiModelEntry[];
  error?: { code?: number; message?: string; status?: string };
}

interface GeminiContentPart {
  text?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: GeminiContentPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { code?: number; message?: string; status?: string };
}

type FetchFn = typeof fetch;

export class GeminiAdapter implements ProviderAdapter {
  readonly kind: ProviderKind = 'gemini';

  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchFn: FetchFn;

  constructor(opts: GeminiOptions = {}, fetchFn: FetchFn = fetch) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, '');
    const envKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined;
    this.apiKey = opts.apiKey ?? (envKey && envKey.trim() ? envKey.trim() : null);
    this.fetchFn = fetchFn;
  }

  /** Key is present — used only for internal gating, never surfaced. */
  private requireKey(): string {
    if (!this.apiKey) {
      throw new Error('no Gemini API key configured (set GEMINI_API_KEY)');
    }
    return this.apiKey;
  }

  /** Documented Gemini auth: the key goes in the `key` query parameter. */
  private withKey(path: string, key: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${this.baseUrl}${path}${sep}key=${encodeURIComponent(key)}`;
  }

  private async request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new Error(`Gemini not reachable at ${this.baseUrl}: ${(err as Error).message}`);
    }
    return res;
  }

  private static async readError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { message?: string; status?: string } };
      return body.error?.message ?? body.error?.status ?? `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const key = this.requireKey();
    const res = await this.request(
      this.withKey(`/${GEMINI_API_VERSION}/models`, key),
      { method: 'GET', headers: { accept: 'application/json' } },
      15_000,
    );
    if (!res.ok) {
      throw new Error(`Gemini list models failed: ${await GeminiAdapter.readError(res)}`);
    }
    const body = (await res.json()) as GeminiModelsResponse;
    return (body.models ?? [])
      .filter((m) => m.name && (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => {
        const id = (m.name as string).replace(/^models\//, '');
        const name = m.displayName && m.displayName.trim() ? `${id} — ${m.displayName.trim()}` : id;
        return { id, name } as ModelInfo;
      });
  }

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
        this.withKey(`/${GEMINI_API_VERSION}/models`, key),
        { method: 'GET', headers: { accept: 'application/json' } },
        15_000,
      );
      if (res.status === 400 || res.status === 403) {
        return {
          ok: false,
          message: `Gemini API key rejected: ${await GeminiAdapter.readError(res)}`,
          latency_ms: Date.now() - start,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: `Gemini key check failed: ${await GeminiAdapter.readError(res)}`,
          latency_ms: Date.now() - start,
        };
      }
      return { ok: true, message: 'Gemini API key valid', latency_ms: Date.now() - start };
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
    // generateContent takes user/model roles; system messages become a systemInstruction.
    const systemTexts: string[] = [];
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const m of req.messages) {
      const text = m.content ?? '';
      if (m.role === 'system') {
        systemTexts.push(text);
      } else {
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text }] });
      }
    }
    if (contents.length === 0) {
      throw new Error('Gemini invoke requires at least one non-system message');
    }
    const res = await this.request(
      this.withKey(
        `/${GEMINI_API_VERSION}/models/${encodeURIComponent(req.model)}:generateContent`,
        key,
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemTexts.length > 0
            ? { systemInstruction: { parts: [{ text: systemTexts.join('\n\n') }] } }
            : {}),
          generationConfig: { maxOutputTokens: req.max_tokens ?? 1024 },
          ...(req.options ?? {}),
        }),
      },
      120_000,
    );
    if (!res.ok) {
      throw new Error(`Gemini invoke failed: ${await GeminiAdapter.readError(res)}`);
    }
    const body = (await res.json()) as GeminiGenerateContentResponse;
    if (body.error) {
      throw new Error(`Gemini invoke failed: ${body.error.message ?? body.error.status}`);
    }
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('');
    const usage: TokenUsage = {
      tokens_in: body.usageMetadata?.promptTokenCount ?? 0,
      tokens_out: body.usageMetadata?.candidatesTokenCount ?? 0,
    };
    return { text, usage, latency_ms: Date.now() - start, model: req.model };
  }

  /**
   * The Gemini API exposes no pricing endpoint, so there is no documented
   * source to compute cost from. Always null (never guessed) — ADR-0003.
   */
  estimateCost(_usage: TokenUsage): number | null {
    return null;
  }
}
