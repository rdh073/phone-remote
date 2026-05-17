/**
 * Provisioning session state graph. Single source of truth for legal status
 * transitions — replaces ad-hoc `session.status = X` assignments scattered
 * across service.ts.
 *
 *   pending ───────► pair-complete ───────► paired ──┐
 *      │  └─────────────────────────────────► paired │
 *      │  ┌──────► failed ──► pending (retry)        │
 *      ▼  ▼                                          ▼
 *    failed ──────────────────────────────────► revoked (terminal)
 *
 * Illegal transitions (`paired → pending`, `revoked → *`, etc.) throw
 * InvariantViolationError, which the global error handler maps to 500
 * `invariant_violation` with expose:false — i.e. "this is a hub bug, not
 * something the operator can fix by retrying".
 *
 * Adding a new SessionStatus is a compile error here (Record exhaustiveness)
 * — that's the drift-prevention guarantee.
 */
import { InvariantViolationError } from '../shared/invariant.js';
import type { ProvisioningSession, SessionStatus } from './types.js';

const ALLOWED: Record<SessionStatus, readonly SessionStatus[]> = {
  pending: ['pair-complete', 'paired', 'failed', 'revoked'],
  'pair-complete': ['paired', 'failed', 'revoked'],
  paired: ['revoked'],
  failed: ['pending', 'revoked'],
  revoked: [],
};

export function transition(session: ProvisioningSession, to: SessionStatus): void {
  if (session.status === to) return; // idempotent self-transitions are fine
  if (!ALLOWED[session.status].includes(to)) {
    throw new InvariantViolationError(
      `illegal session transition: ${session.status} → ${to} (session ${session.id})`,
    );
  }
  session.status = to;
}
