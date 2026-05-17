/**
 * Translation layer: domain / subsystem errors → HTTP responses.
 *
 * Kept separate from routes/provision.ts so route handlers focus on request
 * parsing and the mapping concern can be tested in isolation. Every typed
 * error a subsystem can produce must have a case here — the catch-all is
 * 500 `unexpected_provisioning_error` with `expose: false`, i.e. "this is a
 * hub bug, not an operator-actionable failure". If you see one of those in
 * production logs, add a case here instead of widening the catch-all.
 */
import { AppError, errorMessage } from '../shared/errors.js';
import { TailnetError } from '../tailnet.js';
import {
  AdbConnectFailedError,
  AdbPairFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  MdnsUnavailableError,
  ProvisioningSessionError,
  SessionKindMismatchError,
} from './errors.js';

export function mapProvisioningFailure(err: unknown): Error {
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
  return new AppError(500, 'unexpected_provisioning_error', errorMessage(err), {
    expose: false,
    cause: err,
  });
}
