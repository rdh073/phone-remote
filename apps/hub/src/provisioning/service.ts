import { randomBytes } from 'node:crypto';

import type { PairRequest } from '@phone-remote/protocol';

import { errorMessage } from '../shared/errors.js';
import { IdempotencyGate, stableFingerprint } from '../shared/idempotency.js';
import { invariant } from '../shared/invariant.js';
import {
  AdbConnectFailedError,
  AdbPairFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  MdnsUnavailableError,
  ProvisioningSessionError,
} from './errors.js';
import { assertPairable, requireMdnsCapability, requireSessionKind } from './guards.js';
import { ProvisioningSessionStore } from './session-store.js';
import { transition } from './state.js';
import {
  FIXED_ADB_PORT,
  type Endpoint,
  type ProvisioningDependencies,
  type ProvisioningSession,
} from './types.js';

const PHONE_TAG = process.env.PROVISION_TAG ?? 'tag:phone';
const EXPIRY_SEC = Number(process.env.PROVISION_EXPIRY_SEC ?? 3600);
const QR_DISCOVERY_TIMEOUT_FAST_MS = 25_000;
const QR_DISCOVERY_TIMEOUT_SLOW_MS = 120_000;
const CONNECT_DISCOVERY_TIMEOUT_MS = 15_000;

