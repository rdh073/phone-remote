import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';
import { DefaultServerPath, ScrcpyInstanceId } from '@yume-chan/scrcpy';
import { ReadableStream, WritableStream } from '@yume-chan/stream-extra';

import { getAdb } from './adb.js';

const SCRCPY_VERSION = '3.3.3';
const DOWNLOAD_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`;
const VENDOR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor');
const JAR_PATH = resolve(VENDOR_DIR, `scrcpy-server-v${SCRCPY_VERSION}`);

const DEFAULT_PRESETS = {
  main: { maxSize: 1280, videoBitRate: 6_000_000, maxFps: 30 },
  thumb: { maxSize: 1280, videoBitRate: 6_000_000, maxFps: 30 },
} as const;

export type ScrcpyRes = keyof typeof DEFAULT_PRESETS;
export function isScrcpyRes(v: unknown): v is ScrcpyRes {
  return v === 'main' || v === 'thumb';
}

// Env values are read at session-launch time, not at module load, so the
// Settings hot-reload picks up changes for the next stream without a hub
// restart. Existing live sessions keep the values they were started with.
function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readPreset(res: ScrcpyRes): { maxSize: number; videoBitRate: number; maxFps: number } {
  const upper = res.toUpperCase();
  const d = DEFAULT_PRESETS[res];
  return {
    maxSize: envNumber(`SCRCPY_${upper}_MAX_SIZE`, d.maxSize),
    videoBitRate: envNumber(`SCRCPY_${upper}_VIDEO_BITRATE`, d.videoBitRate),
    maxFps: envNumber(`SCRCPY_${upper}_MAX_FPS`, d.maxFps),
  };
}

type Adb = Awaited<ReturnType<typeof getAdb>>;
type Session = Awaited<ReturnType<typeof AdbScrcpyClient.start>>;
const SCRCPY_PROC_PATTERN = 'com.genymobile.scrcpy';

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

type LiveEntry = { promise: Promise<Session>; res: ScrcpyRes };
const live = new Map<string, LiveEntry>();

export async function startScrcpy(serial: string, res: ScrcpyRes = 'main'): Promise<Session> {
  // Idempotency model: at most one live entry per serial. Concurrent or rapid same-res
  // calls (React strict-mode double-mount, WS reconnect storms) share a single in-flight
  // launch promise. A request that lands while a prior session exists closes that session
  // gracefully — Tango streams are single-reader so they can't be multiplexed, but a clean
  // close + verify-kill prevents the prior scrcpy-server process from coexisting with the
  // new one and exhausting device resources.
  const existing = live.get(serial);
  if (existing && existing.res === res) {
    return existing.promise;
  }

  const launch = (async () => {
    if (existing) {
      const prior = await existing.promise.catch(() => undefined);
      await prior?.close().catch(() => {});
    }
    return launchScrcpy(serial, res);
  })();

  const entry: LiveEntry = { promise: launch, res };
  live.set(serial, entry);

  launch.then(
    (session) => {
      void session.exited.finally(() => {
        if (live.get(serial) === entry) live.delete(serial);
      });
    },
    () => {
      if (live.get(serial) === entry) live.delete(serial);
    },
  );

  return launch;
}

async function launchScrcpy(serial: string, res: ScrcpyRes): Promise<Session> {
  const adb = await getAdb(serial);
  // Hub-side tracking covers sessions we know about, but stale scrcpy procs can also
  // come from a prior hub crash, an aborted launch, or an ADB reconnect that orphaned
  // the server. Converge the device to zero scrcpy procs before each fresh launch.
  await killStaleServer(adb);
  await AdbScrcpyClient.pushServer(adb, bytesAsStream(await loadJar()));
  const preset = readPreset(res);
  const options = new AdbScrcpyOptionsLatest({
    video: true,
    audio: false,
    control: true,
    ...preset,
    scid: ScrcpyInstanceId.random(),
    // All our devices are TCP (adb connect host:port), where `adb reverse` is unreliable
    // on the Android daemon. Force forward tunneling — same as native scrcpy auto-picks
    // when it detects WiFi. See yume-chan/ya-webadb#245.
    tunnelForward: true,
  });
  return AdbScrcpyClient.start(adb, DefaultServerPath, options);
}

async function killStaleServer(adb: Adb): Promise<void> {
  // Idempotent: SIGTERM, verify with pgrep, escalate to SIGKILL, retry within budget.
  // Returns once the device reports zero scrcpy procs or after ~500ms of attempts.
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
