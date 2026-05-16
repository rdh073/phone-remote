export class ConnectDiscoveryNeededError extends Error {
  constructor(public pairIp: string) {
    super('connect_port_needed');
    this.name = 'ConnectDiscoveryNeededError';
  }
}

export class MdnsDiscoveryTimeoutError extends Error {
  constructor(message: string, public retryAvailable: boolean) {
    super(message);
    this.name = 'MdnsDiscoveryTimeoutError';
  }
}

export class AdbConnectFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdbConnectFailedError';
  }
}

export class ProvisioningSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvisioningSessionError';
  }
}
