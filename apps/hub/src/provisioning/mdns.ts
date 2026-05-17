import { Bonjour, type Service } from 'bonjour-service';

import { MdnsDiscoveryTimeoutError, MdnsUnavailableError } from './errors.js';
import type { Endpoint, MdnsProvisioningPort, MdnsProvisioningSession } from './types.js';

type Browser = ReturnType<Bonjour['find']>;

/**
 * Long-lived mDNS service. Owns ONE Bonjour instance per process plus
 * persistent browsers for the two service types we care about
 * (`_adb-tls-pairing._tcp` and `_adb-tls-connect._tcp`). Per-call APIs
 * register a short-lived 'up' listener on the warm browser — no bind, no
 * cold-start, no missed announcements between the operator clicking
 * "Add device" and the phone re-announcing.
 *
 * Lifecycle: lazily initialised on first use; one Bonjour instance for the
 * lifetime of the hub process. Browsers expose a permanent no-op 'error'
 * listener so a transient socket error never becomes an uncaughtException;
 * per-call awaiters attach their own 'error' listener to also fail-fast.
 *
 * Replaces the previous per-session `new Bonjour()` pattern, which paid a
 * cold-start cost on every `Add device` click and could miss the phone's
 * unsolicited announcement if the operator clicked between announces.
 */
class MdnsService {
  private bonjour: Bonjour | null = null;
  private pairingBrowser: Browser | null = null;
  private connectBrowser: Browser | null = null;

  /**
   * Idempotent bring-up. Returns the warm browsers, creating them on first
   * call. Sync-failure paths translate to `MdnsUnavailableError` so the
   * service contract holds (no leaked native errors).
   */
  private ensure(): { pairing: Browser; connect: Browser } {
    if (this.bonjour && this.pairingBrowser && this.connectBrowser) {
      return { pairing: this.pairingBrowser, connect: this.connectBrowser };
    }
    try {
      this.bonjour = new Bonjour();
    } catch (err) {
      throw new MdnsUnavailableError(
        `failed to open mDNS socket: ${(err as Error).message ?? String(err)}`,
        { cause: err },
      );
    }
    try {
      this.pairingBrowser = this.bonjour.find({ type: 'adb-tls-pairing', protocol: 'tcp' });
      this.connectBrowser = this.bonjour.find({ type: 'adb-tls-connect', protocol: 'tcp' });
    } catch (err) {
      safeDestroy(this.bonjour);
      this.bonjour = null;
      throw new MdnsUnavailableError(
        `failed to start mDNS browsers: ${(err as Error).message ?? String(err)}`,
        { cause: err },
      );
    }
    // Permanent no-op error listeners. Without these, an async socket error
    // (e.g. avahi-daemon crash, interface flap) would have no EventEmitter
    // listener and surface as uncaughtException. Per-call awaiters attach
    // their own listener on top so a pending wait still rejects cleanly.
    this.pairingBrowser.on('error', () => undefined);
    this.connectBrowser.on('error', () => undefined);
    return { pairing: this.pairingBrowser, connect: this.connectBrowser };
  }

  findPairing(serviceName: string, timeoutMs: number, retryAvailable: boolean): Promise<Endpoint> {
    const { pairing } = this.ensure();
    return awaitServiceOn(pairing, 'adb-tls-pairing', serviceName, timeoutMs, retryAvailable);
  }

  waitForConnect(timeoutMs: number): Promise<Endpoint> {
    const { connect } = this.ensure();
    return awaitServiceOn(connect, 'adb-tls-connect', null, timeoutMs, false);
  }

  shutdown(): void {
    try {
      this.pairingBrowser?.stop();
    } catch {
      // ignore
    }
    try {
      this.connectBrowser?.stop();
    } catch {
      // ignore
    }
    if (this.bonjour) safeDestroy(this.bonjour);
    this.bonjour = null;
    this.pairingBrowser = null;
    this.connectBrowser = null;
  }
}

