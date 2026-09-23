/**
 * AnthropicAdapter tests against a mock Anthropic HTTP server (no network,
 * no API key needed — a fake key is injected directly). Run via `npm test`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AnthropicAdapter } from '../anthropic.js';
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
const FAKE_KEY = '<redacted>';
/** Lets individual tests flip the /v1/models status (200 = valid key). */
let modelsStatus = 200;

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const key = req.headers['x-api-key'] ?? '';
  const version = req.headers['anthropic-version'] ?? '';
  if (url.pathname === '/v1/models' && req.method === 'GET') {
    assert.equal(version, '2023-06-01', 'version header is required by the documented API');
    if (key !== FAKE_KEY || modelsStatus !== 200) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [
          { id: 'claude-test-a', display_name: 'Claude Test A', created_at: '2026-01-01T00:00:00Z' },
          { id: 'claude-test-b', display_name: 'Claude Test B', created_at: '2026-01-02T00:00:00Z' },
        ],
        has_more: false,
      }),
    );
    return;
  }
  if (url.pathname === '/v1/messages' && req.method === 'POST') {
    assert.equal(key, FAKE_KEY, 'invoke must authenticate with the x-api-key header');
    assert.equal(version, '2023-06-01', 'version header is required by the documented API');
    const body = JSON.parse(await readBody(req)) as {
      model?: string;
      max_tokens?: number;
      messages?: unknown[];
    };
    assert.ok(body.model, 'model is required');
    assert.ok(typeof body.max_tokens === 'number' && body.max_tokens > 0, 'max_tokens is required');
    assert.ok(Array.isArray(body.messages) && body.messages.length > 0, 'messages required');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg-test-1',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: 'Mock reply' }],
        usage: { input_tokens: 1200, output_tokens: 300 },
        stop_reason: 'end_turn',
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { type: 'not_found_error', message: 'not found' } }));
});

let base: string;
before(async () => {
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => mock.close(() => resolve())));

test('createProviderAdapter wires anthropic — all kinds implemented', () => {
  const adapter = createProviderAdapter('anthropic');
  assert.equal(adapter.kind, 'anthropic');
  assert.equal(createProviderAdapter('gemini').kind, 'gemini');
});

test('listModels returns documented model entries', async () => {
  const adapter = new AnthropicAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const models = await adapter.listModels();
  assert.equal(models.length, 2);
  assert.equal(models[0].id, 'claude-test-a');
  assert.equal(models[0].name, 'Claude Test A');
});

test('validateCredentials: no key configured -> honest failure, no network call', async () => {
  const adapter = new AnthropicAdapter({ apiKey: null, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /no Anthropic API key configured/);
  assert.ok(!result.message.includes(FAKE_KEY), 'key must never appear in messages');
});

test('validateCredentials: valid key -> ok', async () => {
  modelsStatus = 200;
  const adapter = new AnthropicAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, true);
  assert.match(result.message, /Anthropic API key valid/);
  assert.ok(typeof result.latency_ms === 'number');
});

test('validateCredentials: rejected key -> ok:false', async () => {
  modelsStatus = 401;
  const adapter = new AnthropicAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /rejected/);
  modelsStatus = 200;
});

test('invokeModel records real usage and estimateCost is always null', async () => {
  const adapter = new AnthropicAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.invokeModel({
    model: 'claude-test-a',
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.equal(result.text, 'Mock reply');
  assert.deepEqual(result.usage, { tokens_in: 1200, tokens_out: 300 });
  assert.equal(result.model, 'claude-test-a');
  // The Anthropic API exposes no pricing — cost must be null, never guessed.
  assert.equal(adapter.estimateCost(result.usage), null);
});

test('invokeModel requires a key and a model', async () => {
  const noKey = new AnthropicAdapter({ apiKey: null, baseUrl: base });
  await assert.rejects(
    () => noKey.invokeModel({ model: 'claude-test-a', messages: [{ role: 'user', content: 'hi' }] }),
    /no Anthropic API key configured/,
  );
  const adapter = new AnthropicAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  await assert.rejects(
    () => adapter.invokeModel({ model: '  ', messages: [{ role: 'user', content: 'hi' }] }),
    /model is required/,
  );
});
