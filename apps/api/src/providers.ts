/**
 * Provider adapter resolution for the API.
 *
 * Maps a stored provider record to its ProviderAdapter (ADR-0004).
 * Kinds without an implemented adapter throw NotImplementedError, which the
 * server surfaces as HTTP 501 — an honest "not built yet" instead of a
 * faked check or a silent failure.
 */
import { createProviderAdapter } from '@shamar/providers';
import type { Provider, ProviderAdapter } from '@control-plane/types';

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

export function adapterFor(provider: Provider): ProviderAdapter {
  try {
    return createProviderAdapter(provider.kind, { baseUrl: provider.base_url });
  } catch (err) {
    throw new NotImplementedError((err as Error).message);
  }
}
