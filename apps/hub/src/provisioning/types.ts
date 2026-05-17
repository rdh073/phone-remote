export const FIXED_ADB_PORT = 5555;

export type SessionStatus = 'pending' | 'pair-complete' | 'paired' | 'failed' | 'revoked';

/**
 * Provisioning session kind. Decided at startSession() based on whether a
 * tailnet auth-key was minted. Immutable for the session lifetime.
 *
 * - 'tailnet': phone joins via Headscale preauth-key, then is reachable as
 *   100.x.y.z. mDNS/QR is structurally impossible (multicast doesn't cross
 *   WireGuard) — only manual pairing-code is valid.
 * - 'lan': phone is on the same L2 segment as the hub. Both QR (mDNS) and
 *   manual pairing-code are valid.
 */
export type SessionKind = 'tailnet' | 'lan';

export interface ProvisioningSession {
  id: string;
  kind: SessionKind;
  authKeyId: string | null;
  authKey: string | null;
  loginServer: string | null;
  qrServiceName: string;
  qrPassword: string;
  qrPayload: string;
  pairIp?: string;
  status: SessionStatus;
  createdAt: Date;
  expiresAt: Date;
  serial?: string;
  error?: string;
  qrAttempts: number;
}

export interface Endpoint {
  ip: string;
  port: number;
}

export interface AdbCommandResult {
  stdout: string;
  stderr: string;
}

export interface AdbProvisioningPort {
  pair(endpoint: Endpoint, code: string): Promise<void>;
  connect(endpoint: Endpoint): Promise<AdbCommandResult>;
  tcpip(serial: string, port: number): Promise<void>;
}

export interface TailnetProvisioningPort {
  isConfigured(): boolean;
  createAuthKey(opts: {
    tags?: string[];
    reusable?: boolean;
    ephemeral?: boolean;
    expirySec?: number;
  }): Promise<{ id: string; key: string }>;
  expireAuthKey(id: string): Promise<void>;
  getLoginServer(): string;
}

export interface MdnsProvisioningSession {
  findPairing(serviceName: string, timeoutMs: number, retryAvailable: boolean): Promise<Endpoint>;
  cachedConnect(): Endpoint | null;
  waitForConnect(timeoutMs: number): Promise<Endpoint>;
  close(): void;
}

export interface MdnsProvisioningPort {
  open(): MdnsProvisioningSession;
}

export interface ProvisioningLogPort {
  warn(message: string): void;
}

export interface ProvisioningDependencies {
  adb: AdbProvisioningPort;
  tailnet: TailnetProvisioningPort;
  mdns: MdnsProvisioningPort;
  log?: ProvisioningLogPort;
  now?: () => number;
  randomHex?: (bytes: number) => string;
  sleep?: (ms: number) => Promise<void>;
}
