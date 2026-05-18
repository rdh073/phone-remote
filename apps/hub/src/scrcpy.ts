import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';
import { DefaultServerPath, ScrcpyInstanceId } from '@yume-chan/scrcpy';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { ReadableStream, WritableStream } from '@yume-chan/stream-extra';

import { getAdb } from './adb.js';

const SCRCPY_VERSION = '3.3.3';
const DOWNLOAD_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`;
const VENDOR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor');
const JAR_PATH = resolve(VENDOR_DIR, `scrcpy-server-v${SCRCPY_VERSION}`);

const DEFAULT_PRESETS = {
  main:  { maxSize: 1280, videoBitRate: 6_000_000, maxFps: 30 },
  thumb: { maxSize:  720, videoBitRate: 2_500_000, maxFps: 24 },
} as const;

export type ScrcpyRes = keyof typeof DEFAULT_PRESETS;
export type ScrcpyPreset = { maxSize: number; videoBitRate: number; maxFps: number };
export function isScrcpyRes(v: unknown): v is ScrcpyRes {
  return v === 'main' || v === 'thumb';
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readPreset(res: ScrcpyRes): ScrcpyPreset {
  const upper = res.toUpperCase();
  const d = DEFAULT_PRESETS[res];
  return {
    maxSize: envNumber(`SCRCPY_${upper}_MAX_SIZE`, d.maxSize),
    videoBitRate: envNumber(`SCRCPY_${upper}_VIDEO_BITRATE`, d.videoBitRate),
    maxFps: envNumber(`SCRCPY_${upper}_MAX_FPS`, d.maxFps),
  };
}

function presetKey(serial: string, preset: ScrcpyPreset): string {
  return `${serial}|${preset.maxSize}|${preset.videoBitRate}|${preset.maxFps}`;
}

type Adb = Awaited<ReturnType<typeof getAdb>>;
type Session = Awaited<ReturnType<typeof AdbScrcpyClient.start>>;
export type ScrcpyController = NonNullable<Session['controller']>;
const SCRCPY_PROC_PATTERN = 'com.genymobile.scrcpy';

export type VideoMeta = { codec: number; width: number; height: number };
export type ConsumerHandle = {
  meta: VideoMeta;
  controller: ScrcpyController | undefined;
  detach: () => void;
};
export type ConsumerCallbacks = {
  onPacket: (packet: ScrcpyMediaStreamPacket) => void;
  onError: (err: Error) => void;
  onClose: () => void;
};

/**
 * Pool of WS consumers sharing one scrcpy session.
 *
 * Why this exists: scrcpy-server cold start is ~10-15s on most devices
 * (pushServer + killStaleServer + handshake + first encoder warmup). Without
 * a pool, every browser-side WS disconnect (IntersectionObserver pause,
 * detail-modal toggle, quality switch, scroll-induced layout shift) eats
 * that full cold start when the operator reattaches a second later.
 *
 * The pool keeps the scrcpy session alive for GRACE_MS after the last
 * consumer leaves, so a reattach within the grace window is instant. New
 * consumers also get the cached configuration packet immediately and ask the
 * encoder for a fresh keyframe via resetVideo() — they're decoding within
 * one frame interval (~40-66ms at 15-30fps) instead of the next natural
 * keyframe (1-2s) or a full server restart (10-15s).
 *
 * Pattern straight from Tango's docs:
 *   tangoadb.dev/scrcpy/control/reset-video
 *
 * One pool per (serial, preset) — quality switches still cost a full restart
 * because encode params are baked into the scrcpy launch args.
 */

const GRACE_MS = 8000;

type Pool = {
  key: string;
  serial: string;
  preset: ScrcpyPreset;
  session: Session;
  meta: VideoMeta;
  controller: ScrcpyController | undefined;
  /** Consumers that have received at least one `configuration` packet and
   *  can decode subsequent data packets. */
  consumers: Set<ConsumerCallbacks>;
  /** New consumers waiting to be promoted on the next `configuration`
   *  packet (forced via `resetVideo()`). They do NOT receive data packets
   *  while pending — without SPS/PPS the decoder can't make sense of
   *  them. Promotion happens inside readerLoop the moment a config
   *  arrives, after which they're folded into `consumers`. */
  pendingConsumers: Set<ConsumerCallbacks>;
  lastConfig: ScrcpyMediaStreamPacket | null;
  graceTimer: NodeJS.Timeout | null;
  closed: boolean;
};

const pools = new Map<string, Pool>();
const pending = new Map<string, Promise<Pool>>();

export async function attachConsumer(
  serial: string,
  res: ScrcpyRes,
  override: Partial<ScrcpyPreset>,
  callbacks: ConsumerCallbacks,
): Promise<ConsumerHandle> {
  const preset: ScrcpyPreset = { ...readPreset(res), ...override };
  const key = presetKey(serial, preset);

  let pool = pools.get(key);
  if (!pool) {
    let p = pending.get(key);
    if (!p) {
      p = launchPool(serial, preset, key);
      pending.set(key, p);
    }
    try {
      pool = await p;
    } finally {
      pending.delete(key);
    }
  }

  if (pool.graceTimer) {
    clearTimeout(pool.graceTimer);
    pool.graceTimer = null;
  }

  // Park as pending until the next configuration packet arrives — that
  // gives the caller (stream.ts) a chance to send `video-meta` JSON first
  // so the browser has a decoder ready before any binary packets land.
  // `resetVideo()` asks the encoder to emit a fresh config + keyframe so
  // promotion happens within one frame interval (~40-66ms) rather than
  // waiting for the next natural keyframe (1-2s).
  pool.pendingConsumers.add(callbacks);
  if (pool.controller) {
    pool.controller.resetVideo().catch(() => {
      // best-effort: if resetVideo isn't supported, the consumer simply
      // waits for the next natural config packet.
    });
  }

  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    pool!.consumers.delete(callbacks);
    pool!.pendingConsumers.delete(callbacks);
    if (
      pool!.consumers.size === 0 &&
      pool!.pendingConsumers.size === 0 &&
      pools.get(key) === pool &&
      !pool!.closed
    ) {
      pool!.graceTimer = setTimeout(() => closePool(key), GRACE_MS);
    }
  };

  return { meta: pool.meta, controller: pool.controller, detach };
}

async function launchPool(serial: string, preset: ScrcpyPreset, key: string): Promise<Pool> {
  const session = await launchScrcpy(serial, preset);
  const video = await session.videoStream;
  if (!video) {
    await session.close().catch(() => {});
    throw new Error('video stream disabled');
  }

  const pool: Pool = {
    key,
    serial,
    preset,
    session,
    meta: { codec: video.metadata.codec, width: video.width, height: video.height },
    controller: session.controller,
    consumers: new Set(),
    pendingConsumers: new Set(),
    lastConfig: null,
    graceTimer: null,
    closed: false,
  };
  pools.set(key, pool);

  void drainOutputForPool(session, serial);
  void readerLoop(pool, video.stream);
  void session.exited
    .catch(() => {})
    .finally(() => evictPool(key, new Error('scrcpy session exited')));

  return pool;
}

async function readerLoop(pool: Pool, stream: ReadableStream<ScrcpyMediaStreamPacket>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (pool.closed) break;
      if (value.type === 'configuration') {
        pool.lastConfig = value;
        // Promote pending consumers — the config they're about to receive
        // gives the decoder the SPS/PPS it needs to interpret subsequent
        // data packets.
        if (pool.pendingConsumers.size > 0) {
          for (const c of pool.pendingConsumers) pool.consumers.add(c);
          pool.pendingConsumers.clear();
        }
      }
      // Snapshot before iterating so a consumer-triggered detach during
      // dispatch doesn't mutate-while-iterate.
      const snapshot = Array.from(pool.consumers);
      for (const c of snapshot) {
        try {
          c.onPacket(value);
        } catch {
          // Per-consumer failure shouldn't poison the whole pool. The WS
          // socket has its own close handler that will detach the consumer.
        }
      }
    }
  } catch (err) {
    evictPool(pool.key, err as Error);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

async function drainOutputForPool(session: Session, _serial: string): Promise<void> {
  // scrcpy-server stderr/stdout text. Drain to /dev/null so the underlying
  // stream doesn't backpressure-block the server. We don't log per line here
  // since the same line would otherwise multiply across N consumers — the
  // routes layer logs ws connect/close which is what operators actually want.
  try {
    await session.output.pipeTo(new WritableStream());
  } catch {
    // session closing
  }
}

function evictPool(key: string, err: Error): void {
  const pool = pools.get(key);
  if (!pool || pool.closed) return;
  pool.closed = true;
  pools.delete(key);
  if (pool.graceTimer) {
    clearTimeout(pool.graceTimer);
    pool.graceTimer = null;
  }
  const all = [...pool.consumers, ...pool.pendingConsumers];
  pool.consumers.clear();
  pool.pendingConsumers.clear();
  for (const c of all) {
    try {
      c.onError(err);
    } catch {
      // ignore
    }
    try {
      c.onClose();
    } catch {
      // ignore
    }
  }
  pool.session.close().catch(() => {});
}

function closePool(key: string): void {
  const pool = pools.get(key);
  if (!pool) return;
  // A consumer re-attached during the grace window — abort the teardown.
  if (pool.consumers.size > 0 || pool.pendingConsumers.size > 0) return;
  pool.closed = true;
  pools.delete(key);
  pool.session.close().catch(() => {});
}

let cached: Uint8Array | null = null;

async function loadJar(): Promise<Uint8Array> {
  if (cached) return cached;
  if (!existsSync(JAR_PATH)) {
    await mkdir(VENDOR_DIR, { recursive: true });
    const res = await fetch(DOWNLOAD_URL);
    if (!res.ok) throw new Error(`scrcpy-server download failed: HTTP ${res.status}`);
    cached = new Uint8Array(await res.arrayBuffer());
    await writeFile(JAR_PATH, cached);
    return cached;
  }
  cached = new Uint8Array(await readFile(JAR_PATH));
  return cached;
}

function bytesAsStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function launchScrcpy(serial: string, preset: ScrcpyPreset): Promise<Session> {
  const adb = await getAdb(serial);
  await killStaleServer(adb);
  await AdbScrcpyClient.pushServer(adb, bytesAsStream(await loadJar()));
  const options = new AdbScrcpyOptionsLatest({
    video: true,
    audio: false,
    control: true,
    ...preset,
    scid: ScrcpyInstanceId.random(),
    tunnelForward: true,
  });
  return AdbScrcpyClient.start(adb, DefaultServerPath, options);
}

async function killStaleServer(adb: Adb): Promise<void> {
  await runShell(adb, `pkill -TERM -f ${SCRCPY_PROC_PATTERN} 2>/dev/null; true`);
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(80);
    if ((await countMatching(adb, SCRCPY_PROC_PATTERN)) === 0) return;
    await runShell(adb, `pkill -KILL -f ${SCRCPY_PROC_PATTERN} 2>/dev/null; true`);
  }
}

async function runShell(adb: Adb, cmd: string): Promise<void> {
  try {
    const proc = await adb.subprocess.noneProtocol.spawn(cmd);
    await proc.output.pipeTo(new WritableStream());
  } catch {
    // best-effort
  }
}

async function countMatching(adb: Adb, pattern: string): Promise<number> {
  try {
    const proc = await adb.subprocess.noneProtocol.spawn(
      `pgrep -c -f ${pattern} 2>/dev/null || echo 0`,
    );
    const chunks: Uint8Array[] = [];
    await proc.output.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          chunks.push(chunk);
        },
      }),
    );
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString().trim();
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
