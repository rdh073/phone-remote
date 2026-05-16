import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Adb, AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import type { Device } from '@phone-remote/protocol';

import { deleteNode, listNodes } from './tailnet.js';

const run = promisify(execFile);
const ADB_CLI = process.env.ADB_PATH ?? 'adb';

const host = process.env.ADB_HOST ?? '127.0.0.1';
const port = Number(process.env.ADB_PORT ?? 5037);

const client = new AdbServerClient(new AdbServerNodeTcpConnector({ host, port }));

type TailnetMetadata = NonNullable<Device['tailnet']>;
type TailnetByIp = Map<string, TailnetMetadata>;
type CachedTailnetMetadata = { at: number; nodes: TailnetByIp };

const metadataCache: { value: CachedTailnetMetadata | null } = { value: null };
const METADATA_TTL_MS = 5_000;

export async function listDevices(): Promise<Device[]> {
  const raw = await client.getDevices();
  const nodesByIp = await listDevicesTailnetMetadata();
  return raw.map((device) => toDevice(device, nodesByIp));
}

export async function getAdb(serial: string): Promise<Adb> {
  return client.createAdb({ serial });
}

/**
 * Disconnect a device from the local adb-server and (if it's a Tailscale-managed
 * node) delete it from Headscale. USB devices can't be removed from the server
 * side — they'd just be re-detected on the next adb track-devices tick.
 */
export async function disconnectDevice(serial: string): Promise<{ disconnected: boolean; tailnetRemoved: boolean }> {
  let disconnected = false;
  let tailnetRemoved = false;

  // adb disconnect only takes host:port; USB serials are rejected. Try TCP first.
  if (serial.includes(':')) {
    try {
      await run(ADB_CLI, ['disconnect', serial], { timeout: 10_000 });
      disconnected = true;
    } catch {
      // Already disconnected, or not present — caller can refresh and see for themselves.
    }
  }

  const ip = tcpSerialToIp(serial);
  if (ip) {
    const nodes = await listDevicesTailnetMetadata().catch(() => new Map<string, TailnetMetadata>());
    const node = nodes.get(ip);
    if (node?.nodeId) {
      try {
        await deleteNode(node.nodeId);
        tailnetRemoved = true;
      } catch {
        // Headscale rejection (auth, 404) — surface as non-fatal; ADB disconnect is what the operator sees first.
      }
    }
  }

  // Best-effort: bust the tailnet metadata cache so the next /devices read reflects removal.
  metadataCache.value = null;

  return { disconnected, tailnetRemoved };
}

async function listDevicesTailnetMetadata(): Promise<TailnetByIp> {
  const cached = metadataCache.value;
  if (cached && Date.now() - cached.at < METADATA_TTL_MS) {
    return cached.nodes;
  }

  try {
    const nodes = await listNodes();
    const value = mapNodesByIp(nodes);
    metadataCache.value = { at: Date.now(), nodes: value };
    return value;
  } catch {
    return cached?.nodes ?? new Map();
  }
}

function mapNodesByIp(nodes: Awaited<ReturnType<typeof listNodes>>): TailnetByIp {
  const byIp: TailnetByIp = new Map();
  for (const node of nodes) {
    const tags = dedupeTags([...(node.forcedTags ?? []), ...(node.validTags ?? []), ...(node.tags ?? [])]);
    const entry: TailnetMetadata = {
      nodeId: node.id,
      name: node.name,
      hostname: node.hostname,
      givenName: node.givenName,
      ipAddresses: node.ipAddresses,
      location: node.location,
      region: node.region,
      site: node.site,
      tags,
    };
    for (const ip of node.ipAddresses ?? []) {
      byIp.set(normalizeIp(ip), entry);
    }
  }
  return byIp;
}

function normalizeIp(ip: string): string {
  return ip.replace(/^\[([^\]]+)\]$/, '$1');
}

function toDevice(d: AdbServerClient.Device, nodesByIp: TailnetByIp): Device {
  const ip = tcpSerialToIp(d.serial);
  const device: Device = {
    serial: d.serial,
    state: d.state,
    source: ip ? 'tcp' : 'usb',
    model: d.model,
  };
  if (ip) {
    const tailnet = nodesByIp.get(ip);
    if (tailnet) device.tailnet = tailnet;
  }
  return device;
}

function tcpSerialToIp(serial: string): string | undefined {
  if (!serial.includes(':')) return undefined;

  const hostPart = serial.match(/^\[([^\]]+)\]:(\d+)$/)?.[1];
  if (hostPart) return normalizeIp(hostPart);

  const lastColon = serial.lastIndexOf(':');
  return lastColon >= 0 ? serial.slice(0, lastColon) : serial;
}

function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags));
}
