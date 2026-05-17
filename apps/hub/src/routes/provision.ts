import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import {
  PairRequest,
  ProvisionConnectBodySchema,
  QrPairBodySchema,
} from '@phone-remote/protocol';

import {
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
} from '../provisioning.js';
import { mapProvisioningFailure } from '../provisioning/error-map.js';

/**
 * Validate req.body against a Zod schema, or short-circuit with 400 +
 * Zod's issue list. Mirrors the `readSerial` convention in routes/device.ts —
 * returns the parsed value or `null`, with the 400 already sent.
 */
function parseBody<T extends z.ZodTypeAny>(
  req: FastifyRequest,
  reply: FastifyReply,
  schema: T,
): z.infer<T> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    void reply.code(400).send({ error: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

export function registerProvisionRoutes(app: FastifyInstance): void {
  app.post('/api/provision/start', async (req) => {
    try {
      const s = await req.server.provisioning.startSession();
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
    const body = parseBody(req, reply, PairRequest);
    if (body == null) return reply;
    try {
      return await req.server.provisioning.pairSession(sessionId, body);
    } catch (err) {
      throw mapProvisioningFailure(err);
    }
  });

  app.post('/api/provision/:sessionId/qr-pair', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = parseBody(req, reply, QrPairBodySchema.default({}));
    if (body == null) return reply;
    try {
      const result = await req.server.provisioning.pairSessionViaQr(sessionId, body.connectPort);
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
    const body = parseBody(req, reply, ProvisionConnectBodySchema);
    if (body == null) return reply;
    try {
      return await req.server.provisioning.connectByIp(body);
    } catch (err) {
      throw mapProvisioningFailure(err);
    }
  });

  app.delete('/api/provision/:sessionId', async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    await req.server.provisioning.deleteSession(sessionId);
    return { ok: true };
  });
}
