import { beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated from provisioning.test.ts so we can override the bonjour-service
// mock to simulate a bind failure (EADDRINUSE, container-blocked multicast,
// etc.) without leaking into the timeout-circuit-breaker tests.

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      cb(null, { stdout: '', stderr: '' });
    }
  },
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    constructor() {
      throw new Error('EADDRINUSE: udp 5353 in use by avahi-daemon');
    }
  },
}));

vi.mock('../src/tailnet.js', () => ({
  createAuthKey: vi.fn(),
  expireAuthKey: vi.fn(),
  getLoginServer: () => 'https://example.invalid',
  isConfigured: vi.fn(() => false),
}));

describe('mDNS infrastructure failure → MdnsUnavailableError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Bonjour bind failure during open() rejects with typed error (not generic 500)', async () => {
    const { startSession, pairSessionViaQr, MdnsUnavailableError } = await import(
      '../src/provisioning.js'
    );
    const start = await startSession();
    await expect(pairSessionViaQr(start.id)).rejects.toBeInstanceOf(MdnsUnavailableError);
    const err = await pairSessionViaQr(start.id).catch((e) => e);
    expect(err.message).toMatch(/EADDRINUSE/);
    expect(err.message).toMatch(/failed to open mDNS socket/);
  });
});
