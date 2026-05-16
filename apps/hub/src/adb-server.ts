import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ADB = process.env.ADB_PATH ?? 'adb';

/**
 * Tiny wrapper around the `adb` CLI's server-lifecycle subcommands. The
 * adb-server is the local TCP daemon (default port 5037) that brokers every
 * connection from this hub to USB/TCP devices; if it dies, `/devices` and
 * every other tool that calls into Tango returns ECONNREFUSED.
 */
export async function startAdbServer(): Promise<{ output: string }> {
  const { stdout, stderr } = await run(ADB, ['start-server'], { timeout: 15_000 });
  return { output: (stdout.trim() || stderr.trim() || 'started').slice(0, 2000) };
}

export async function killAdbServer(): Promise<{ output: string }> {
  const { stdout, stderr } = await run(ADB, ['kill-server'], { timeout: 15_000 });
  return { output: (stdout.trim() || stderr.trim() || 'killed').slice(0, 2000) };
}

export async function restartAdbServer(): Promise<{ output: string }> {
  // kill-server returns non-zero when no server is running; swallow that so a
  // restart from a cold state still ends with a healthy "started" daemon.
  await killAdbServer().catch(() => undefined);
  return startAdbServer();
}
