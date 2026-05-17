import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getCapabilities } from '../capabilities.js';
import { createAuthKey, expireAuthKey, getLoginServer, isConfigured } from '../tailnet.js';
import { CircuitBreaker } from '../shared/circuit-breaker.js';
import type {
  AdbCommandResult,
  AdbProvisioningPort,
  CapabilitiesPort,
  Endpoint,
  ProvisioningDependencies,
  TailnetProvisioningPort,
} from './types.js';
import { BonjourMdnsProvisioningPort } from './mdns.js';

const run = promisify(execFile);
const ADB = process.env.ADB_PATH ?? 'adb';

export function createDefaultProvisioningDependencies(): ProvisioningDependencies {
  const adbCircuit = new CircuitBreaker({
    failureThreshold: envPositiveInt('PROVISION_ADB_CIRCUIT_FAILURES', 5),
    cooldownMs: envPositiveInt('PROVISION_ADB_CIRCUIT_COOLDOWN_MS', 30_000),
  });

  return {
    adb: new AdbCliProvisioningPort(ADB, adbCircuit),
    tailnet: tailnetPort,
    mdns: new BonjourMdnsProvisioningPort(),
    capabilities: capabilitiesPort,
    log: console,
  };
}

const capabilitiesPort: CapabilitiesPort = {
  mdnsAvailable: () => getCapabilities().mdns,
};

class AdbCliProvisioningPort implements AdbProvisioningPort {
  constructor(
    private readonly adbPath: string,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async pair(endpoint: Endpoint, code: string): Promise<void> {
    await this.run(['pair', at(endpoint), code], 30_000);
  }

  connect(endpoint: Endpoint): Promise<AdbCommandResult> {
    return this.run(['connect', at(endpoint)], 15_000);
  }

  async tcpip(serial: string, port: number): Promise<void> {
    await this.run(['-s', serial, 'tcpip', String(port)], 15_000);
  }

  private async run(args: string[], timeout: number): Promise<AdbCommandResult> {
    const result = await this.circuitBreaker.execute(() => run(this.adbPath, args, { timeout }));
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  }
}

const tailnetPort: TailnetProvisioningPort = {
  isConfigured,
  async createAuthKey(opts) {
    const key = await createAuthKey(opts);
    return { id: key.id, key: key.key };
  },
  expireAuthKey,
  getLoginServer,
};

function at(endpoint: Endpoint): string {
  return `${endpoint.ip}:${endpoint.port}`;
}

function envPositiveInt(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
