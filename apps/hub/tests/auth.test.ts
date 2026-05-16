import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { authUser, isPublicPath, verifyPassword } from '../src/auth.js';

describe('isPublicPath', () => {
  it.each([
    ['/', true],
    ['/health', true],
    ['/favicon.ico', true],
    ['/assets/index.js', true],
    ['/api/auth/login', true],
    ['/api/auth/login-extra', false],
    ['/api/auth/me', true],
    ['/api/auth/metrics', false],
    ['/api/auth/logout', false],
    ['/devices', false],
    ['/ws/dev/abc', false],
    ['/api/provision/start', false],
    ['/api/dev/abc/key', false],
  ])('%s → public:%s', (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });

  it('strips query string', () => {
    expect(isPublicPath('/health?check=1')).toBe(true);
    expect(isPublicPath('/devices?filter=usb')).toBe(false);
  });
});

describe('verifyPassword', () => {
  const originalHash = process.env.AUTH_PASSWORD_HASH;
  const originalUser = process.env.AUTH_USER;

  beforeAll(() => {
    process.env.AUTH_USER = 'admin';
    process.env.AUTH_PASSWORD_HASH = bcrypt.hashSync('secret', 4);
  });

  afterAll(() => {
    process.env.AUTH_PASSWORD_HASH = originalHash;
    process.env.AUTH_USER = originalUser;
  });

  it('accepts the right user + password', async () => {
    expect(await verifyPassword('admin', 'secret')).toBe(true);
  });
  it('rejects wrong password', async () => {
    expect(await verifyPassword('admin', 'wrong')).toBe(false);
  });
  it('rejects wrong username', async () => {
    expect(await verifyPassword('root', 'secret')).toBe(false);
  });
  it('rejects when hash is unset', async () => {
    const saved = process.env.AUTH_PASSWORD_HASH;
    delete process.env.AUTH_PASSWORD_HASH;
    expect(await verifyPassword('admin', 'secret')).toBe(false);
    process.env.AUTH_PASSWORD_HASH = saved;
  });
});

describe('authUser', () => {
  it('throws when AUTH_USER is unset (no admin default)', () => {
    const saved = process.env.AUTH_USER;
    delete process.env.AUTH_USER;
    try {
      expect(() => authUser()).toThrow(/AUTH_USER not set/);
    } finally {
      process.env.AUTH_USER = saved;
    }
  });

  it('returns the configured username', () => {
    const saved = process.env.AUTH_USER;
    process.env.AUTH_USER = 'operator';
    try {
      expect(authUser()).toBe('operator');
    } finally {
      process.env.AUTH_USER = saved;
    }
  });
});

describe('verifyPassword (no AUTH_USER)', () => {
  it('rejects regardless of credential when AUTH_USER is unset', async () => {
    const savedUser = process.env.AUTH_USER;
    const savedHash = process.env.AUTH_PASSWORD_HASH;
    delete process.env.AUTH_USER;
    process.env.AUTH_PASSWORD_HASH = bcrypt.hashSync('secret', 4);
    try {
      expect(await verifyPassword('admin', 'secret')).toBe(false);
      expect(await verifyPassword('', 'secret')).toBe(false);
    } finally {
      process.env.AUTH_USER = savedUser;
      process.env.AUTH_PASSWORD_HASH = savedHash;
    }
  });
});
