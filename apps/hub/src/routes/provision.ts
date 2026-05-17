import type { FastifyInstance } from 'fastify';

import {
  PairRequest,
  ProvisionConnectBodySchema,
  QrPairBodySchema,
} from '@phone-remote/protocol';

import {
  AdbConnectFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  ProvisioningSessionError,
  connectByIp,
  deleteSession,
  pairSession,
  pairSessionViaQr,
  startSession,
} from '../provisioning.js';
import { AppError, errorMessage } from '../shared/errors.js';

export function registerProvisionRoutes(app: FastifyInstance): void {
  app.post('/api/provision/start', async () => {
    try {
      const s = await startSession();
      return {
        sessionId: s.id,
        authKey: s.authKey,
        loginServer: s.loginServer,
        qrPayload: s.qrPayload,
        expiresAt: s.expiresAt.toISOString(),
      };
    } catch (err) {
      throw mapProvisioningFailure(err);
    }
  });

  app.post('/api/provision/:sessionId/pair', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = PairRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    try {
      return await pairSession(sessionId, parsed.data);
    } catch (err) {
      throw mapProvisioningFailure(err);
    }
  });

  app.post('/api/provision/:sessionId/qr-pair', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const parsed = QrPairBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    try {
      const result = await pairSessionViaQr(sessionId, parsed.data.connectPort);
      return { kind: 'done', serial: result.serial };
    } catch (err) {
      if (err instanceof ConnectDiscoveryNeededError) {
        return reply.code(409).send({ kind: 'need-port', pairIp: err.pairIp });
      }
      if (err instanceof MdnsDiscoveryTimeoutError) {
        return reply.code(422).send({
          kind: 'mdns-timeout',
          message: err.message,
          retryAvailable: err.retryAvailable,
        });
      }
      throw mapProvisioningFailure(err);
    }
  });

  // Session-less: the USB-over-TCP path needs no pairing-code, no Tailscale
  // auth-key, no mDNS — the phone's already trusted via USB and (typically)
  // already on the tailnet, so the hub just runs `adb connect`.
  app.post('/api/provision/connect', async (req, reply) => {
    const parsed = ProvisionConnectBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });
    try {
      return await connectByIp(parsed.data);
    } catch (err) {
      throw mapProvisioningFailure(err);
    }
  });

  app.delete('/api/provision/:sessionId', async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    await deleteSession(sessionId);
    return { ok: true };
  });
}

function mapProvisioningFailure(err: unknown): Error {
  if (err instanceof AppError) return err;
  if (err instanceof AdbConnectFailedError) {
    return new AppError(502, 'adb_connect_failed', err.message, { cause: err });
  }
  if (err instanceof ProvisioningSessionError) {
    if (err.message === 'session not found') {
      return new AppError(404, 'session_not_found', err.message, { cause: err });
    }
    if (err.message === 'session expired') {
      return new AppError(410, 'session_expired', err.message, { cause: err });
    }
    return new AppError(409, 'session_not_pairable', err.message, { cause: err });
  }
  return new AppError(502, 'provisioning_failed', errorMessage(err), { cause: err });
}
