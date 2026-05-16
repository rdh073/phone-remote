import { getAdb } from './adb.js';

async function spawnAndDrain(serial: string, argv: string[]): Promise<Uint8Array> {
  const adb = await getAdb(serial);
  const proc = await adb.subprocess.noneProtocol.spawn(argv);
  const reader = proc.output.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await proc.exited;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function spawnAndWait(serial: string, argv: string[]): Promise<string> {
  const bytes = await spawnAndDrain(serial, argv);
  return new TextDecoder().decode(bytes);
}

export async function sendKeyEvent(serial: string, keyCode: number): Promise<void> {
  await spawnAndWait(serial, ['input', 'keyevent', String(keyCode)]);
}

export async function screenshot(serial: string): Promise<Uint8Array> {
  return spawnAndDrain(serial, ['screencap', '-p']);
}

export async function reboot(serial: string): Promise<void> {
  const adb = await getAdb(serial);
  const proc = await adb.subprocess.noneProtocol.spawn(['reboot']);
  // reboot will sever the connection; don't await exited
  proc.output.getReader().releaseLock();
  void proc;
}

export async function runShell(serial: string, command: string): Promise<string> {
  return spawnAndWait(serial, ['sh', '-c', command]);
}
