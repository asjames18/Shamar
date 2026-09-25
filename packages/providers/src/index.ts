/**
 * @shamar/providers — provider adapters for the Shamar control plane.
 *
 * Adapters implement the ProviderAdapter interface from @control-plane/types
 * using only documented provider APIs (ADR-0004). Ollama ships first because
 * it is the zero-cost local path; OpenRouter is the first BYOK cloud adapter
 * (Phase 3), Anthropic the second, OpenAI the third, Gemini the fourth and
 * final. Unimplemented kinds throw — the API surfaces those as HTTP 501
 * rather than faking a check.
 */

import type { ProviderAdapter, ProviderKind } from '../../types/src/index';
import { DEFAULT_OLLAMA_BASE_URL, OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';
import { AnthropicAdapter } from './anthropic.js';
import { DEFAULT_OPENAI_BASE_URL, OpenAIAdapter } from './openai.js';
import { DEFAULT_GEMINI_BASE_URL, GeminiAdapter } from './gemini.js';

export {
  OllamaAdapter,
  DEFAULT_OLLAMA_BASE_URL,
  OpenRouterAdapter,
  AnthropicAdapter,
  OpenAIAdapter,
  DEFAULT_OPENAI_BASE_URL,
  GeminiAdapter,
  DEFAULT_GEMINI_BASE_URL,
};

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
    case 'anthropic':
      // BYOK: key comes from ANTHROPIC_API_KEY env (never logged/stored).
      return new AnthropicAdapter({ baseUrl: opts.baseUrl });
    case 'openai':
      // BYOK: key comes from OPENAI_API_KEY env (never logged/stored).
      return new OpenAIAdapter({ baseUrl: opts.baseUrl });
    case 'gemini':
      // BYOK: key comes from GEMINI_API_KEY env (never logged/stored).
      return new GeminiAdapter({ baseUrl: opts.baseUrl });
    default:
      throw new Error(`provider adapter not implemented yet: ${kind} (roadmap Phase 3)`);
  }
}
