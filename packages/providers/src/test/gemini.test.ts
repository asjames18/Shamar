/**
 * GeminiAdapter tests against a mock Gemini HTTP server (no network,
 * no API key needed — a fake key is injected directly). Run via `npm test`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GeminiAdapter } from '../gemini.js';
import { createProviderAdapter } from '../index.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The fake key tests use — asserts it is only ever sent as the key query param. */
const FAKE_KEY = '<redacted>';
/** Lets individual tests flip the /v1beta/models status (200 = valid key). */
let modelsStatus = 200;

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const key = url.searchParams.get('key') ?? '';
  if (url.pathname === '/v1beta/models' && req.method === 'GET') {
    if (key !== FAKE_KEY || modelsStatus !== 200) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' },
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        models: [
          {
            name: 'models/gemini-test-a',
            displayName: 'Gemini Test A',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-embed-test',
            displayName: 'Gemini Embed Test',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      }),
    );
    return;
  }
  if (/^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname) && req.method === 'POST') {
    assert.equal(key, FAKE_KEY, 'invoke must authenticate with the key query param');
    assert.equal(req.headers['x-api-key'], undefined, 'key must not be sent as a header');
    const body = JSON.parse(await readBody(req)) as {
      contents?: Array<{ role?: string; parts?: Array<{ text?: string }> }>;
      systemInstruction?: { parts?: Array<{ text?: string }> };
      generationConfig?: { maxOutputTokens?: number };
    };
    assert.ok(Array.isArray(body.contents) && body.contents.length > 0, 'contents required');
    assert.ok(typeof body.generationConfig?.maxOutputTokens === 'number', 'maxOutputTokens required');
    // Model names in the path are "models/<id>"-style raw ids from listModels.
    const model = decodeURIComponent(url.pathname.split('/')[3].split(':')[0]);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: `Mock reply for ${model}` }], role: 'model' } },
        ],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 17 },
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      error: { code: 404, message: 'not found', status: 'NOT_FOUND' },
    }),
  );
});

let base: string;
before(async () => {
  await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => mock.close(() => resolve())));

test('createProviderAdapter wires gemini — every kind now implemented, no 501s left', () => {
  const adapter = createProviderAdapter('gemini');
  assert.equal(adapter.kind, 'gemini');
  for (const kind of ['ollama', 'openrouter', 'anthropic', 'openai', 'gemini'] as const) {
    assert.ok(createProviderAdapter(kind).kind === kind, `${kind} wired`);
  }
});

test('listModels returns only generateContent-capable models', async () => {
  const adapter = new GeminiAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const models = await adapter.listModels();
  assert.equal(models.length, 1);
  assert.equal(models[0].id, 'gemini-test-a');
  assert.equal(models[0].name, 'gemini-test-a — Gemini Test A');
});

test('validateCredentials: no key configured -> honest failure, no network call', async () => {
  const adapter = new GeminiAdapter({ apiKey: null, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /no Gemini API key configured/);
  assert.ok(!result.message.includes(FAKE_KEY), 'key must never appear in messages');
});

test('validateCredentials: valid key -> ok', async () => {
  modelsStatus = 200;
  const adapter = new GeminiAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, true);
  assert.match(result.message, /Gemini API key valid/);
  assert.ok(typeof result.latency_ms === 'number');
});

test('validateCredentials: rejected key -> ok:false', async () => {
  modelsStatus = 400;
  const adapter = new GeminiAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.validateCredentials();
  assert.equal(result.ok, false);
  assert.match(result.message, /rejected/);
  modelsStatus = 200;
});

test('invokeModel records real usage and estimateCost is always null', async () => {
  const adapter = new GeminiAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  const result = await adapter.invokeModel({
    model: 'gemini-test-a',
    messages: [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
    ],
  });
  assert.equal(result.text, 'Mock reply for gemini-test-a');
  assert.deepEqual(result.usage, { tokens_in: 42, tokens_out: 17 });
  assert.equal(result.model, 'gemini-test-a');
  // The Gemini API exposes no pricing — cost must be null, never guessed.
  assert.equal(adapter.estimateCost(result.usage), null);
});

test('invokeModel requires a key, a model, and non-system messages', async () => {
  const noKey = new GeminiAdapter({ apiKey: null, baseUrl: base });
  await assert.rejects(
    () => noKey.invokeModel({ model: 'gemini-test-a', messages: [{ role: 'user', content: 'hi' }] }),
    /no Gemini API key configured/,
  );
  const adapter = new GeminiAdapter({ apiKey: FAKE_KEY, baseUrl: base });
  await assert.rejects(
    () => adapter.invokeModel({ model: '', messages: [{ role: 'user', content: 'hi' }] }),
    /model is required/,
  );
  await assert.rejects(
    () => adapter.invokeModel({ model: 'gemini-test-a', messages: [{ role: 'system', content: 'x' }] }),
    /at least one non-system message/,
  );
});
