import type { FastifyInstance } from 'fastify';

import { isScrcpyRes, type ScrcpyPreset } from '../scrcpy.js';
import { attachStreamSession } from '../stream.js';

// Hard caps to keep operators (or buggy clients) from asking for absurd encode
// budgets that would saturate the link or push the encoder into failure modes.
const MAX_SIZE_RANGE = { min: 144, max: 1920 } as const;
const VIDEO_BITRATE_RANGE = { min: 250_000, max: 20_000_000 } as const;
const MAX_FPS_RANGE = { min: 5, max: 60 } as const;

function clampedNumber(
  raw: string | undefined,
  range: { min: number; max: number },
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(range.min, Math.min(range.max, Math.round(n)));
}

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get('/ws/dev/:serial', { websocket: true }, (socket, req) => {
    const { serial } = req.params as { serial: string };
    const query = req.query as {
      res?: string;
      maxSize?: string;
      bitrate?: string;
      fps?: string;
    };
    const res = isScrcpyRes(query.res) ? query.res : 'main';
    const override: Partial<ScrcpyPreset> = {};
    const maxSize = clampedNumber(query.maxSize, MAX_SIZE_RANGE);
    if (maxSize !== undefined) override.maxSize = maxSize;
    const videoBitRate = clampedNumber(query.bitrate, VIDEO_BITRATE_RANGE);
    if (videoBitRate !== undefined) override.videoBitRate = videoBitRate;
    const maxFps = clampedNumber(query.fps, MAX_FPS_RANGE);
    if (maxFps !== undefined) override.maxFps = maxFps;
    app.log.info({ serial, res, override }, 'ws connect');
    void attachStreamSession(socket, serial, res, app.log, override);
    socket.on('close', () => app.log.info({ serial }, 'ws close'));
  });
}
