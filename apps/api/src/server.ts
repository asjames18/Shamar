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
import { openStorage, Storage, ValidationError, ConflictError } from './store.js';
import { adapterFor, NotImplementedError } from './providers.js';
import { checkInvokePolicy, effectiveMaxTokens } from './policy.js';
import type { InvokeRequest, ApprovalStatus } from '@control-plane/types';

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
      // Agent lifecycle actions (Phase 5): pause/resume/retire with
      // server-side transition rules (retire is terminal), clone copies the
      // config into a new idle agent. Each effective transition is recorded
      // as an audit event on the agent's timeline.
      const lifecycleMatch = path.match(/^\/api\/agents\/([^/]+)\/(pause|resume|retire|clone)$/);
      if (lifecycleMatch && method === 'POST') {
        const id = decodeURIComponent(lifecycleMatch[1]);
        const action = lifecycleMatch[2] as 'pause' | 'resume' | 'retire' | 'clone';
        const body = (await readJson(req)) as { reason?: unknown; name?: unknown };
        const agent =
          action === 'clone' ? storage.cloneAgent(id, body.name) : storage.lifecycleTransition(id, action, body.reason);
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
      const modelsMatch = path.match(/^\/api\/providers\/([^/]+)\/models$/);
      if (modelsMatch && method === 'GET') {
        const provider = storage.getProvider(decodeURIComponent(modelsMatch[1]));
        if (!provider) return send(res, 404, { error: 'provider not found' });
        let adapter;
        try {
          adapter = adapterFor(provider);
        } catch (err) {
          if (err instanceof NotImplementedError) return send(res, 501, { error: err.message });
          throw err;
        }
        try {
          return send(res, 200, { models: await adapter.listModels() });
        } catch (err) {
          return send(res, 502, { error: (err as Error).message });
        }
      }
      const valMatch = path.match(/^\/api\/providers\/([^/]+)\/validate$/);
      if (valMatch && method === 'POST') {
        const provider = storage.getProvider(decodeURIComponent(valMatch[1]));
        if (!provider) return send(res, 404, { error: 'provider not found' });
        let adapter;
        try {
          adapter = adapterFor(provider);
        } catch (err) {
          if (err instanceof NotImplementedError) return send(res, 501, { error: err.message });
          throw err;
        }
        const result = await adapter.validateCredentials();
        storage.setProviderStatus(provider.id, result.ok ? 'healthy' : 'unhealthy');
        return send(res, 200, { ...result, status: result.ok ? 'healthy' : 'unhealthy' });
      }
      const invokeMatch = path.match(/^\/api\/providers\/([^/]+)\/invoke$/);
      if (invokeMatch && method === 'POST') {
        const provider = storage.getProvider(decodeURIComponent(invokeMatch[1]));
        if (!provider) return send(res, 404, { error: 'provider not found' });
        const body = (await readJson(req)) as {
          agent_id?: unknown;
          model?: unknown;
          messages?: unknown;
          max_tokens?: unknown;
        };
        if (typeof body.agent_id !== 'string' || !body.agent_id) throw new ValidationError('agent_id is required');
        if (typeof body.model !== 'string' || !body.model.trim()) throw new ValidationError('model is required');
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          throw new ValidationError('messages must be a non-empty array');
        }
        const messages: InvokeRequest['messages'] = body.messages.map((m) => {
          const role = (m as { role?: unknown })?.role;
          const content = (m as { content?: unknown })?.content;
          if (role !== 'system' && role !== 'user' && role !== 'assistant') {
            throw new ValidationError('each message needs role: system|user|assistant');
          }
          if (typeof content !== 'string') throw new ValidationError('each message needs content: string');
          return { role: role as 'system' | 'user' | 'assistant', content };
        });
        if (!storage.getAgent(body.agent_id)) throw new ValidationError(`unknown agent_id: ${body.agent_id}`);
        const agent = storage.getAgent(body.agent_id) as NonNullable<ReturnType<typeof storage.getAgent>>;
        // Autonomy gate (ADR-0006): an agent's level is enforced server-side
        // BEFORE the budget gate — L0/L1 invokes never reach a provider.
        // Fails closed with a policy.blocked audit event.
        const policy = checkInvokePolicy(agent, storage);
        if (!policy.allowed) {
          storage.appendServerEvent({
            agent_id: body.agent_id,
            type: 'policy.blocked',
            actor: 'system',
            summary: `Model invoke blocked: ${policy.error}`,
            data: { action: 'provider.invoke', reason: policy.reason, autonomy_level: agent.autonomy_level },
          });
          return send(res, 403, {
            error: policy.error,
            reason: policy.reason,
            autonomy_level: agent.autonomy_level,
          });
        }
        // L2 guardrail (ADR-0006): clamp max_tokens server-side for assisted agents.
        const { value: effectiveMaxTokensValue, clamped: maxTokensClamped } = effectiveMaxTokens(
          agent,
          typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
        );
        // Budget gate: an agent at/over its monthly budget cannot invoke models
        // through the control plane. Checked BEFORE the provider is touched so
        // no cost can be incurred. Fails closed with a policy.blocked audit event.
        const budget = storage.budgetState(body.agent_id);
        if (budget && budget.status === 'exceeded') {
          storage.checkBudget(body.agent_id); // make sure budget.exceeded is on the trail
          storage.appendServerEvent({
            agent_id: body.agent_id,
            type: 'policy.blocked',
            actor: 'system',
            summary: `Model invoke blocked: monthly budget $${budget.limit_usd.toFixed(2)} exceeded ($${budget.spend_month_usd.toFixed(2)} spent)`,
            data: { action: 'provider.invoke', reason: 'budget_exceeded', budget },
          });
          return send(res, 403, {
            error: 'monthly budget exceeded: model invokes are blocked for this agent',
            budget,
          });
        }
        // Department budget gate (ADR-0007): a department's shared monthly pool
        // is a hard money cap — an agent in an exceeded department cannot invoke
        // models through the control plane. Checked BEFORE the provider is
        // touched so no cost can be incurred. Fails closed with a
        // policy.blocked audit event.
        const deptBudget = agent.department ? storage.departmentBudgetState(agent.department) : null;
        if (deptBudget && deptBudget.status === 'exceeded') {
          storage.checkDepartmentBudget(agent.department, body.agent_id); // make sure budget.exceeded is on the trail
          storage.appendServerEvent({
            agent_id: body.agent_id,
            type: 'policy.blocked',
            actor: 'system',
            summary: `Model invoke blocked: department budget "${agent.department}" $${deptBudget.limit_usd.toFixed(2)} exceeded ($${deptBudget.spend_month_usd.toFixed(2)} spent)`,
            data: { action: 'provider.invoke', reason: 'department_budget_exceeded', department: agent.department, budget: deptBudget },
          });
          return send(res, 403, {
            error: `department monthly budget exceeded: model invokes are blocked for agents in "${agent.department}"`,
            reason: 'department_budget_exceeded',
            department: agent.department,
            budget: deptBudget,
          });
        }
        let adapter;
        try {
          adapter = adapterFor(provider);
        } catch (err) {
          if (err instanceof NotImplementedError) return send(res, 501, { error: err.message });
          throw err;
        }
        const invokeReq: InvokeRequest = {
          model: body.model,
          messages,
          ...(typeof effectiveMaxTokensValue === 'number' ? { max_tokens: effectiveMaxTokensValue } : {}),
        };
        let result;
        try {
          result = await adapter.invokeModel(invokeReq);
        } catch (err) {
          return send(res, 502, { error: (err as Error).message });
        }
        // Record the call on the agent's timeline. Prompt/response bodies are
        // never persisted — only usage numbers, latency, and model identity.
        const event = storage.appendServerEvent({
          agent_id: body.agent_id,
          type: 'model.called',
          actor: 'agent',
          summary: `Model call: ${result.model} (${result.usage.tokens_in}+${result.usage.tokens_out} tokens, ${result.latency_ms}ms)`,
          data: {
            model: result.model,
            provider: provider.id,
            provider_kind: provider.kind,
            latency_ms: result.latency_ms,
          },
          tokens_in: result.usage.tokens_in,
          tokens_out: result.usage.tokens_out,
          cost_usd: adapter.estimateCost(result.usage),
          duration_ms: result.latency_ms,
        });
        return send(res, 200, {
          text: result.text,
          usage: result.usage,
          latency_ms: result.latency_ms,
          model: result.model,
          event,
          policy: {
            autonomy_level: agent.autonomy_level,
            max_tokens_clamped: maxTokensClamped,
            ...(maxTokensClamped ? { max_tokens_effective: effectiveMaxTokensValue } : {}),
          },
        });
      }

      // --- approvals (Phase 4: human-in-the-loop governance) --------------
      if (path === '/api/approvals' && method === 'POST') {
        const body = (await readJson(req)) as {
          agent_id?: unknown;
          title?: unknown;
          detail?: unknown;
          requested_by?: unknown;
        };
        const input = {
          agent_id: body.agent_id,
          title: body.title,
          ...(typeof body.detail === 'string' ? { detail: body.detail } : {}),
          ...(body.requested_by === 'agent' || body.requested_by === 'human' || body.requested_by === 'system'
            ? { requested_by: body.requested_by }
            : {}),
        };
        const approval = storage.requestApproval(input as never);
        return send(res, 201, { approval });
      }
      if (path === '/api/approvals' && method === 'GET') {
        return send(res, 200, {
          approvals: storage.listApprovals({
            agent_id: url.searchParams.get('agent_id') ?? undefined,
            // Validated (and 400-rejected) inside listApprovals.
            status: (url.searchParams.get('status') ?? undefined) as ApprovalStatus | undefined,
          }),
        });
      }
      const decisionMatch = path.match(/^\/api\/approvals\/([^/]+)\/(grant|deny)$/);
      if (decisionMatch && method === 'POST') {
        const id = decodeURIComponent(decisionMatch[1]);
        const body = (await readJson(req)) as { decided_by?: unknown; decided_by_agent_id?: unknown; reason?: unknown };
        // ADR-0006: exactly one decider — a human (decided_by) or an L5
        // supervisor agent (decided_by_agent_id). Validated in the store.
        const approval = storage.decideApproval(id, {
          decision: (decisionMatch[2] === 'grant' ? 'granted' : 'denied') as 'granted' | 'denied',
          ...(typeof body.decided_by === 'string' ? { decided_by: body.decided_by } : {}),
          ...(typeof body.decided_by_agent_id === 'string' ? { decided_by_agent_id: body.decided_by_agent_id } : {}),
          ...(typeof body.reason === 'string' && body.reason ? { reason: body.reason } : {}),
        });
        return approval ? send(res, 200, { approval }) : send(res, 404, { error: 'approval request not found' });
      }

      // --- organization -------------------------------------------------
      if (path === '/api/org' && method === 'GET') {
        return send(res, 200, { org: storage.orgView() });
      }

      // --- departments --------------------------------------------------
      if (path === '/api/departments' && method === 'GET') {
        return send(res, 200, { departments: storage.listDepartments() });
      }
      const deptBudgetMatch = path.match(/^\/api\/departments\/([^/]+)\/budget$/);
      if (deptBudgetMatch) {
        const deptName = decodeURIComponent(deptBudgetMatch[1]);
        if (method === 'GET') {
          const budget = storage.departmentBudgetState(deptName);
          return budget ? send(res, 200, { budget }) : send(res, 404, { error: 'no budget set for this department' });
        }
        if (method === 'PUT') {
          const body = (await readJson(req)) as { budget_monthly_usd?: unknown };
          // Fail-closed validation (finite, non-negative, or null to clear)
          // happens in the store; unknown/missing clears.
          const budget = storage.setDepartmentBudget(deptName, {
            budget_monthly_usd: (body.budget_monthly_usd ?? null) as number | null,
          });
          return send(res, 200, { ok: true, budget });
        }
      }

      // --- dashboard ----------------------------------------------------
      if (path === '/api/dashboard/summary' && method === 'GET') {
        return send(res, 200, storage.dashboardSummary());
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { error: err.message });
      if (err instanceof ConflictError) return send(res, 409, { error: err.message });
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
