import { describe, expect, it } from 'vitest';

import { transition } from '../src/provisioning/state.js';
import { InvariantViolationError } from '../src/shared/invariant.js';
import type { ProvisioningSession, SessionStatus } from '../src/provisioning/types.js';

function makeSession(status: SessionStatus): ProvisioningSession {
  return {
    id: 'test-session',
    kind: 'lan',
    authKeyId: null,
    authKey: null,
    loginServer: null,
    qrServiceName: 'phr-test',
    qrPassword: 'test-password',
    qrPayload: 'WIFI:T:ADB;S:phr-test;P:test-password;;',
    status,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    qrAttempts: 0,
  };
}

describe('session state transitions', () => {
  describe('allowed transitions', () => {
    it.each([
      ['pending', 'pair-complete'],
      ['pending', 'paired'],
      ['pending', 'failed'],
      ['pending', 'revoked'],
      ['pair-complete', 'paired'],
      ['pair-complete', 'failed'],
      ['pair-complete', 'revoked'],
      ['paired', 'revoked'],
      ['failed', 'pending'],
      ['failed', 'revoked'],
    ] as const)('%s → %s', (from, to) => {
      const session = makeSession(from);
      transition(session, to);
      expect(session.status).toBe(to);
    });
  });

  describe('illegal transitions throw InvariantViolationError', () => {
    it.each([
      ['paired', 'pending'],
      ['paired', 'pair-complete'],
      ['paired', 'failed'],
      ['revoked', 'pending'],
      ['revoked', 'pair-complete'],
      ['revoked', 'paired'],
      ['revoked', 'failed'],
      ['pair-complete', 'pending'],
    ] as const)('%s → %s', (from, to) => {
      const session = makeSession(from);
      expect(() => transition(session, to)).toThrow(InvariantViolationError);
      // Status must NOT have been mutated.
      expect(session.status).toBe(from);
    });
  });

  describe('self-transitions are idempotent no-ops', () => {
    it.each(['pending', 'pair-complete', 'paired', 'failed', 'revoked'] as const)(
      '%s → %s',
      (status) => {
        const session = makeSession(status);
        expect(() => transition(session, status)).not.toThrow();
        expect(session.status).toBe(status);
      },
    );
  });

  it('error message names both states and the session id', () => {
    const session = makeSession('paired');
    try {
      transition(session, 'pending');
    } catch (err) {
      expect((err as Error).message).toMatch(/paired/);
      expect((err as Error).message).toMatch(/pending/);
      expect((err as Error).message).toMatch(/test-session/);
      return;
    }
    throw new Error('expected transition to throw');
  });
});
