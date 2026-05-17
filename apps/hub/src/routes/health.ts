import type { FastifyInstance } from 'fastify';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async (req) => {
    const capabilities = req.server.capabilities;
    // `tailnet` at the top level is deprecated; keep it for backward compat
    // with operators reading the old shape. New consumers read `capabilities`.
    return { ok: true, tailnet: capabilities.tailnet, capabilities };
  });
}
