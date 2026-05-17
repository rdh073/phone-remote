export class ConnectDiscoveryNeededError extends Error {
  constructor(public pairIp: string) {
    super('connect_port_needed');
    this.name = 'ConnectDiscoveryNeededError';
  }
}

export class MdnsDiscoveryTimeoutError extends Error {
  /**
   * Window (ms) the NEXT retry attempt would use, if `retryAvailable` is true.
   * Set by the service layer after the error is caught, so the route layer
   * (and ultimately the frontend) can render an accurate "retry with a longer
   * Xs discovery window" hint without hardcoding the value.
   */
  public nextRetryTimeoutMs?: number;
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

export class AdbPairFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AdbPairFailedError';
  }
}

/**
 * Raised when the Bonjour multicast socket cannot be brought up, or when a
 * running browser emits a socket-level error. Distinct from
 * `MdnsDiscoveryTimeoutError` (which means the infrastructure works, the
 * announcement just never came) — this one means mDNS is structurally
 * unavailable on this host (avahi-daemon owns 5353, container netns blocks
 * multicast, etc.). Maps to 503, not 502: the operator can't fix this by
 * retrying.
 */
export class MdnsUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MdnsUnavailableError';
  }
}

export class ProvisioningSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvisioningSessionError';
  }
}

export class SessionKindMismatchError extends Error {
  constructor(
    public expected: readonly ('tailnet' | 'lan')[],
    public actual: 'tailnet' | 'lan',
    message: string,
  ) {
    super(message);
    this.name = 'SessionKindMismatchError';
  }
}
