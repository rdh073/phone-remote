/**
 * Boot-time capability detection for the hub. Probed once at startup, then
 * passed explicitly to consumers (Fastify decoration for routes, function
 * parameter for the provisioning adapters). NO module-level state — the
 * snapshot lives wherever its owner stores it.
 *
 * The intent is "fail visibly at boot, not opaquely at the user's first
 * click" plus "every consumer of this state can be seen in the call graph,
 * not hidden behind a service-locator lookup".
 */
import { Bonjour } from 'bonjour-service';
import type { HubCapabilities } from '@phone-remote/protocol';

import { isConfigured as isTailnetConfigured } from './tailnet.js';

const DEFAULT_MDNS_PROBE_MS = 1_500;

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
