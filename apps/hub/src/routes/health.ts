import type { FastifyInstance } from 'fastify';

import { isConfigured } from '../tailnet.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', async () => ({ ok: true, tailnet: isConfigured() }));
}
