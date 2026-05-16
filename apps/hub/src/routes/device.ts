import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { DeviceKeyBodySchema, DeviceShellBodySchema } from '@phone-remote/protocol';

import { disconnectDevice, listDevices } from '../adb.js';
import { reboot, runShell, screenshot, sendKeyEvent } from '../device-actions.js';

// Valid serial shapes the hub deals with: TCP `ip:port` (`100.64.0.5:5555`)
// and USB serials (alphanumeric, e.g. `RZ8N40SQDXP`). The set is closed —
// reject anything containing `/`, whitespace, shell metacharacters, or
// path-traversal sequences before it reaches adb / device-actions.
const SERIAL_RE = /^[A-Za-z0-9.:_-]{1,64}$/;

function readSerial(req: FastifyRequest, reply: FastifyReply): string | null {
  const { serial } = req.params as { serial: string };
  if (!SERIAL_RE.test(serial)) {
    void reply.code(400).send({ error: 'invalid serial' });
    return null;
  }
  return serial;
}

export function registerDeviceRoutes(app: FastifyInstance): void {
  app.get('/devices', async () => ({ devices: await listDevices() }));

  app.delete('/api/dev/:serial', async (req, reply) => {
    const serial = readSerial(req, reply);
    if (serial == null) return reply;
    return disconnectDevice(serial);
  });

  app.post('/api/dev/:serial/key', async (req, reply) => {
    const serial = readSerial(req, reply);
    if (serial == null) return reply;
    const parsed = DeviceKeyBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    await sendKeyEvent(serial, parsed.data.keyCode);
    return { ok: true };
  });

  app.get('/api/dev/:serial/screenshot', async (req, reply) => {
    const serial = readSerial(req, reply);
    if (serial == null) return reply;
    const png = await screenshot(serial);
    return reply.type('image/png').send(Buffer.from(png));
  });

  app.post('/api/dev/:serial/reboot', async (req, reply) => {
    const serial = readSerial(req, reply);
    if (serial == null) return reply;
    await reboot(serial);
    return { ok: true };
  });

  app.post('/api/dev/:serial/shell', async (req, reply) => {
    const serial = readSerial(req, reply);
    if (serial == null) return reply;
    const parsed = DeviceShellBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const output = await runShell(serial, parsed.data.command);
    return { output };
  });
}