// Module-level singleton. vi.resetModules() in tests re-evaluates this
// module, so each test gets a fresh service instance.
const sharedService = new MdnsService();

export class BonjourMdnsProvisioningPort implements MdnsProvisioningPort {
  open(): MdnsProvisioningSession {
    return new SharedMdnsSession(sharedService);
  }
}

/**
 * Session-shaped wrapper that delegates to the long-lived singleton.
 * `close()` is a no-op — the singleton stays up for the next operator.
 */
class SharedMdnsSession implements MdnsProvisioningSession {
  constructor(private readonly service: MdnsService) {}

  findPairing(serviceName: string, timeoutMs: number, retryAvailable: boolean): Promise<Endpoint> {
    return this.service.findPairing(serviceName, timeoutMs, retryAvailable);
  }

  waitForConnect(timeoutMs: number): Promise<Endpoint> {
    return this.service.waitForConnect(timeoutMs);
  }

  close(): void {
    // intentional no-op — service is process-lifetime
  }
}

/**
 * Wait for a matching service on an ALREADY-RUNNING browser. Does not start
 * or stop the browser — the singleton owns its lifecycle. Snapshots the
 * cache first (so a service announced before this call returns instantly),
 * then registers temporary listeners with a timeout fallback.
 */
async function awaitServiceOn(
  browser: Browser,
  type: 'adb-tls-pairing' | 'adb-tls-connect',
  serviceName: string | null,
  timeoutMs: number,
  retryAvailable: boolean,
): Promise<Endpoint> {
  return new Promise((resolve, reject) => {
    // Snapshot warm cache first — this is the whole point of the singleton.
    for (const existing of browser.services) {
      const cached = matchEndpoint(existing, serviceName);
      if (cached) {
        resolve(cached);
        return;
      }
    }

    const seen: { name: string; addresses?: string[]; port: number }[] = [];

    const cleanup = (): void => {
      clearTimeout(timer);
      browser.removeListener('up', onUp);
      browser.removeListener('error', onError);
    };

    const timer = setTimeout(() => {
      cleanup();
      const summary = seen.length === 0
        ? `no _${type}._tcp services advertised`
        : `saw ${seen.length} service(s) but ${serviceName ? `none matched name "${serviceName}"` : 'none had a usable IPv4 address'}: ${JSON.stringify(seen)}`;
      reject(
        new MdnsDiscoveryTimeoutError(
          `mDNS discovery for _${type}._tcp timed out after ${timeoutMs}ms - ${summary}`,
          retryAvailable,
        ),
      );
    }, timeoutMs);

    const onError = (err: Error): void => {
      cleanup();
      reject(
        new MdnsUnavailableError(`_${type}._tcp browser error: ${err.message}`, { cause: err }),
      );
    };

    const onUp = (service: Service): void => {
      seen.push({ name: service.name, addresses: service.addresses, port: service.port });
      const exactNameMatch = serviceName && service.name === serviceName;
      console.log(
        `[provisioning] mDNS saw service name="${service.name}" type=_${type}._tcp addresses=${JSON.stringify(service.addresses)} port=${service.port}${serviceName ? ` (want="${serviceName}"${exactNameMatch ? ', exact' : ', best-effort'})` : ''}`,
      );
      const matched = matchEndpoint(service, serviceName);
      if (!matched) return;
      cleanup();
      resolve(matched);
    };

    browser.on('error', onError);
    browser.on('up', onUp);
  });
}

function matchEndpoint(service: Service, serviceName: string | null): Endpoint | null {
  if (serviceName && service.name !== serviceName) return null;
  const ip = (service.addresses ?? []).find(isIpv4);
  if (!ip) return null;
  return { ip, port: service.port };
}

function safeDestroy(instance: Bonjour): void {
  try {
    instance.destroy();
  } catch {
    // ignore
  }
}

function isIpv4(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value);
}
