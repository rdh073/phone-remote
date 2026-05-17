import type { FastifyInstance } from 'fastify';

import {
  PairRequest,
  ProvisionConnectBodySchema,
  QrPairBodySchema,
} from '@phone-remote/protocol';

import {
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  connectByIp,
  deleteSession,
  pairSession,
  pairSessionViaQr,
  startSession,
} from '../provisioning.js';
import { mapProvisioningFailure } from '../provisioning/error-map.js';

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
