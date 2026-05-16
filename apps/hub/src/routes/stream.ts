import type { FastifyInstance } from 'fastify';

import { isScrcpyRes } from '../scrcpy.js';
import { attachStreamSession } from '../stream.js';

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get('/ws/dev/:serial', { websocket: true }, (socket, req) => {
    const { serial } = req.params as { serial: string };
    const query = req.query as { res?: string };
    const res = isScrcpyRes(query.res) ? query.res : 'main';
    app.log.info({ serial, res }, 'ws connect');
    void attachStreamSession(socket, serial, res, app.log);
    socket.on('close', () => app.log.info({ serial }, 'ws close'));
  });
}
