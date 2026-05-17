import type { FastifyInstance } from 'fastify';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async (req) => {
    return { ok: true, capabilities: req.server.capabilities };
  });
}
