import { Bonjour, type Service } from 'bonjour-service';

import { MdnsDiscoveryTimeoutError, MdnsUnavailableError } from './errors.js';
import type { Endpoint, MdnsProvisioningPort, MdnsProvisioningSession } from './types.js';

type Browser = ReturnType<Bonjour['find']>;

export class BonjourMdnsProvisioningPort implements MdnsProvisioningPort {
  open(): MdnsProvisioningSession {
    return new BonjourMdnsProvisioningSession();
  }
}

class BonjourMdnsProvisioningSession implements MdnsProvisioningSession {
  private readonly bonjour: Bonjour;
  private readonly connectBrowser: Browser;
  private connectBrowserError: Error | null = null;

  constructor() {
    try {
      this.bonjour = new Bonjour();
      this.connectBrowser = this.bonjour.find({ type: 'adb-tls-connect', protocol: 'tcp' });
    } catch (err) {
      throw new MdnsUnavailableError(
        `failed to open mDNS socket: ${(err as Error).message ?? String(err)}`,
        { cause: err },
      );
    }
    // Capture async socket errors that would otherwise surface as
    // uncaughtException (and via Fastify default handler as opaque 500s).
    this.connectBrowser.on('error', (err: Error) => {
      this.connectBrowserError = err;
    });
  }

  findPairing(serviceName: string, timeoutMs: number, retryAvailable: boolean): Promise<Endpoint> {
    return waitForService(this.bonjour, 'adb-tls-pairing', serviceName, timeoutMs, retryAvailable);
  }

  cachedConnect(): Endpoint | null {
    if (this.connectBrowserError) {
      throw new MdnsUnavailableError(
        `mDNS connect-browser failed: ${this.connectBrowserError.message}`,
        { cause: this.connectBrowserError },
      );
    }
    return pickAddress(this.connectBrowser.services);
  }

  waitForConnect(timeoutMs: number): Promise<Endpoint> {
    if (this.connectBrowserError) {
      return Promise.reject(
        new MdnsUnavailableError(
          `mDNS connect-browser failed: ${this.connectBrowserError.message}`,
          { cause: this.connectBrowserError },
        ),
      );
    }
    return waitForServiceOn(this.connectBrowser, timeoutMs);
  }

  close(): void {
    this.connectBrowser.stop();
    this.bonjour.destroy();
  }
}

function pickAddress(services: readonly Service[]): Endpoint | null {
  for (const service of services) {
    const ip = (service.addresses ?? []).find(isIpv4);
    if (ip) return { ip, port: service.port };
  }
  return null;
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
    for (const existing of browser.services) onUp(existing);
  });
}

function waitForServiceOn(browser: Browser, timeoutMs: number): Promise<Endpoint> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      browser.removeListener('up', onUp);
      browser.removeListener('error', onError);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new MdnsDiscoveryTimeoutError(`mDNS discovery timed out after ${timeoutMs}ms`, false));
    }, timeoutMs);

    const onError = (err: Error): void => {
      cleanup();
      reject(
        new MdnsUnavailableError(`mDNS browser error: ${err.message}`, { cause: err }),
      );
    };

    const onUp = (service: Service): void => {
      const ip = (service.addresses ?? []).find(isIpv4);
      if (!ip) return;
      cleanup();
      resolve({ ip, port: service.port });
    };

    browser.on('error', onError);
    browser.on('up', onUp);
    const existing = pickAddress(browser.services);
    if (existing) {
      cleanup();
      resolve(existing);
    }
  });
}

function isIpv4(value: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value);
}
