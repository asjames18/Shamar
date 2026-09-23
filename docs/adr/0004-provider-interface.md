# ADR-0004: Provider Interface

**Status:** Accepted
**Date:** 2026-09-23

## Context

Agents must not be coupled to one LLM company (charter §8). The control plane needs one interface covering BYOK cloud APIs, official OAuth/account auth (where providers offer it), local models (Ollama first), and OpenAI-compatible endpoints — without depending on undocumented auth hacks or consumer-subscription scraping (explicitly forbidden).

## Decision

```ts
interface ProviderAdapter {
  readonly kind: string;            // 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'openai-compatible'
  listModels(): Promise<ModelInfo[]>;
  validateCredentials(): Promise<HealthResult>;   // test call; never logs secrets
  invokeModel(req: InvokeRequest): Promise<InvokeResult>; // returns text + token usage + latency
  estimateCost(usage: TokenUsage): number | null; // null = unknown pricing; NEVER guess
  healthCheck(): Promise<HealthResult>;
}
```

Rules:

1. **Only documented interfaces.** Each adapter uses the provider's official public API. No scraping, no session automation, no reverse-engineered endpoints.
2. **Secrets by reference.** Adapters receive credentials at call time from the server's secret handling; raw keys never appear in API responses, logs, or the frontend.
3. **Cost honesty.** `estimateCost` returns `null` when pricing is unknown; the event store records `cost_usd = null`, never a fabricated number.
4. **Capability-first (future).** Agents will eventually request capabilities ("low-cost summarization") rather than hard-coded models; the interface is shaped to allow a router to sit above adapters later (Phase 6+, not v0.1).
5. Route handlers never import provider SDKs directly — only the adapter registry in `packages/providers`.

## Consequences

- **Good:** adding a provider = one new adapter file; swapping models doesn't touch agent code.
- **Good:** Ollama adapter proves zero-cost operation with the exact same interface as paid providers.
- **Bad:** lowest-common-denominator risk — provider-specific features (e.g. Anthropic prompt caching controls) need escape hatches in `InvokeRequest.options`; acceptable.

## Notes

v0.1 ships the interface + types only; the Ollama adapter lands in Phase 2, the first cloud adapter in Phase 3.
