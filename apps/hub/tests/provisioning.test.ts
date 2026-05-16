import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedExecFile = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    mockedExecFile(...args);
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      cb(null, { stdout: '', stderr: '' });
    }
  },
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    find() {
      return {
        on: () => undefined,
        removeListener: () => undefined,
        stop: () => undefined,
        services: [],
      };
    }
    destroy() {}
  },
}));

vi.mock('../src/tailnet.js', () => ({
  createAuthKey: vi.fn(),
  expireAuthKey: vi.fn(),
  getLoginServer: () => 'https://example.invalid',
  isConfigured: () => false,
}));

afterEach(() => {
  mockedExecFile.mockReset();
});

describe('provisioning pairSession', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockedExecFile.mockReset();
  });

  it(
    'returns same serial when pairing same session twice',
    async () => {
      const { startSession, pairSession } = await import('../src/provisioning.js');
      const start = await startSession();
      const body = {
        ip: '192.168.0.10',
        pairPort: 38343,
        pairCode: '123456',
        connectPort: 5555,
      };

      const first = await pairSession(start.id, body);
      const second = await pairSession(start.id, body);

      expect(first).toEqual({ serial: '192.168.0.10:5555' });
      expect(second).toEqual(first);
      expect(mockedExecFile).toHaveBeenCalledTimes(4);
    },
    20_000,
  );
});

describe('pairSessionViaQr mdns-timeout circuit breaker', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockedExecFile.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first attempt throws MdnsDiscoveryTimeoutError with retryAvailable=true after 25s', async () => {
    const { startSession, pairSessionViaQr, MdnsDiscoveryTimeoutError } = await import(
      '../src/provisioning.js'
    );
    const start = await startSession();

    const pending = pairSessionViaQr(start.id);
    pending.catch(() => {}); // pre-attach to avoid PromiseRejectionHandledWarning

    // Fast attempt = 25_000ms. Advance just past it.
    await vi.advanceTimersByTimeAsync(25_001);

    await expect(pending).rejects.toBeInstanceOf(MdnsDiscoveryTimeoutError);
    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(MdnsDiscoveryTimeoutError);
    expect(err.retryAvailable).toBe(true);
    expect(err.message).toMatch(/timed out after 25000ms/);
  });

  it('second attempt uses the slow 120s timeout and reports retryAvailable=false', async () => {
    const { startSession, pairSessionViaQr, MdnsDiscoveryTimeoutError } = await import(
      '../src/provisioning.js'
    );
    const start = await startSession();

    // Burn the first attempt (fast 25s).
    const first = pairSessionViaQr(start.id);
    first.catch(() => {});
    await vi.advanceTimersByTimeAsync(25_001);
    await expect(first).rejects.toBeInstanceOf(MdnsDiscoveryTimeoutError);

    // Second attempt uses the slow path. Advance past 25s — must NOT
    // resolve yet because the slow timeout is 120_000ms.
    const second = pairSessionViaQr(start.id);
    second.catch(() => {});
    await vi.advanceTimersByTimeAsync(30_000);

    // Race the pending promise against a resolved sentinel to confirm
    // it's still pending without using real time.
    const sentinel = Symbol('still-pending');
    const probe = await Promise.race([second.catch((e) => e), Promise.resolve(sentinel)]);
    expect(probe).toBe(sentinel);

    // Advance the rest of the way through the slow timeout.
    await vi.advanceTimersByTimeAsync(95_000);
    await expect(second).rejects.toBeInstanceOf(MdnsDiscoveryTimeoutError);

    const err = await second.catch((e) => e);
    expect(err.retryAvailable).toBe(false);
    expect(err.message).toMatch(/timed out after 120000ms/);
  });
});
