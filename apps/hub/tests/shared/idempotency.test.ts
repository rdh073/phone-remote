import { describe, expect, it } from 'vitest';

import {
  IdempotencyConflictError,
  IdempotencyGate,
  stableFingerprint,
} from '../../src/shared/idempotency.js';

describe('IdempotencyGate', () => {
  it('shares the same in-flight promise for equivalent requests', async () => {
    const gate = new IdempotencyGate<string, string>();
    let calls = 0;
    let resolveTask!: (value: string) => void;

    const first = gate.run('session-1', 'same', () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        resolveTask = resolve;
      });
    });
    const second = gate.run('session-1', 'same', () => {
      calls += 1;
      return Promise.resolve('unexpected');
    });

    resolveTask('paired');

    await expect(first).resolves.toBe('paired');
    await expect(second).resolves.toBe('paired');
    expect(calls).toBe(1);
  });

  it('rejects a different in-flight request for the same key', async () => {
    const gate = new IdempotencyGate<string, string>();

    gate.run('session-1', 'first', () => new Promise(() => {}));

    expect(() => gate.run('session-1', 'second', () => Promise.resolve('nope'))).toThrow(
      IdempotencyConflictError,
    );
  });

  it('allows a new request after the previous one settles', async () => {
    const gate = new IdempotencyGate<string, string>();

    await expect(gate.run('session-1', 'first', () => Promise.resolve('done'))).resolves.toBe('done');
    await expect(gate.run('session-1', 'second', () => Promise.resolve('next'))).resolves.toBe('next');
  });
});

describe('stableFingerprint', () => {
  it('is stable across object key order', () => {
    expect(stableFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
