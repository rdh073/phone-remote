/**
 * Fastify instance decorations. Anything app.decorate()'d at boot must be
 * declared here so route handlers see typed access via req.server.X.
 *
 * Keeping decorations explicit is the DIP backbone: dependencies travel
 * through the Fastify container, not via module-level imports.
 */
import type { HubCapabilities } from '@phone-remote/protocol';

import type { ProvisioningService } from './provisioning.js';

declare module 'fastify' {
  interface FastifyInstance {
    capabilities: HubCapabilities;
    provisioning: ProvisioningService;
  }
}

export {};
