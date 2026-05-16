import { describe, expect, it } from 'vitest';

import { CircuitBreaker, CircuitOpenError } from '../../src/shared/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after the configured failure threshold', async () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 500,
      now: () => now,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('first')))).rejects.toThrow('first');
    await expect(breaker.execute(() => Promise.reject(new Error('second')))).rejects.toThrow('second');

    await expect(breaker.execute(() => Promise.resolve('blocked'))).rejects.toBeInstanceOf(CircuitOpenError);

    now = 1_501;
    await expect(breaker.execute(() => Promise.resolve('recovered'))).resolves.toBe('recovered');
  });

  it('resets failure count after a successful call', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 500,
      now: () => 1_000,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('first')))).rejects.toThrow('first');
    await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe('ok');
    await expect(breaker.execute(() => Promise.reject(new Error('next')))).rejects.toThrow('next');
    await expect(breaker.execute(() => Promise.resolve('still closed'))).resolves.toBe('still closed');
  });
});
