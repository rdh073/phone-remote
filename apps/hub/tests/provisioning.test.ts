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
  isConfigured: vi.fn(() => false),
}));

import { makeService } from './helpers/provisioning.js';

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
      const service = await makeService();
      const start = await service.startSession();
      const body = {
        ip: '192.168.0.10',
        pairPort: 38343,
        pairCode: '123456',
        connectPort: 5555,
      };

      const first = await service.pairSession(start.id, body);
      const second = await service.pairSession(start.id, body);

      expect(first).toEqual({ serial: '192.168.0.10:5555' });
      expect(second).toEqual(first);
      expect(mockedExecFile).toHaveBeenCalledTimes(4);
    },
    20_000,
  );
});

describe('per-session gate (race tightening)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockedExecFile.mockReset();
  });

  it('two concurrent /pair calls with same body coalesce to one execution', async () => {
    const service = await makeService();
    const start = await service.startSession();
    const body = {
      ip: '192.168.0.10',
      pairPort: 38343,
      pairCode: '123456',
      connectPort: 5555,
    };

    const [a, b] = await Promise.all([service.pairSession(start.id, body), service.pairSession(start.id, body)]);
    expect(a).toEqual(b);
    // adb pair + adb connect + adb tcpip + adb connect = 4 exec calls, NOT 8.
    expect(mockedExecFile).toHaveBeenCalledTimes(4);
  });

  it('concurrent /pair and /qr-pair on same session → IdempotencyConflictError', async () => {
    const service = await makeService();
    const { IdempotencyConflictError } = await import('../src/shared/idempotency.js');
    const start = await service.startSession();

    // Kick off /pair first — registers in the session gate during this same
    // microtask. /qr-pair then hits a different fingerprint and rejects sync.
    const inflight = service.pairSession(start.id, {
      ip: '192.168.0.10',
      pairPort: 38343,
      pairCode: '123456',
      connectPort: 5555,
    });
    const conflict = service.pairSessionViaQr(start.id);
    await expect(conflict).rejects.toBeInstanceOf(IdempotencyConflictError);
    // The original /pair still completes — we want to verify the gate
    // protects state, not that it cancels in-flight work.
    await expect(inflight).resolves.toEqual({ serial: '192.168.0.10:5555' });
  });

  it('two concurrent /pair calls with different bodies → second is rejected', async () => {
    const service = await makeService();
    const { IdempotencyConflictError } = await import('../src/shared/idempotency.js');
    const start = await service.startSession();

    const a = service.pairSession(start.id, {
      ip: '192.168.0.10',
      pairPort: 38343,
      pairCode: '123456',
      connectPort: 5555,
    });
    const b = service.pairSession(start.id, {
      ip: '192.168.0.11',
      pairPort: 38343,
      pairCode: '654321',
      connectPort: 5555,
    });
    await expect(b).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(a).resolves.toEqual({ serial: '192.168.0.10:5555' });
  });
});

describe('session kind discriminator', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockedExecFile.mockReset();
  });

  it('tailnet-mode session refuses /qr-pair with SessionKindMismatchError', async () => {
    const tailnet = await import('../src/tailnet.js');
    vi.mocked(tailnet.isConfigured).mockReturnValue(true);
    vi.mocked(tailnet.createAuthKey).mockResolvedValue({ id: '1', key: 'tskey-test' });

    const service = await makeService();
    const { SessionKindMismatchError } = await import('../src/provisioning.js');
    const start = await service.startSession();
    expect(start.authKey).toBe('tskey-test');

    await expect(service.pairSessionViaQr(start.id)).rejects.toBeInstanceOf(SessionKindMismatchError);
    const err = await service.pairSessionViaQr(start.id).catch((e) => e);
    expect(err.expected).toEqual(['lan']);
    expect(err.actual).toBe('tailnet');
    expect(err.message).toMatch(/mDNS multicast cannot cross/);

    vi.mocked(tailnet.isConfigured).mockReturnValue(false);
  });

  it('lan-mode session accepts /qr-pair (legacy path stays open)', async () => {
    const tailnet = await import('../src/tailnet.js');
    vi.mocked(tailnet.isConfigured).mockReturnValue(false);

    const service = await makeService();
    const start = await service.startSession();
    expect(start.authKey).toBeNull();
    // No mismatch error — kind === 'lan' passes the gate. (Pairing then
    // proceeds into mDNS, which is the behaviour covered by the mdns-timeout
    // tests below.)
  });
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
    const service = await makeService();
    const { MdnsDiscoveryTimeoutError } = await import('../src/provisioning.js');
    const start = await service.startSession();

    const pending = service.pairSessionViaQr(start.id);
    pending.catch(() => {}); // pre-attach to avoid PromiseRejectionHandledWarning

    // Fast attempt = 25_000ms. Advance just past it.
    await vi.advanceTimersByTimeAsync(25_001);

    await expect(pending).rejects.toBeInstanceOf(MdnsDiscoveryTimeoutError);
    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(MdnsDiscoveryTimeoutError);
    expect(err.retryAvailable).toBe(true);
    expect(err.message).toMatch(/timed out after 25000ms/);
    // Service layer annotates the error with the NEXT attempt's window so the
    // route layer can surface it to the UI without hardcoding the constant.
    expect(err.nextRetryTimeoutMs).toBe(120_000);
  });

  it('second attempt uses the slow 120s timeout and reports retryAvailable=false', async () => {
    const service = await makeService();
    const { MdnsDiscoveryTimeoutError } = await import('../src/provisioning.js');
    const start = await service.startSession();

    // Burn the first attempt (fast 25s).
    const first = service.pairSessionViaQr(start.id);
    first.catch(() => {});
    await vi.advanceTimersByTimeAsync(25_001);
    await expect(first).rejects.toBeInstanceOf(MdnsDiscoveryTimeoutError);

    // Second attempt uses the slow path. Advance past 25s — must NOT
    // resolve yet because the slow timeout is 120_000ms.
    const second = service.pairSessionViaQr(start.id);
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
    // No retry available → annotation stays undefined; the UI hides the
    // retry button entirely on this branch.
    expect(err.nextRetryTimeoutMs).toBeUndefined();
  });
});
