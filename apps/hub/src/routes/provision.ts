import type { FastifyInstance } from 'fastify';

import {
  PairRequest,
  ProvisionConnectBodySchema,
  QrPairBodySchema,
} from '@phone-remote/protocol';

import {
  AdbConnectFailedError,
  AdbPairFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  MdnsUnavailableError,
  ProvisioningSessionError,
  SessionKindMismatchError,
  connectByIp,
  deleteSession,
  pairSession,
  pairSessionViaQr,
  startSession,
} from '../provisioning.js';
import { AppError, errorMessage } from '../shared/errors.js';
import { TailnetError } from '../tailnet.js';

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

/**
 * Exhaustive provisioning error → HTTP mapping. Every error class produced by
 * the service / adapters / tailnet layer must have a case here. The fall-
 * through at the bottom is a 500 with `expose: false` — i.e. "this is a bug
 * in the hub, not an operator-actionable failure". If you see one of those
 * in production logs, add a case above instead of widening the catch-all.
 *
 * The /qr-pair route handles ConnectDiscoveryNeededError and
 * MdnsDiscoveryTimeoutError inline (they have bespoke 409/422 response
 * shapes) — they're listed here too for completeness so the wrapping route
 * handlers don't accidentally fall through to 500 if invoked from a
 * different path.
 */
function mapProvisioningFailure(err: unknown): Error {
  if (err instanceof AppError) return err;
  if (err instanceof SessionKindMismatchError) {
    return new AppError(422, 'session_kind_mismatch', err.message, { cause: err });
  }
  if (err instanceof AdbConnectFailedError) {
    return new AppError(502, 'adb_connect_failed', err.message, { cause: err });
  }
  if (err instanceof AdbPairFailedError) {
    return new AppError(502, 'adb_pair_failed', err.message, { cause: err });
  }
  if (err instanceof MdnsUnavailableError) {
    return new AppError(503, 'mdns_unavailable', err.message, { cause: err });
  }
  if (err instanceof MdnsDiscoveryTimeoutError) {
    return new AppError(422, 'mdns_timeout', err.message, { cause: err });
  }
  if (err instanceof ConnectDiscoveryNeededError) {
    return new AppError(409, 'connect_port_needed', err.message, { cause: err });
  }
  if (err instanceof TailnetError) {
    const upstream = err.upstreamStatus;
    if (upstream === 401 || upstream === 403) {
      return new AppError(502, 'tailnet_unauthorized', err.message, { cause: err });
    }
    if (upstream && upstream >= 500) {
      return new AppError(503, 'tailnet_unavailable', err.message, { cause: err });
    }
    return new AppError(502, 'tailnet_failed', err.message, { cause: err });
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
  // Catch-all: an error escaped a subsystem without being typed. Treat as a
  // hub bug, not as an upstream failure — surface a generic 500 so it shows
  // up in monitoring instead of being silently bucketed under
  // 'provisioning_failed' 502.
  return new AppError(500, 'unexpected_provisioning_error', errorMessage(err), {
    expose: false,
    cause: err,
  });
}
