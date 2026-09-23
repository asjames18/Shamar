/**
 * OpenAIAdapter tests against a mock OpenAI HTTP server (no network,
 * no API key needed — a fake key is injected directly). Run via `npm test`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAIAdapter } from '../openai.js';
import { createProviderAdapter } from '../index.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The fake key tests use — asserts it is only ever sent as a Bearer header. */
const FAKE_KEY = '<redacted>';
/** Lets individual tests flip the /v1/models status (200 = valid key). */
let modelsStatus = 200;

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const auth = req.headers['authorization'] ?? '';
  if (url.pathname === '/v1/models' && req.method === 'GET') {
    if (auth !== `Bearer ${FAKE_KEY}` || modelsStatus !== 200) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' },
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        data: [
          { id: 'gpt-test-a', object: 'model', created: 1720000000, owned_by: 'openai' },
          { id: 'gpt-test-b', object: 'model', created: 1720000001, owned_by: 'openai' },
        ],
      }),
    );
    return;
  }
  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    assert.equal(auth, `Bearer ${FAKE_KEY}`, 'invoke must authenticate with the Bearer header');
    const body = JSON.parse(await readBody(req)) as {
      model?: string;
      max_completion_tokens?: number;
      messages?: unknown[];
    };
    assert.ok(body.model, 'model is required');
    assert.ok(typeof body.max_completion_tokens === 'number' && body.max_completion_tokens > 0, 'completion cap required');
    assert.ok(Array.isArray(body.messages) && body.messages.length > 0, 'messages required');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-test-1',
        object: 'chat.completion',
        created: 1720000002,
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Mock reply' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found', type: 'invalid_request_error' } }));
});

let base: string;
before(async () => {
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => mock.close(() => resolve())));

test('createProviderAdapter wires openai — all kinds implemented', () => {
  const adapter = createProviderAdapter('openai');
  assert.equal(adapter.kind, 'openai');
  assert.equal(createProviderAdapter('gemini').kind, 'gemini');
});

test('listModels returns documented model entries', async () => {
  const adapter = new OpenAIAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const models = await adapter.listModels();
  assert.equal(models.length, 2);
  assert.equal(models[0].id, 'gpt-test-a');
  assert.ok(models[0].name.includes('gpt-test-a'), 'name carries the model id');
});

test('validateCredentials: no key configured -> honest failure, no network call', async () => {
  const adapter = new OpenAIAdapter({ apiKey: null, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /no OpenAI API key configured/);
  assert.ok(!result.message.includes(FAKE_KEY), 'key must never appear in messages');
});

test('validateCredentials: valid key -> ok', async () => {
  modelsStatus = 200;
  const adapter = new OpenAIAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, true);
  assert.match(result.message, /OpenAI API key valid/);
  assert.ok(typeof result.latency_ms === 'number');
});

test('validateCredentials: rejected key -> ok:false', async () => {
  modelsStatus = 401;
  const adapter = new OpenAIAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /rejected/);
  modelsStatus = 200;
});

test('invokeModel records real usage and estimateCost is always null', async () => {
  const adapter = new OpenAIAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.invokeModel({
    model: 'gpt-test-a',
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.equal(result.text, 'Mock reply');
  assert.deepEqual(result.usage, { tokens_in: 50, tokens_out: 25 });
  assert.equal(result.model, 'gpt-test-a');
  // The OpenAI API exposes no pricing — cost must be null, never guessed.
  assert.equal(adapter.estimateCost(result.usage), null);
});

test('invokeModel requires a key and a model', async () => {
  const noKey = new OpenAIAdapter({ apiKey: null, baseUrl: base });
  await assert.rejects(
    () => noKey.invokeModel({ model: 'gpt-test-a', messages: [{ role: 'user', content: 'hi' }] }),
    /no OpenAI API key configured/,
  );
  const adapter = new OpenAIAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  await assert.rejects(
    () => adapter.invokeModel({ model: '  ', messages: [{ role: 'user', content: 'hi' }] }),
    /model is required/,
  );
});
