import { createDefaultProvisioningDependencies } from './provisioning/adapters.js';
import { createProvisioningService } from './provisioning/service.js';

const defaultProvisioningService = createProvisioningService(createDefaultProvisioningDependencies());

export const startSession = defaultProvisioningService.startSession;
export const pairSession = defaultProvisioningService.pairSession;
export const pairSessionViaQr = defaultProvisioningService.pairSessionViaQr;
export const connectByIp = defaultProvisioningService.connectByIp;
export const deleteSession = defaultProvisioningService.deleteSession;

export { createProvisioningService } from './provisioning/service.js';
export { createDefaultProvisioningDependencies } from './provisioning/adapters.js';
export {
  AdbConnectFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  ProvisioningSessionError,
  SessionKindMismatchError,
} from './provisioning/errors.js';
export type {
  AdbProvisioningPort,
  MdnsProvisioningPort,
  MdnsProvisioningSession,
  ProvisioningDependencies,
  ProvisioningSession,
  TailnetProvisioningPort,
} from './provisioning/types.js';
