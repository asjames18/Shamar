/**
 * OllamaAdapter tests against a mock Ollama HTTP server (no Ollama daemon
 * needed). Run via `npm test` (builds first, then node --test on dist).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OllamaAdapter } from '../ollama.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5:7b' }] }));
    return;
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { model?: string; stream?: boolean };
    assert.equal(body.stream, false, 'adapter must request non-streaming chat');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: body.model,
        message: { role: 'assistant', content: 'Mock reply' },
        prompt_eval_count: 120,
        eval_count: 410,
        total_duration: 1_234_567,
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

let base = '';
before(async () => {
  await new Promise<void>((resolve) => mock.listen(0, resolve));
  base = `http://localhost:${(mock.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => mock.close(() => resolve()));
});

test('listModels returns installed models', async () => {
  const models = await new OllamaAdapter(base).listModels();
  assert.deepEqual(
    models.map((m) => m.name),
    ['llama3.2:latest', 'qwen2.5:7b'],
  );
});

test('invokeModel records real token counts and latency', async () => {
  const result = await new OllamaAdapter(base).invokeModel({
    model: 'llama3.2:latest',
    messages: [{ role: 'user', content: 'Say hi' }],
    max_tokens: 50,
  });
  assert.equal(result.text, 'Mock reply');
  assert.equal(result.usage.tokens_in, 120);
  assert.equal(result.usage.tokens_out, 410);
  assert.ok(result.latency_ms >= 0);
  assert.equal(result.model, 'llama3.2:latest');
});

test('invokeModel rejects empty messages and missing model', async () => {
  const adapter = new OllamaAdapter(base);
  await assert.rejects(() => adapter.invokeModel({ model: 'x', messages: [] }), /non-empty array/);
  await assert.rejects(() => adapter.invokeModel({ model: '', messages: [{ role: 'user', content: 'hi' }] }), /model is required/);
});

test('healthCheck ok against mock, ok:false when unreachable', async () => {
  const healthy = await new OllamaAdapter(base).healthCheck();
  assert.equal(healthy.ok, true);
  assert.ok((healthy.latency_ms ?? -1) >= 0);

  const dead = await new OllamaAdapter('http://localhost:1').healthCheck();
  assert.equal(dead.ok, false);
  assert.match(dead.message, /not reachable/);
});

test('invokeModel throws a clear error when Ollama is unreachable', async () => {
  await assert.rejects(
    () => new OllamaAdapter('http://localhost:1').invokeModel({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    /not reachable/,
  );
});

test('estimateCost returns 0 for local inference (definitional, not estimated)', async () => {
  assert.equal(new OllamaAdapter(base).estimateCost({ tokens_in: 1_000_000, tokens_out: 500_000 }), 0);
});
