/**
 * Provisioning barrel. Exposes:
 *  - createDefaultProvisioningService(capabilities) — the composition entry
 *    point. App boot calls this with the probed capabilities snapshot and
 *    decorates Fastify with the result. Tests call it with mock deps.
 *  - Re-exports of the building blocks for direct use in tests
 *    (createProvisioningService, createDefaultProvisioningDependencies).
 *  - Re-exports of the typed error classes that the route layer's
 *    error-map needs for instanceof discrimination.
 *
 * NO module-level singleton — the previous design instantiated the service
 * at import time, which made capabilities injection impossible without
 * resorting to a hidden module-scope cache. Now the only state lives in
 * the Fastify instance.
 */
import type { HubCapabilities } from '@phone-remote/protocol';

import { createDefaultProvisioningDependencies } from './provisioning/adapters.js';
import { createProvisioningService } from './provisioning/service.js';

export function createDefaultProvisioningService(capabilities: HubCapabilities) {
  return createProvisioningService(createDefaultProvisioningDependencies(capabilities));
}

export type ProvisioningService = ReturnType<typeof createDefaultProvisioningService>;

export { createProvisioningService } from './provisioning/service.js';
export { createDefaultProvisioningDependencies } from './provisioning/adapters.js';
export {
  AdbConnectFailedError,
  AdbPairFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  MdnsUnavailableError,
  ProvisioningSessionError,
  SessionKindMismatchError,
} from './provisioning/errors.js';
export type {
  AdbProvisioningPort,
  CapabilitiesPort,
  MdnsProvisioningPort,
  MdnsProvisioningSession,
  ProvisioningDependencies,
  ProvisioningSession,
  TailnetProvisioningPort,
} from './provisioning/types.js';
