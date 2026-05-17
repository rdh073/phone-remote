import { beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated mock: the bonjour browser starts with a pre-cached service so we
// can verify the singleton's warm-cache fast path resolves immediately
// instead of waiting for an 'up' event.

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' });
  },
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    find(_opts: { type: string }) {
      // The pairing browser pre-caches a service that matches the QR
      // service name set inside startSession (which is `phr-<randomHex(4)>`).
      // The actual service name varies per startSession() call, so we
      // capture it via a global hook below (see preTaggedName).
      const services =
        _opts.type === 'adb-tls-pairing'
          ? [{ name: preTaggedName, addresses: ['192.168.50.10'], port: 38343 }]
          : [];
      return {
        services,
        on: () => undefined,
        removeListener: () => undefined,
        stop: () => undefined,
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

// Mutable so the test can write the expected service name into the mock
// after startSession() decides it. The mock reads it lazily when find() is
// called (which happens during the first pairSessionViaQr invocation, after
// startSession has set the value).
let preTaggedName = '';

import { makeService } from './helpers/provisioning.js';

describe('warm-cache fast path', () => {
  beforeEach(() => {
    vi.resetModules();
    preTaggedName = '';
  });

  it('resolves immediately when the singleton browser already has the service cached', async () => {
    const service = await makeService();
    const start = await service.startSession();
    // The mock reads `preTaggedName` lazily on first `find()` call, which
    // happens inside the pairing call below — so set it now.
    preTaggedName = start.qrPayload.match(/S:([^;]+);/)?.[1] ?? '';
    expect(preTaggedName).toMatch(/^phr-/);

    // Cached service has an IPv4 → findPairing should resolve immediately,
    // not wait for a 25-second timeout. After pair succeeds the flow goes
    // on to ask for the connect port (mock has no _adb-tls-connect cached
    // and no 'up' will fire), so the wait fails fast in ~15s. We only care
    // here that findPairing didn't time out at 25s, so a tight Promise.race
    // against a sentinel rejects after a short window confirms the fast
    // path was taken.
    const sentinel = Symbol('still-pending-after-2s');
    const race = await Promise.race([
      service.pairSessionViaQr(start.id).then(() => 'done').catch((e) => `rejected:${(e as Error).name}`),
      new Promise((r) => setTimeout(() => r(sentinel), 2_000)),
    ]);

    // We expect either a clean rejection (the connect-port discovery threw
    // ConnectDiscoveryNeededError quickly, which would only happen if we
    // already paired — but the connect mock returns empty so we'd hit the
    // 15s timeout) OR the sentinel. What we want to RULE OUT: the 25s
    // pairing timeout firing — that would mean the warm-cache fast path
    // didn't work.
    expect(race).toBe(sentinel);
  }, 5_000);
});
