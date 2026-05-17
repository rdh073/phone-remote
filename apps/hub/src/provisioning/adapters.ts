/**
 * Default dependency wiring for the provisioning service. This file is the
 * composition root — concrete adapters live in their own modules and are
 * imported here only to be bolted onto the deps object.
 *
 * Read this top-to-bottom to see what real-world subsystems the service is
 * talking to: ADB CLI, Headscale, mDNS, capability snapshot.
 */
import type { HubCapabilities } from '@phone-remote/protocol';

import { createAuthKey, expireAuthKey, getLoginServer, isConfigured } from '../tailnet.js';
import { CircuitBreaker } from '../shared/circuit-breaker.js';

import { AdbCliProvisioningPort } from './adb-cli.js';
import { BonjourMdnsProvisioningPort } from './mdns.js';
import type {
  CapabilitiesPort,
  ProvisioningDependencies,
  TailnetProvisioningPort,
} from './types.js';

const ADB = process.env.ADB_PATH ?? 'adb';

/**
 * Wire concrete adapters to the ProvisioningDependencies port shape.
 * Capabilities are passed in — NOT looked up from a module-level cache —
 * so the call graph shows exactly where the snapshot comes from.
 */
export function createDefaultProvisioningDependencies(
  capabilities: HubCapabilities,
): ProvisioningDependencies {
  const adbCircuit = new CircuitBreaker({
    failureThreshold: envPositiveInt('PROVISION_ADB_CIRCUIT_FAILURES', 5),
    cooldownMs: envPositiveInt('PROVISION_ADB_CIRCUIT_COOLDOWN_MS', 30_000),
  });

  const capabilitiesPort: CapabilitiesPort = {
    mdnsAvailable: () => capabilities.mdns,
  };

  return {
    adb: new AdbCliProvisioningPort(ADB, adbCircuit),
    tailnet: tailnetPort,
    mdns: new BonjourMdnsProvisioningPort(),
    capabilities: capabilitiesPort,
    log: console,
  };
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

function envPositiveInt(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