export function createProvisioningService(deps: ProvisioningDependencies) {
  const store = new ProvisioningSessionStore();
  // One gate per session — NOT per endpoint. Previously /pair and /qr-pair
  // had independent gates, which let an operator (or a stale UI event) run
  // both flows in parallel on the same session, racing over session.status /
  // .pairIp / .error. Fingerprints carry the op kind so same-op same-body
  // calls still coalesce, while a cross-op concurrent attempt gets a clean
  // 409 IdempotencyConflictError instead of silent state corruption.
  const sessionGate = new IdempotencyGate<string, { serial: string }>();
  const now = deps.now ?? Date.now;
  const randomHex = deps.randomHex ?? defaultRandomHex;
  const sleep = deps.sleep ?? defaultSleep;

  async function startSession(): Promise<ProvisioningSession> {
    await cleanupExpiredSessions();
    const tailnet = deps.tailnet.isConfigured();
    const key = tailnet
      ? await deps.tailnet.createAuthKey({
          tags: [PHONE_TAG],
          reusable: false,
          ephemeral: false,
          expirySec: EXPIRY_SEC,
        })
      : null;
    const qrServiceName = `phr-${randomHex(4)}`;
    const qrPassword = randomHex(8);
    const session: ProvisioningSession = {
      id: randomHex(8),
      kind: tailnet ? 'tailnet' : 'lan',
      authKeyId: key?.id ?? null,
      authKey: key?.key ?? null,
      loginServer: tailnet ? deps.tailnet.getLoginServer() : null,
      qrServiceName,
      qrPassword,
      qrPayload: `WIFI:T:ADB;S:${qrServiceName};P:${qrPassword};;`,
      status: 'pending',
      createdAt: new Date(now()),
      expiresAt: new Date(now() + EXPIRY_SEC * 1000),
      qrAttempts: 0,
    };
    store.set(session);
    return session;
  }

  async function pairSession(id: string, body: PairRequest): Promise<{ serial: string }> {
    return sessionGate.run(id, stableFingerprint({ op: 'pair', body }), () =>
      pairSessionInner(id, body),
    );
  }

  async function pairSessionViaQr(id: string, connectPortOverride?: number): Promise<{ serial: string }> {
    return sessionGate.run(id, stableFingerprint({ op: 'qr', connectPortOverride }), () =>
      pairSessionViaQrInner(id, connectPortOverride),
    );
  }

  async function connectByIp({ ip, port }: Endpoint): Promise<{ serial: string }> {
    const result = await deps.adb.connect({ ip, port });
    const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
    if (
      combined.includes('failed') ||
      combined.includes('cannot connect') ||
      combined.includes('unable to connect') ||
      combined.includes('no route')
    ) {
      const msg = result.stdout.trim() || result.stderr.trim() || 'unknown reason';
      throw new AdbConnectFailedError(`adb connect ${ip}:${port} failed: ${msg}`);
    }
    return { serial: `${ip}:${port}` };
  }

  async function deleteSession(id: string): Promise<void> {
    const session = store.get(id);
    if (!session) return;
    if (session.authKeyId) {
      try {
        await deps.tailnet.expireAuthKey(session.authKeyId);
      } catch {
        // best-effort
      }
    }
    transition(session, 'revoked');
    store.delete(id);
  }

  async function pairSessionInner(id: string, body: PairRequest): Promise<{ serial: string }> {
    const session = await getSession(id);
    if (session.status === 'paired') {
      invariant(session.serial, 'paired session is missing serial');
      return { serial: session.serial };
    }
    assertPairable(session);
    transition(session, 'pending');
    session.error = undefined;

    const pairEndpoint = { ip: body.ip, port: body.pairPort };
    const connectEndpoint = { ip: body.ip, port: body.connectPort };
    try {
      await pairOrThrow(pairEndpoint, body.pairCode);
      await deps.adb.connect(connectEndpoint);
      const serial = (await tryUpgradeToTcpip(`${body.ip}:${body.connectPort}`, body.ip)) ?? `${body.ip}:${body.connectPort}`;
      markPaired(session, serial);
      return { serial };
    } catch (err) {
      markFailed(session, err);
      throw err;
    }
  }

  async function pairOrThrow(endpoint: Endpoint, code: string): Promise<void> {
    try {
      await deps.adb.pair(endpoint, code);
    } catch (err) {
      // adb-CLI failures here are usually wrong code, no route, or socket
      // timeout. Wrap so the route layer can distinguish from a connect-time
      // failure (which already has its own typed error).
      throw new AdbPairFailedError(
        `adb pair ${endpoint.ip}:${endpoint.port} failed: ${errorMessage(err)}`,
        { cause: err },
      );
    }
  }

  async function pairSessionViaQrInner(id: string, connectPortOverride?: number): Promise<{ serial: string }> {
    const session = await getSession(id);
    if (session.status === 'paired') {
      invariant(session.serial, 'paired session is missing serial');
      return { serial: session.serial };
    }
    requireSessionKind(session, 'lan',
      'QR pairing is unavailable in tailnet mode — mDNS multicast cannot cross the WireGuard tunnel. ' +
      'Use the Pairing code flow with the phone\'s tailnet IP instead.');
    requireMdnsCapability(deps.capabilities);
    assertPairable(session);
    session.error = undefined;

    if (connectPortOverride && session.status === 'pair-complete' && session.pairIp) {
      return finishConnect(session, session.pairIp, connectPortOverride);
    }

    const discovery = deps.mdns.open();
    try {
      let pairIp: string;

      if (session.status === 'pair-complete' && session.pairIp) {
        pairIp = session.pairIp;
      } else {
        transition(session, 'pending');
        const attempt = session.qrAttempts;
        session.qrAttempts += 1;
        const discoveryTimeout = attempt === 0 ? QR_DISCOVERY_TIMEOUT_FAST_MS : QR_DISCOVERY_TIMEOUT_SLOW_MS;
        const pairing = await discovery.findPairing(session.qrServiceName, discoveryTimeout, attempt === 0);
        await pairOrThrow(pairing, session.qrPassword);
        pairIp = pairing.ip;
        session.pairIp = pairIp;
        transition(session, 'pair-complete');

        try {
          const connect = await discovery.waitForConnect(CONNECT_DISCOVERY_TIMEOUT_MS);
          return finishConnect(session, connect.ip, connect.port);
        } catch (err) {
          // Surface infra failures up; only treat timeouts as "ask the
          // operator for a port". waitForConnect's own replay of already-
          // cached services covers the rare case where the phone announced
          // _adb-tls-connect before the browser came up.
          if (err instanceof MdnsUnavailableError) throw err;
          throw new ConnectDiscoveryNeededError(pairIp);
        }
      }

      throw new ConnectDiscoveryNeededError(pairIp);
    } catch (err) {
      // Annotate timeouts with the next-attempt's window so the route layer
      // can surface it to the UI without hardcoding the constant.
      if (err instanceof MdnsDiscoveryTimeoutError && err.retryAvailable) {
        err.nextRetryTimeoutMs = QR_DISCOVERY_TIMEOUT_SLOW_MS;
      }
      if (!(err instanceof ConnectDiscoveryNeededError)) {
        markFailed(session, err);
      }
      throw err;
    } finally {
      discovery.close();
    }
  }

  async function finishConnect(session: ProvisioningSession, ip: string, port: number): Promise<{ serial: string }> {
    await deps.adb.connect({ ip, port });
    const serial = (await tryUpgradeToTcpip(`${ip}:${port}`, ip)) ?? `${ip}:${port}`;
    markPaired(session, serial);
    return { serial };
  }

  async function tryUpgradeToTcpip(debugAddr: string, ip: string): Promise<string | null> {
    try {
      await deps.adb.tcpip(debugAddr, FIXED_ADB_PORT);
      await sleep(1500);
      await deps.adb.connect({ ip, port: FIXED_ADB_PORT });
      return `${ip}:${FIXED_ADB_PORT}`;
    } catch (err) {
      deps.log?.warn(
        `[provisioning] tcpip-mode upgrade failed for ${debugAddr} - keeping wireless-debugging TLS connection. Reason: ${errorMessage(err)}`,
      );
      try {
        const [debugIp, debugPort] = parseEndpoint(debugAddr);
        await deps.adb.connect({ ip: debugIp, port: debugPort });
      } catch {
        throw new Error(`tcpip-mode upgrade failed and re-connect to ${debugAddr} also failed`);
      }
      return null;
    }
  }

  async function getSession(id: string): Promise<ProvisioningSession> {
    const session = store.get(id);
    if (!session) throw new ProvisioningSessionError('session not found');
    if (session.expiresAt.getTime() <= now()) {
      await deleteSession(id);
      throw new ProvisioningSessionError('session expired');
    }
    return session;
  }

  async function cleanupExpiredSessions(): Promise<void> {
    const expired = store.expired(now());
    await Promise.all(expired.map((session) => deleteSession(session.id)));
  }

  function markPaired(session: ProvisioningSession, serial: string): void {
    transition(session, 'paired');
    session.serial = serial;
  }

  function markFailed(session: ProvisioningSession, err: unknown): void {
    transition(session, 'failed');
    session.error = errorMessage(err);
  }

  return {
    startSession,
    pairSession,
    pairSessionViaQr,
    connectByIp,
    deleteSession,
  };
}

function parseEndpoint(serial: string): [string, number] {
  const lastColon = serial.lastIndexOf(':');
  invariant(lastColon > 0, `invalid ADB endpoint: ${serial}`);
  const port = Number(serial.slice(lastColon + 1));
  invariant(Number.isInteger(port) && port > 0, `invalid ADB endpoint port: ${serial}`);
  return [serial.slice(0, lastColon), port];
}

function defaultRandomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
