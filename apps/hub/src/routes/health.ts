import type { FastifyInstance } from 'fastify';

import { getCapabilities } from '../capabilities.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async () => {
    const capabilities = getCapabilities();
    // `tailnet` at the top level is deprecated; keep it for backward compat
    // with operators reading the old shape. New consumers read `capabilities`.
    return { ok: true, tailnet: capabilities.tailnet, capabilities };
  });
}
