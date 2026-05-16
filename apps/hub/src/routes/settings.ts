import type { FastifyInstance } from 'fastify';
import { SettingsPatchBodySchema } from '@phone-remote/protocol';

import {
  ALLOWED_KEYS,
  CATEGORY_ORDER,
  SETTINGS_META,
  applySettingsPatch,
  getSettingValues,
} from '../settings.js';

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async () => ({
    categories: CATEGORY_ORDER,
    keys: SETTINGS_META,
    values: getSettingValues(),
  }));

  app.patch('/api/settings', async (req, reply) => {
    const parsed = SettingsPatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', detail: parsed.error.message });
    }
    const unknown = Object.keys(parsed.data.patch).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknown.length > 0) {
      return reply.code(422).send({ error: 'disallowed key', keys: unknown });
    }
    try {
      const result = applySettingsPatch(parsed.data.patch);
      return {
        applied: result.applied,
        removed: result.removed,
        restartPending: result.restartPending,
        values: getSettingValues(),
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
