import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { LoginBodySchema } from '@phone-remote/protocol';
import { verifyPassword } from '../auth.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/auth/me', async (req, reply) => {
    const user = req.session.get('user');
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { user };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const ok = await verifyPassword(parsed.data.username, parsed.data.password);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    req.session.set('user', parsed.data.username);
    req.session.set('loginAt', Date.now());
    return { user: parsed.data.username };
  });

  app.post('/api/auth/logout', async (req: FastifyRequest) => {
    req.session.delete();
    return { ok: true };
  });
}
