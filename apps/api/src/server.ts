/**
 * REST API server — zero runtime dependencies (plain node:http).
 *
 * Auth: API key via `x-api-key` header or `Authorization: Bearer <key>`.
 * The expected key comes from AGENTOS_DEV_API_KEY; only its scrypt hash is
 * kept in memory and compared with timingSafeEqual. All /api routes except
 * /api/health require a valid key.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { openStorage, Storage, ValidationError } from './store.js';

const PORT = Number(process.env.API_PORT ?? 4000);

function loadApiKeyHash(): Buffer | null {
  const key = process.env.AGENTOS_DEV_API_KEY;
  if (!key) return null;
  return scryptSync(key, 'control-plane-dev-salt', 64);
}

function authorized(req: IncomingMessage, expected: Buffer | null): boolean {
  if (!expected) return false;
  const header = req.headers['x-api-key'];
  const authHeader = req.headers.authorization ?? '';
  const bearer = authHeader.replace(/^Bearer /i, '');
  const provided = (Array.isArray(header) ? header[0] : header) ?? (bearer || undefined) ?? '';
  if (!provided) return false;
  const candidate = scryptSync(provided, 'control-plane-dev-salt', 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(text);
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function createApp(storage: Storage) {
  // Hash is computed when the app is created (not at module import), so tests
  // and embedders can set AGENTOS_DEV_API_KEY before calling createApp.
  const expectedKeyHash = loadApiKeyHash();
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';
      const path = url.pathname;

      if (path === '/api/health' && method === 'GET') {
        return send(res, 200, { ok: true, service: 'control-plane-api', version: '0.1.0' });
      }

      if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });
      if (!authorized(req, expectedKeyHash)) return send(res, 401, { error: 'unauthorized: provide a valid API key via x-api-key header' });

      // --- agents -------------------------------------------------------
      if (path === '/api/agents' && method === 'GET') return send(res, 200, { agents: storage.listAgents() });
      if (path === '/api/agents' && method === 'POST') {
        const agent = storage.createAgent((await readJson(req)) as never);
        return send(res, 201, { agent });
      }
      const detailMatch = path.match(/^\/api\/agents\/([^/]+)\/detail$/);
      if (detailMatch && method === 'GET') {
        const detail = storage.getAgentDetail(decodeURIComponent(detailMatch[1]));
        return detail ? send(res, 200, detail) : send(res, 404, { error: 'agent not found' });
      }
      const agentMatch = path.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch) {
        const id = decodeURIComponent(agentMatch[1]);
        if (method === 'GET') {
          const agent = storage.getAgent(id);
          return agent ? send(res, 200, { agent }) : send(res, 404, { error: 'agent not found' });
        }
        if (method === 'PATCH') {
          const agent = storage.updateAgent(id, (await readJson(req)) as never);
          return agent ? send(res, 200, { agent }) : send(res, 404, { error: 'agent not found' });
        }
        if (method === 'DELETE') {
          return storage.deleteAgent(id) ? send(res, 200, { deleted: true }) : send(res, 404, { error: 'agent not found' });
        }
      }
      const hbMatch = path.match(/^\/api\/agents\/([^/]+)\/heartbeat$/);
      if (hbMatch && method === 'POST') {
        const agent = storage.heartbeat(decodeURIComponent(hbMatch[1]));
        return agent ? send(res, 200, { agent }) : send(res, 404, { error: 'agent not found' });
      }

      // --- events -------------------------------------------------------
      if (path === '/api/events' && method === 'POST') {
        const body = (await readJson(req)) as { events?: unknown[] } & Record<string, unknown>;
        const inputs = Array.isArray(body.events) ? body.events : [body];
        const events = inputs.map((e) => storage.appendEvent(e as never));
        return send(res, 201, { events: inputs.length === 1 && !body.events ? events[0] : events });
      }
      if (path === '/api/events' && method === 'GET') {
        const limit = url.searchParams.get('limit');
        return send(res, 200, {
          events: storage.queryEvents({
            agent_id: url.searchParams.get('agent_id') ?? undefined,
            type: url.searchParams.get('type') ?? undefined,
            limit: limit ? Number(limit) : undefined,
          }),
        });
      }

      // --- providers ----------------------------------------------------
      if (path === '/api/providers' && method === 'GET') return send(res, 200, { providers: storage.listProviders() });
      if (path === '/api/providers' && method === 'POST') {
        const provider = storage.createProvider((await readJson(req)) as never);
        return send(res, 201, { provider });
      }
      const valMatch = path.match(/^\/api\/providers\/([^/]+)\/validate$/);
      if (valMatch && method === 'POST') {
        // Honest stub: live credential validation lands with the provider
        // adapters in Phase 2/3 (ADR-0004). We refuse to fake a check.
        return send(res, 501, { error: 'credential validation not implemented yet (roadmap Phase 2/3)' });
      }

      // --- dashboard ----------------------------------------------------
      if (path === '/api/dashboard/summary' && method === 'GET') {
        return send(res, 200, storage.dashboardSummary());
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { error: err.message });
      if (err instanceof SyntaxError) return send(res, 400, { error: 'invalid JSON body' });
      console.error('request failed:', err);
      return send(res, 500, { error: 'internal server error' });
    }
  });
}

export function startServer(storage?: Storage) {
  const store = storage ?? openStorage();
  const server = createApp(store);
  server.listen(PORT, () => {
    console.log(`control-plane API listening on http://localhost:${PORT}`);
    if (!process.env.AGENTOS_DEV_API_KEY) console.warn('WARNING: AGENTOS_DEV_API_KEY is not set — all /api routes will return 401.');
  });
  return { server, storage: store };
}
