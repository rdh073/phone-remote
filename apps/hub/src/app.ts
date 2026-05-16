import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import secureSession from '@fastify/secure-session';

import { registerAuthGate } from './auth.js';
import { registerRoutes } from './routes.js';
import { registerErrorHandler } from './shared/http-errors.js';

const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export async function createApp() {
  const sessionSecretHex = process.env.SESSION_SECRET;
  if (!sessionSecretHex) throw new Error('SESSION_SECRET not set (64 hex chars; generate with `openssl rand -hex 32`)');
  if (!/^[\da-f]{64}$/i.test(sessionSecretHex)) {
    throw new Error('SESSION_SECRET must be exactly 64 hexadecimal characters');
  }
  if (!process.env.AUTH_USER) {
    throw new Error(
      'AUTH_USER not set — pick an admin username in .env.production (no default is baked in)',
    );
  }
  if (!process.env.AUTH_PASSWORD_HASH) {
    throw new Error('AUTH_PASSWORD_HASH not set (generate with `pnpm -F @phone-remote/hub run hash-password "<password>"`)');
  }

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  registerErrorHandler(app);

  await app.register(secureSession, {
    key: Buffer.from(sessionSecretHex, 'hex'),
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      secure: process.env.COOKIE_SECURE === 'true',
    },
  });

  registerAuthGate(app);

  await app.register(websocket, { options: { maxPayload: 4 * 1024 * 1024 } });
  await app.register(registerRoutes);

  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    app.log.info({ root: WEB_DIST }, 'serving web bundle');
  } else {
    app.log.warn(`web bundle not found at ${WEB_DIST}; run 'pnpm -F @phone-remote/web build'`);
  }

  return app;
}
