/**
 * OpenRouterAdapter tests against a mock OpenRouter HTTP server (no network,
 * no API key needed — a fake key is injected directly). Run via `npm test`.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenRouterAdapter, resetPricingCache } from '../openrouter.js';
import { createProviderAdapter } from '../index.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The fake key tests use — asserts it is only ever sent as an auth header. */
const FAKE_KEY = 'sk-or-v1-test-key-12345';
/** Lets individual tests flip the auth/key endpoint status. */
let authKeyStatus = 200;

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const auth = req.headers.authorization ?? '';
  if (url.pathname === '/api/v1/models' && req.method === 'GET') {
    // Model listing is public — no auth required by the documented API.
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [
          {
            id: 'test/model-a',
            name: 'Model A',
            context_length: 128000,
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
          { id: 'test/model-b', name: 'Model B', pricing: { prompt: '0', completion: '0' } },
        ],
      }),
    );
    return;
  }
  if (url.pathname === '/api/v1/auth/key' && req.method === 'GET') {
    if (auth !== `Bearer ${FAKE_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 401, message: 'Invalid key' } }));
      return;
    }
    if (authKeyStatus !== 200) {
      res.writeHead(authKeyStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: authKeyStatus, message: 'User not found' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { label: 'test-key', usage: 1.5, limit: 10 } }));
    return;
  }
  if (url.pathname === '/api/v1/chat/completions' && req.method === 'POST') {
    assert.equal(auth, `Bearer ${FAKE_KEY}`, 'invoke must authenticate with the API key header');
    const body = JSON.parse(await readBody(req)) as { model?: string; messages?: unknown[] };
    assert.ok(body.model, 'model is required');
    assert.ok(Array.isArray(body.messages) && body.messages.length > 0, 'messages required');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'gen-test-1',
        model: body.model,
        choices: [{ message: { role: 'assistant', content: 'Mock reply' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 404, message: 'not found' } }));
});

let base: string;
before(async () => {
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => mock.close(() => resolve())));
// The pricing cache is process-wide (shared across adapter instances, like
// the server's per-request construction) — reset between tests.
beforeEach(() => resetPricingCache());

test('createProviderAdapter wires openrouter — all kinds implemented', () => {
  const adapter = createProviderAdapter('openrouter');
  assert.equal(adapter.kind, 'openrouter');
  assert.equal(createProviderAdapter('gemini').kind, 'gemini');
});

test('listModels returns models and carries context windows', async () => {
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const models = await adapter.listModels();
  assert.equal(models.length, 2);
  assert.equal(models[0].id, 'test/model-a');
  assert.equal(models[0].name, 'Model A');
  assert.equal(models[0].context_window, 128000);
});

test('validateCredentials: no key configured -> honest failure, no network call', async () => {
  const adapter = new OpenRouterAdapter({ apiKey: null, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /no OpenRouter API key configured/);
  assert.ok(!result.message.includes(FAKE_KEY), 'key must never appear in messages');
});

test('validateCredentials: valid key -> ok with label', async () => {
  authKeyStatus = 200;
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, true);
  assert.match(result.message, /test-key/);
  assert.ok(typeof result.latency_ms === 'number');
});

test('validateCredentials: rejected key -> ok:false', async () => {
  authKeyStatus = 401;
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  authKeyStatus = 200;
});

test('invokeModel records real usage and estimateCost stays null until pricing known', async () => {
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.invokeModel({
    model: 'test/model-a',
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.equal(result.text, 'Mock reply');
  assert.deepEqual(result.usage, { tokens_in: 1000, tokens_out: 500 });
  assert.equal(result.model, 'test/model-a');
  // Pricing cache is empty — cost must be null, never guessed.
  assert.equal(adapter.estimateCost(result.usage), null);
});

test('estimateCost computes from documented per-token pricing once discovered', async () => {
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  await adapter.listModels(); // caches pricing: 0.000001 in / 0.000002 out
  await adapter.invokeModel({ model: 'test/model-a', messages: [{ role: 'user', content: 'hi' }] });
  const cost = adapter.estimateCost({ tokens_in: 1000, tokens_out: 500 });
  // 1000 * 0.000001 + 500 * 0.000002 = 0.002 — floats need tolerance.
  assert.ok(cost !== null && Math.abs(cost - 0.002) < 1e-12, `expected 0.002, got ${cost}`);
});

test('invokeModel requires a key and a model', async () => {
  const noKey = new OpenRouterAdapter({ apiKey: null, baseUrl: base });
  await assert.rejects(
    () => noKey.invokeModel({ model: 'test/model-a', messages: [{ role: 'user', content: 'hi' }] }),
    /no OpenRouter API key configured/,
  );
  const adapter = new OpenRouterAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  await assert.rejects(
    () => adapter.invokeModel({ model: '  ', messages: [{ role: 'user', content: 'hi' }] }),
    /model is required/,
  );
});
