import type { Device } from '@phone-remote/protocol';

export const UNKNOWN_LOCATION = 'unassigned';
const LOCATION_PREFIX = ['site:', 'region:', 'location:', 'loc:'];
const COMMON_TAGS = new Set(['phone', 'hub']);

export function getDeviceLocationKeys(device: Device): string[] {
  const out = new Set<string>();

  const tailnet = device.tailnet;
  if (!tailnet) {
    out.add(UNKNOWN_LOCATION);
    return Array.from(out);
  }

  if (tailnet.location) out.add(trimmed(tailnet.location));
  if (tailnet.region) out.add(trimmed(tailnet.region));
  if (tailnet.site) out.add(trimmed(tailnet.site));

  for (const text of [tailnet.name, tailnet.hostname, tailnet.givenName]) {
    if (!text) continue;
    for (const location of parseLocationHints(text)) {
      out.add(location);
    }
  }

  for (const tag of getDeviceTags(device)) {
    const mapped = mapTagToLocation(tag);
    if (mapped) out.add(mapped);
  }

  if (out.size === 0) out.add(UNKNOWN_LOCATION);
  return Array.from(out).map(canonicalizeLabel);
}

export function getDeviceTags(device: Device): string[] {
  const tags = device.tailnet?.tags ?? [];
  return dedupe(
    tags
      .map((tag) => canonicalizeLabel(tag.replace(/^tag:/i, '').trim()))
      .filter(Boolean)
      .filter((tag) => !COMMON_TAGS.has(tag.toLowerCase())),
  );
}

export function matchesLocationFilters(
  device: Device,
  locationFilter: Record<string, boolean>,
): boolean {
  const keys = Object.entries(locationFilter)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  if (keys.length === 0) return true;
  const deviceKeys = getDeviceLocationKeys(device);
  return keys.some((target) => deviceKeys.includes(target));
}

export function matchesTagFilters(device: Device, tagFilter: Record<string, boolean>): boolean {
  const keys = Object.entries(tagFilter)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  if (keys.length === 0) return true;
  const deviceTags = getDeviceTags(device);
  return keys.some((target) => deviceTags.includes(target));
}

export function matchesSearch(
  device: Device,
  query: string,
  labels?: Record<string, string>,
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const haystack = [
    labels?.[device.serial],
    device.serial,
    device.model,
    device.androidVersion,
    device.tailnet?.name,
    device.tailnet?.hostname,
    device.tailnet?.givenName,
    device.tailnet?.ipAddresses?.join(' '),
    device.tailnet?.location,
    device.tailnet?.region,
    device.tailnet?.site,
    ...getDeviceLocationKeys(device),
    ...getDeviceTags(device),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(trimmed);
}

export function getStateKey(state: Device['state']): 'online' | 'offline' | 'unauthorized' {
  if (state === 'device') return 'online';
  if (state === 'unauthorized') return 'unauthorized';
  return 'offline';
}

function mapTagToLocation(tag: string): string | null {
  const lower = tag.toLowerCase();
  for (const prefix of LOCATION_PREFIX) {
    if (lower.startsWith(prefix)) {
      const value = tag.slice(prefix.length).trim();
      return value ? canonicalizeLabel(value) : null;
    }
  }
  return null;
}

function canonicalizeLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return normalized;
  if (/^[a-z]{2}\d{1,3}$/.test(normalized)) {
    return `${normalized[0]}${normalized[1]}-${normalized.slice(2)}`;
  }
  return normalized.replace(/\s+/g, '-');
}

function trimmed(value: string): string {
  return value.trim();
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseLocationHints(value: string): string[] {
  const normalized = canonicalizeLabel(value);
  const matches = Array.from(normalized.matchAll(/\b([a-z]{2}(?:\s*-\s*|\s+)?\d{1,3})\b/g));
  return dedupe(
    matches
      .map((match) => match?.[1])
      .filter((part): part is string => Boolean(part))
      .map((part) => canonicalizeLabel(part)),
  );
}
