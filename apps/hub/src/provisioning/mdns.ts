import { Bonjour, type Service } from 'bonjour-service';

import { MdnsDiscoveryTimeoutError, MdnsUnavailableError } from './errors.js';
import type { Endpoint, MdnsProvisioningPort, MdnsProvisioningSession } from './types.js';

type Browser = ReturnType<Bonjour['find']>;

export class BonjourMdnsProvisioningPort implements MdnsProvisioningPort {
  open(): MdnsProvisioningSession {
    return new BonjourMdnsProvisioningSession();
  }
}

/**
 * Thin owner of one Bonjour instance per provisioning attempt. Each `findX`
 * call spins its own short-lived browser via the helper below; this class
 * holds nothing across calls beyond the multicast socket itself, which keeps
 * the error surface tiny — exceptions during browse are caught by the
 * helper and translated to `MdnsUnavailableError`.
 */
class BonjourMdnsProvisioningSession implements MdnsProvisioningSession {
  private readonly bonjour: Bonjour;

  constructor() {
    try {
      this.bonjour = new Bonjour();
    } catch (err) {
      throw new MdnsUnavailableError(
        `failed to open mDNS socket: ${(err as Error).message ?? String(err)}`,
        { cause: err },
      );
    }
  }

  findPairing(serviceName: string, timeoutMs: number, retryAvailable: boolean): Promise<Endpoint> {
    return waitForService(this.bonjour, 'adb-tls-pairing', serviceName, timeoutMs, retryAvailable);
  }

  waitForConnect(timeoutMs: number): Promise<Endpoint> {
    return waitForService(this.bonjour, 'adb-tls-connect', null, timeoutMs, false);
  }

  close(): void {
    try {
      this.bonjour.destroy();
    } catch {
      // ignore — close is best-effort cleanup, called from `finally`
    }
  }
}

async function waitForService(
  bonjour: Bonjour,
  type: 'adb-tls-pairing' | 'adb-tls-connect',
  serviceName: string | null,
  timeoutMs: number,
  retryAvailable: boolean,
): Promise<Endpoint> {
  return new Promise((resolve, reject) => {
    let browser: Browser;
    try {
      browser = bonjour.find({ type, protocol: 'tcp' });
    } catch (err) {
      reject(
        new MdnsUnavailableError(
          `failed to start _${type}._tcp browser: ${(err as Error).message ?? String(err)}`,
          { cause: err },
        ),
      );
      return;
    }
    const seen: { name: string; addresses?: string[]; port: number }[] = [];

    const cleanup = (): void => {
      clearTimeout(timer);
      browser.removeListener('up', onUp);
      browser.removeListener('error', onError);
      browser.stop();
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
        new MdnsUnavailableError(
          `_${type}._tcp browser error: ${err.message}`,
          { cause: err },
        ),
      );
    };

    const onUp = (service: Service): void => {
      seen.push({ name: service.name, addresses: service.addresses, port: service.port });
      const exactNameMatch = serviceName && service.name === serviceName;
      console.log(
        `[provisioning] mDNS saw service name="${service.name}" type=_${type}._tcp addresses=${JSON.stringify(service.addresses)} port=${service.port}${serviceName ? ` (want="${serviceName}"${exactNameMatch ? ', exact' : ', best-effort'})` : ''}`,
      );

      const ip = (service.addresses ?? []).find(isIpv4);
      if (!ip) return;
      cleanup();
      resolve({ ip, port: service.port });
    };

    browser.on('error', onError);
    browser.on('up', onUp);
    // Replay anything already cached on the underlying mDNS daemon (rare,
    // but covers the case where a previous browse left services in the
    // multicast-dns cache).
    for (const existing of browser.services) onUp(existing);
  });
}

function isIpv4(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value);
}
