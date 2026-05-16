import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('../src/adb.js', () => ({
  listDevices: vi.fn().mockResolvedValue([]),
  getAdb: vi.fn(),
}));
vi.mock('../src/tailnet.js', () => ({
  isConfigured: () => false,
  createAuthKey: vi.fn(),
  expireAuthKey: vi.fn(),
  getLoginServer: () => '',
}));
vi.mock('../src/provisioning.js', () => ({
  startSession: vi.fn(),
  pairSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('../src/device-actions.js', () => ({
  sendKeyEvent: vi.fn(),
  screenshot: vi.fn(),
  reboot: vi.fn(),
  runShell: vi.fn(),
}));
vi.mock('../src/stream.js', () => ({
  attachStreamSession: vi.fn(),
}));

beforeAll(() => {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  process.env.AUTH_USER = 'admin';
  process.env.AUTH_PASSWORD_HASH = bcrypt.hashSync('testpass', 4);
  process.env.LOG_LEVEL = 'silent';
});

async function freshApp() {
  const { createApp } = await import('../src/app.js');
  return createApp();
}

describe('createApp boot guards', () => {
  it('refuses to boot when AUTH_USER is unset', async () => {
    const saved = process.env.AUTH_USER;
    delete process.env.AUTH_USER;
    try {
      await expect(freshApp()).rejects.toThrow(/AUTH_USER not set/);
    } finally {
      process.env.AUTH_USER = saved;
    }
  });

  it('refuses to boot when AUTH_PASSWORD_HASH is unset', async () => {
    const saved = process.env.AUTH_PASSWORD_HASH;
    delete process.env.AUTH_PASSWORD_HASH;
    try {
      await expect(freshApp()).rejects.toThrow(/AUTH_PASSWORD_HASH not set/);
    } finally {
      process.env.AUTH_PASSWORD_HASH = saved;
    }
  });
});

describe('routes', () => {
  let app: Awaited<ReturnType<typeof freshApp>>;

  beforeEach(async () => {
    app = await freshApp();
  });

  it('GET /health is public and returns ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true });
  });

  it('GET /devices requires auth (401 without cookie)', async () => {
    const r = await app.inject({ method: 'GET', url: '/devices' });
    expect(r.statusCode).toBe(401);
  });

  it('GET /api/auth/me returns 401 unauthenticated', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(r.statusCode).toBe(401);
  });

  it('POST /api/auth/login with wrong password → 401', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('login → me → devices roundtrip with session cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ user: 'admin' });

    const setCookie = login.cookies[0];
    expect(setCookie).toBeDefined();

    const cookies = { [setCookie!.name]: setCookie!.value };

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: 'admin' });

    const devices = await app.inject({ method: 'GET', url: '/devices', cookies });
    expect(devices.statusCode).toBe(200);
    expect(devices.json()).toEqual({ devices: [] });
  });

  it('logout clears session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass' },
    });
    const cookies = { [login.cookies[0]!.name]: login.cookies[0]!.value };

    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
    // session.delete() returns a cleared cookie; replaying the old cookie should still 401
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
  });

  it('rejects malformed serial in /api/dev/:serial routes (defense in depth)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass' },
    });
    const cookies = { [login.cookies[0]!.name]: login.cookies[0]!.value };

    // Path-traversal-shaped serial — should never reach device-actions.
    const bad = encodeURIComponent('../../../etc/passwd');
    const reboot = await app.inject({
      method: 'POST',
      url: `/api/dev/${bad}/reboot`,
      cookies,
    });
    expect(reboot.statusCode).toBe(400);
    expect(reboot.json()).toEqual({ error: 'invalid serial' });

    const shell = await app.inject({
      method: 'POST',
      url: `/api/dev/${bad}/shell`,
      cookies,
      payload: { command: 'id' },
    });
    expect(shell.statusCode).toBe(400);
  });

  it('accepts a normal TCP serial', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'testpass' },
    });
    const cookies = { [login.cookies[0]!.name]: login.cookies[0]!.value };

    const reboot = await app.inject({
      method: 'POST',
      url: '/api/dev/100.64.0.5:5555/reboot',
      cookies,
    });
    expect(reboot.statusCode).toBe(200);
    expect(reboot.json()).toEqual({ ok: true });
  });
});
