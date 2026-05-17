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

import { makeService } from './helpers/provisioning.js';

describe('mDNS infrastructure failure → MdnsUnavailableError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Bonjour bind failure during open() rejects with typed error (not generic 500)', async () => {
    // Capability `true` so the gate doesn't short-circuit — we want
    // the test to exercise the RUNTIME bind-failure path, not the boot probe.
    const service = await makeService({ mdns: true });
    const { MdnsUnavailableError } = await import('../src/provisioning.js');
    const start = await service.startSession();
    await expect(service.pairSessionViaQr(start.id)).rejects.toBeInstanceOf(MdnsUnavailableError);
    const err = await service.pairSessionViaQr(start.id).catch((e) => e);
    expect(err.message).toMatch(/EADDRINUSE/);
    expect(err.message).toMatch(/failed to open mDNS socket/);
  });

  it('capability false short-circuits before Bonjour is touched', async () => {
    // Boot-probe result false. The service must refuse without ever trying
    // to instantiate Bonjour (so the EADDRINUSE message from the mock would
    // NOT appear).
    const service = await makeService({ mdns: false });
    const { MdnsUnavailableError } = await import('../src/provisioning.js');
    const start = await service.startSession();
    const err = await service.pairSessionViaQr(start.id).catch((e) => e);
    expect(err).toBeInstanceOf(MdnsUnavailableError);
    expect(err.message).toMatch(/boot probe failed/);
    expect(err.message).not.toMatch(/EADDRINUSE/);
  });
});
