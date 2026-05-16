import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';

declare module '@fastify/secure-session' {
  interface SessionData {
    user: string;
    loginAt: number;
  }
}

const PUBLIC_PATHS = new Set(['/', '/health', '/favicon.ico', '/api/auth/login', '/api/auth/me']);
const PUBLIC_PREFIXES = ['/assets/'];

export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? '/';
  if (PUBLIC_PATHS.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * The configured admin username. Throws if AUTH_USER is unset — there is
 * no default ("admin" baked in is a credential-stuffing magnet). Setup is
 * mandatory at install time per infra/env.example.
 */
export function authUser(): string {
  const u = process.env.AUTH_USER;
  if (!u) throw new Error('AUTH_USER not set');
  return u;
}

export async function verifyPassword(username: string, password: string): Promise<boolean> {
  // Fail-closed if either credential half is unset. createApp() also
  // refuses to boot in that state, so this branch is defense-in-depth
  // (covers code paths that import verifyPassword without going through
  // createApp's startup checks).
  const expected = process.env.AUTH_USER;
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!expected || !hash) return false;
  if (username !== expected) return false;
  return bcrypt.compare(password, hash);
}

export function registerAuthGate(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (isPublicPath(req.url)) return;
    const user = req.session.get('user');
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
