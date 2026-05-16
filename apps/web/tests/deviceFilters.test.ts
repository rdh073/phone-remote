import { describe, expect, it } from 'vitest';

import {
  UNKNOWN_LOCATION,
  getDeviceLocationKeys,
  getDeviceTags,
  getStateKey,
  matchesLocationFilters,
  matchesSearch,
  matchesTagFilters,
} from '../src/deviceFilters';
import type { Device } from '@phone-remote/protocol';

describe('deviceFilters', () => {
  it('extracts location keys from explicit fields and tag prefixes', () => {
    const device: Device = {
      serial: '100.64.0.1:5555',
      state: 'device',
      source: 'tcp',
      tailnet: {
        location: 'sg',
        region: 'sea',
        site: 'sg-15',
        tags: ['tag:phone', 'region:apac', 'site:sg', 'customer:test'],
      },
    };

    expect(getDeviceLocationKeys(device)).toEqual(expect.arrayContaining(['sg', 'sea', 'sg-15', 'apac']));
    expect(getDeviceTags(device)).toEqual(expect.arrayContaining(['region:apac', 'site:sg', 'customer:test']));
  });

  it('uses unassigned for devices without tailnet metadata', () => {
    const device: Device = { serial: 'usb-123', state: 'device', source: 'usb' };
    expect(getDeviceLocationKeys(device)).toEqual([UNKNOWN_LOCATION]);
    expect(getDeviceTags(device)).toEqual([]);
  });

  it('infers location from hostname-like fields', () => {
    const device: Device = {
      serial: '100.64.0.9:5555',
      state: 'device',
      source: 'tcp',
      tailnet: {
        hostname: 'vn13-phone',
        name: 'sg-15-device',
      },
    };

    expect(getDeviceLocationKeys(device)).toEqual(expect.arrayContaining(['vn-13', 'sg-15']));
  });

  it('matches location filters with at least one selected value', () => {
    const device: Device = {
      serial: '100.64.0.2:5555',
      state: 'device',
      source: 'tcp',
      tailnet: { site: 'my-10' },
    };
    expect(matchesLocationFilters(device, { 'my-10': true, 'sg-15': false })).toBe(true);
    expect(matchesLocationFilters(device, { 'sg-15': true })).toBe(false);
    expect(matchesLocationFilters(device, {})).toBe(true);
  });

  it('matches tag filters', () => {
    const device: Device = {
      serial: '100.64.0.3:5555',
      state: 'device',
      source: 'tcp',
      tailnet: { tags: ['customer:abc', 'tag:phone', 'line:prod'] },
    };
    expect(matchesTagFilters(device, { abc: true })).toBe(false);
    expect(matchesTagFilters(device, { 'customer:abc': true })).toBe(true);
    expect(matchesTagFilters(device, { 'line:prod': true })).toBe(true);
    expect(matchesTagFilters(device, {})).toBe(true);
  });

  it('searches across serial, model, and tailnet metadata', () => {
    const device: Device = {
      serial: '100.64.0.4:5555',
      state: 'device',
      source: 'tcp',
      model: 'Pixel',
      tailnet: { location: 'vn', hostname: 'vn13-phone', tags: ['env:qa'] },
    };
    expect(matchesSearch(device, 'pixel')).toBe(true);
    expect(matchesSearch(device, 'vn13-phone')).toBe(true);
    expect(matchesSearch(device, 'env:qa')).toBe(true);
    expect(matchesSearch(device, 'missing')).toBe(false);
  });

  it('maps state', () => {
    expect(getStateKey('device')).toBe('online');
    expect(getStateKey('unauthorized')).toBe('unauthorized');
    expect(getStateKey('offline')).toBe('offline');
  });
});
