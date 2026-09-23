/**
 * @shamar/providers — provider adapters for the Shamar control plane.
 *
 * Adapters implement the ProviderAdapter interface from @control-plane/types
 * using only documented provider APIs (ADR-0004). Ollama ships first because
 * it is the zero-cost local path; OpenRouter is the first BYOK cloud adapter
 * (Phase 3); further cloud adapters land later. Unimplemented kinds throw — the API surfaces those as
 * HTTP 501 rather than faking a check.
 */

import type { ProviderAdapter, ProviderKind } from '../../types/src/index';
import { DEFAULT_OLLAMA_BASE_URL, OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';

export { OllamaAdapter, DEFAULT_OLLAMA_BASE_URL, OpenRouterAdapter };

export interface AdapterOptions {
  /** Base URL for local/compatible endpoints. Defaults per adapter. */
  baseUrl?: string | null;
}

/**
 * Build the adapter for a provider kind. Throws for kinds whose adapter is
 * not implemented yet — callers must surface that honestly (HTTP 501),
 * never fake provider behavior.
 */
export function createProviderAdapter(kind: ProviderKind, opts: AdapterOptions = {}): ProviderAdapter {
  switch (kind) {
    case 'ollama':
      return new OllamaAdapter(opts.baseUrl ?? DEFAULT_OLLAMA_BASE_URL);
    case 'openrouter':
      // BYOK: key comes from OPENROUTER_API_KEY env (never logged/stored).
      return new OpenRouterAdapter({ baseUrl: opts.baseUrl });
    default:
      throw new Error(`provider adapter not implemented yet: ${kind} (roadmap Phase 3)`);
  }
}
