import { describe, expect, it } from 'vitest';

import { mapProvisioningFailure } from '../src/provisioning/error-map.js';
import {
  AdbConnectFailedError,
  AdbPairFailedError,
  ConnectDiscoveryNeededError,
  MdnsDiscoveryTimeoutError,
  MdnsUnavailableError,
  ProvisioningSessionError,
  SessionKindMismatchError,
} from '../src/provisioning/errors.js';
import { AppError } from '../src/shared/errors.js';
import { TailnetError } from '../src/tailnet.js';

describe('mapProvisioningFailure', () => {
  it('passes AppError through unchanged', () => {
    const original = new AppError(418, 'i_am_a_teapot', 'short and stout');
    expect(mapProvisioningFailure(original)).toBe(original);
  });

  it.each([
    [new SessionKindMismatchError(['lan'], 'tailnet', 'wrong kind'), 422, 'session_kind_mismatch'],
    [new AdbConnectFailedError('conn fail'), 502, 'adb_connect_failed'],
    [new AdbPairFailedError('pair fail'), 502, 'adb_pair_failed'],
    [new MdnsUnavailableError('avahi conflict'), 503, 'mdns_unavailable'],
    [new MdnsDiscoveryTimeoutError('no service', true), 422, 'mdns_timeout'],
    [new ConnectDiscoveryNeededError('192.168.1.10'), 409, 'connect_port_needed'],
  ])('%s → %d %s', (input, expectedStatus, expectedCode) => {
    const mapped = mapProvisioningFailure(input) as AppError;
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.statusCode).toBe(expectedStatus);
    expect(mapped.code).toBe(expectedCode);
  });

  describe('TailnetError mapping', () => {
    it('401 → 502 tailnet_unauthorized', () => {
      const mapped = mapProvisioningFailure(
        new TailnetError('Headscale 401', { upstreamStatus: 401 }),
      ) as AppError;
      expect(mapped.statusCode).toBe(502);
      expect(mapped.code).toBe('tailnet_unauthorized');
    });
    it('403 → 502 tailnet_unauthorized', () => {
      const mapped = mapProvisioningFailure(
        new TailnetError('Headscale 403', { upstreamStatus: 403 }),
      ) as AppError;
      expect(mapped.statusCode).toBe(502);
      expect(mapped.code).toBe('tailnet_unauthorized');
    });
    it('503 → 503 tailnet_unavailable', () => {
      const mapped = mapProvisioningFailure(
        new TailnetError('Headscale 503', { upstreamStatus: 503 }),
      ) as AppError;
      expect(mapped.statusCode).toBe(503);
      expect(mapped.code).toBe('tailnet_unavailable');
    });
    it('no upstream status → 502 tailnet_failed', () => {
      const mapped = mapProvisioningFailure(new TailnetError('parse error')) as AppError;
      expect(mapped.statusCode).toBe(502);
      expect(mapped.code).toBe('tailnet_failed');
    });
  });

  describe('ProvisioningSessionError mapping', () => {
    it('"session not found" → 404 session_not_found', () => {
      const mapped = mapProvisioningFailure(
        new ProvisioningSessionError('session not found'),
      ) as AppError;
      expect(mapped.statusCode).toBe(404);
      expect(mapped.code).toBe('session_not_found');
    });
    it('"session expired" → 410 session_expired', () => {
      const mapped = mapProvisioningFailure(
        new ProvisioningSessionError('session expired'),
      ) as AppError;
      expect(mapped.statusCode).toBe(410);
      expect(mapped.code).toBe('session_expired');
    });
    it('other → 409 session_not_pairable', () => {
      const mapped = mapProvisioningFailure(
        new ProvisioningSessionError('session already revoked'),
      ) as AppError;
      expect(mapped.statusCode).toBe(409);
      expect(mapped.code).toBe('session_not_pairable');
    });
  });

  it('plain Error → 500 unexpected_provisioning_error (not exposed)', () => {
    const mapped = mapProvisioningFailure(new Error('something weird')) as AppError;
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('unexpected_provisioning_error');
    expect(mapped.expose).toBe(false);
  });

  it('non-Error value → 500 with stringified message', () => {
    const mapped = mapProvisioningFailure('a bare string') as AppError;
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('unexpected_provisioning_error');
    expect(mapped.message).toContain('a bare string');
  });
});
