/**
 * Autonomy-level policy enforcement (ADR-0006).
 *
 * `autonomy_level` (L0–L5) was a label with no teeth — this module gives it
 * server-side meaning at the one place Shamar gates behavior: model invocation.
 * Every denial fails closed and the caller emits a `policy.blocked` audit event.
 *
 * Summary of the rules:
 * - retired        — invoke always blocked (retire is terminal).
 * - paused         — invoke blocked until the agent is resumed.
 * - L0 Monitored   — invoke always blocked.
 * - L1 Supervised  — invoke blocked unless a human granted an approval for the
 *                    agent inside the trailing 24h (grant window).
 * - L2 Assisted    — invoke allowed; max_tokens clamped to L2_MAX_TOKENS_CAP.
 * - L3 Standard    — invoke allowed (default).
 * - L4 Trusted     — invoke allowed (same invoke rights as L3 today).
 * - L5 Supervisor  — invoke allowed; may also grant/deny approvals for agents
 *                    that list it as supervisor_agent_id (enforced in store).
 *
 * The lifecycle gate runs first (a paused/retired agent cannot invoke no
 * matter its autonomy level). The budget gate (hard money cap) is separate
 * and still applies to every level — autonomy never overrides it. Autonomy
 * gates run BEFORE the budget gate in the invoke path.
 */
import type { Agent, AutonomyLevel } from '@control-plane/types';

export interface AutonomyLevelInfo {
  label: string;
  /** One-line description of what the level permits. */
  tagline: string;
}

export const AUTONOMY_LEVELS: Record<AutonomyLevel, AutonomyLevelInfo> = {
  0: { label: 'Monitored', tagline: 'Observed through Shamar; model invokes are blocked.' },
  1: { label: 'Supervised', tagline: 'Invokes only with a human grant inside the last 24h.' },
  2: { label: 'Assisted', tagline: 'Invokes allowed; max_tokens clamped to 1024.' },
  3: { label: 'Standard', tagline: 'Invokes allowed within budget.' },
  4: { label: 'Trusted', tagline: 'Invokes allowed within budget; trusted to act.' },
  5: { label: 'Supervisor', tagline: 'Invokes allowed; may decide approvals for supervised agents.' },
};

/** Trailing window inside which an L1 agent needs a granted human approval. */
export const L1_GRANT_WINDOW_MS = 24 * 3600 * 1000;

/** Server-side generation ceiling for L2 (assisted) agents. */
export const L2_MAX_TOKENS_CAP = 1024;

export interface PolicyStorage {
  /** True when the agent has a granted approval decided within the window. */
  hasRecentGrant(agentId: string, windowMs: number): boolean;
}

export type InvokeBlockReason =
  | 'lifecycle_retired'
  | 'lifecycle_paused'
  | 'autonomy_l0'
  | 'autonomy_l1_approval_required';

export type InvokePolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: InvokeBlockReason; error: string };

/**
 * Decide whether an agent may invoke a model through the control plane.
 * Pure decision logic — the caller is responsible for emitting the
 * `policy.blocked` audit event on denial.
 */
export function checkInvokePolicy(agent: Agent, storage: PolicyStorage): InvokePolicyDecision {
  // Lifecycle gate (Phase 5): a paused/retired agent cannot invoke, no matter
  // its autonomy level. Fails closed; the caller records `policy.blocked`.
  if (agent.status === 'retired') {
    return {
      allowed: false,
      reason: 'lifecycle_retired',
      error: 'agent is retired: model invokes are blocked — clone it to start a new agent with the same configuration',
    };
  }
  if (agent.status === 'paused') {
    return {
      allowed: false,
      reason: 'lifecycle_paused',
      error: 'agent is paused: model invokes are blocked — resume it via POST /api/agents/:id/resume first',
    };
  }
  switch (agent.autonomy_level) {
    case 0:
      return {
        allowed: false,
        reason: 'autonomy_l0',
        error:
          'agent autonomy level L0 (Monitored): model invokes are blocked — the agent is observed, not run, through Shamar',
      };
    case 1:
      if (!storage.hasRecentGrant(agent.id, L1_GRANT_WINDOW_MS)) {
        return {
          allowed: false,
          reason: 'autonomy_l1_approval_required',
          error:
            'agent autonomy level L1 (Supervised): invoke requires a human approval granted within the last 24h — request one via POST /api/approvals',
        };
      }
      return { allowed: true };
    default:
      return { allowed: true };
  }
}

/**
 * Server-side max_tokens ceiling. L2 agents get clamped; everyone else passes
 * through untouched. Returns the effective value and whether a clamp happened.
 */
export function effectiveMaxTokens(
  agent: Agent,
  requested: number | undefined,
): { value: number | undefined; clamped: boolean } {
  if (agent.autonomy_level !== 2 || typeof requested !== 'number') {
    return { value: requested, clamped: false };
  }
  if (requested > L2_MAX_TOKENS_CAP) {
    return { value: L2_MAX_TOKENS_CAP, clamped: true };
  }
  return { value: requested, clamped: false };
}
