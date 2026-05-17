/**
 * Boot-time capability detection for the hub. Probed once at startup, decorated
 * onto the Fastify instance, and exposed via /health.capabilities so the frontend
 * can hide structurally-impossible paths (e.g. QR/mDNS when the multicast socket
 * can't bind on this host).
 *
 * The intent is "fail visibly at boot, not opaquely at the user's first click".
 */
import { Bonjour } from 'bonjour-service';
import type { HubCapabilities } from '@phone-remote/protocol';

import { isConfigured as isTailnetConfigured } from './tailnet.js';

const DEFAULT_MDNS_PROBE_MS = 1_500;

let cached: HubCapabilities | null = null;

/**
 * Process-wide capability snapshot. Set once at boot by `setCapabilities`.
 * Throws if read before probe — the bug would be a route running before
 * createApp() completed, which shouldn't happen.
 */
export function getCapabilities(): HubCapabilities {
  if (!cached) {
    throw new Error('capabilities accessed before probeCapabilities/setCapabilities ran');
  }
  return cached;
}

export function setCapabilities(value: HubCapabilities): void {
  cached = value;
}

/**
 * Test-only. Drop the cached capabilities so a subsequent set/probe
 * starts fresh. Production code never needs this.
 */
export function resetCapabilities(): void {
  cached = null;
}

export async function probeCapabilities(opts: { mdnsProbeMs?: number } = {}): Promise<HubCapabilities> {
  const mdnsProbeMs = opts.mdnsProbeMs ?? DEFAULT_MDNS_PROBE_MS;
  const [mdns, tailnet] = await Promise.all([probeMdns(mdnsProbeMs), Promise.resolve(isTailnetConfigured())]);
  return { mdns, tailnet };
}

/**
 * Bring up a transient Bonjour instance, start a no-op browse, and wait the
 * probe window. If construction throws synchronously, the browser emits 'error'
 * within the window, or the multicast socket can't be opened, mDNS is reported
 * as unavailable. Conservative — we don't validate that responses actually
 * arrive, only that the socket layer is willing.
 */
async function probeMdns(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    let instance: Bonjour;
    try {
      instance = new Bonjour();
    } catch {
      settle(false);
      return;
    }

    let browser: ReturnType<Bonjour['find']>;
    try {
      browser = instance.find({ type: 'workstation', protocol: 'tcp' });
    } catch {
      safeDestroy(instance);
      settle(false);
      return;
    }

    const cleanup = (): void => {
      try {
        browser.stop();
      } catch {
        // ignore
      }
      safeDestroy(instance);
    };

    browser.on('error', () => {
      cleanup();
      settle(false);
    });

    setTimeout(() => {
      cleanup();
      settle(true);
    }, timeoutMs);
  });
}

function safeDestroy(instance: Bonjour): void {
  try {
    instance.destroy();
  } catch {
    // ignore
  }
}
