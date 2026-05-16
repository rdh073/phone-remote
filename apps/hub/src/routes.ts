import type { FastifyInstance } from 'fastify';

import { registerAssistantRoutes } from './routes/assistant.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDeviceRoutes } from './routes/device.js';
import { registerHealthRoute } from './routes/health.js';
import { registerProvisionRoutes } from './routes/provision.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerStreamRoutes } from './routes/stream.js';

export async function registerRoutes(app: FastifyInstance) {
  registerHealthRoute(app);
  registerAuthRoutes(app);
  registerDeviceRoutes(app);
  registerProvisionRoutes(app);
  registerStreamRoutes(app);
  registerAssistantRoutes(app);
  registerSettingsRoutes(app);
}
