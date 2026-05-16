import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Redirect .env.local writes to an isolated tempdir per test run so the
// operator's real .env.local is never touched. parseDotEnv is the only
// real-loader function we need to keep — applySettingsPatch calls
// reloadEnvFiles which would otherwise re-read REPO_ROOT and clobber env.
const TMP_DIR = mkdtempSync(join(tmpdir(), 'phr-settings-'));

vi.mock('../src/env-loader.js', async () => {
  const real = await vi.importActual<typeof import('../src/env-loader.js')>('../src/env-loader.js');
  return {
    ...real,
    envFilePath: (name: '.env' | '.env.local') => join(TMP_DIR, name),
    reloadEnvFiles: vi.fn(() => ({ files: [] })),
  };
});

import { applySettingsPatch, getSettingValues, ALLOWED_KEYS, SETTINGS_META } from '../src/settings.js';

// Snapshot every key we'll touch so other tests aren't affected by what we
// write into process.env here.
const SNAPSHOT_KEYS = [
  ...ALLOWED_KEYS,
  'NOT_AN_ALLOWED_KEY',
] as const;
const snapshot = new Map<string, string | undefined>();

beforeAll(() => {
  for (const k of SNAPSHOT_KEYS) snapshot.set(k, process.env[k]);
});
afterAll(() => {
  for (const [k, v] of snapshot) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});
beforeEach(() => {
  for (const k of ALLOWED_KEYS) delete process.env[k];
});
afterEach(() => {
  // Wipe the tempfile between tests so each one starts from a clean slate.
  try {
    rmSync(join(TMP_DIR, '.env.local'), { force: true });
  } catch {}
});

describe('getSettingValues', () => {
  it('returns one entry per SETTINGS_META key', () => {
    const values = getSettingValues();
    expect(values).toHaveLength(SETTINGS_META.length);
    expect(new Set(values.map((v) => v.key))).toEqual(new Set(SETTINGS_META.map((m) => m.key)));
  });

  it('masks secret values and never returns the raw secret', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-supersecretvalue1234';
    const values = getSettingValues();
    const entry = values.find((v) => v.key === 'ANTHROPIC_API_KEY')!;
    expect(entry.defined).toBe(true);
    expect(entry.secret).toBe(true);
    expect(entry.value).toBeNull();
    expect(entry.preview).toBeDefined();
    expect(entry.preview).not.toContain('supersecret');
    expect(entry.preview).toMatch(/^sk-a…/);
  });

  it('returns the raw value for non-secret keys', () => {
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    const entry = getSettingValues().find((v) => v.key === 'OPENAI_BASE_URL')!;
    expect(entry.secret).toBe(false);
    expect(entry.defined).toBe(true);
    expect(entry.value).toBe('https://api.openai.com/v1');
    expect(entry.preview).toBeUndefined();
  });

  it('marks unset keys as not defined', () => {
    const entry = getSettingValues().find((v) => v.key === 'OPENAI_BASE_URL')!;
    expect(entry.defined).toBe(false);
    expect(entry.value).toBeNull();
  });

  it('masks short secrets with bullets (no leakage of the cleartext)', () => {
    process.env.ANTHROPIC_API_KEY = 'short';
    const entry = getSettingValues().find((v) => v.key === 'ANTHROPIC_API_KEY')!;
    expect(entry.preview).not.toContain('short');
    expect(entry.preview).toMatch(/^•+$/);
  });
});

describe('applySettingsPatch', () => {
  it('rejects keys that are not in the allowlist', () => {
    expect(() => applySettingsPatch({ NOT_AN_ALLOWED_KEY: 'leak' })).toThrow(/disallowed key/);
    expect(process.env.NOT_AN_ALLOWED_KEY).toBeUndefined();
  });

  it('writes applied keys to .env.local and mutates process.env', () => {
    const result = applySettingsPatch({ OPENAI_BASE_URL: 'https://example.test/v1' });
    expect(result.applied).toEqual(['OPENAI_BASE_URL']);
    expect(result.removed).toEqual([]);
    expect(result.restartPending).toEqual([]);
    expect(process.env.OPENAI_BASE_URL).toBe('https://example.test/v1');
    const written = readFileSync(join(TMP_DIR, '.env.local'), 'utf-8');
    expect(written).toContain('OPENAI_BASE_URL=https://example.test/v1');
  });

  it('treats null and empty string as "remove key"', () => {
    process.env.OPENAI_BASE_URL = 'should-go-away';
    const result = applySettingsPatch({ OPENAI_BASE_URL: null });
    expect(result.applied).toEqual([]);
    expect(result.removed).toEqual(['OPENAI_BASE_URL']);
    expect(result.restartPending).toEqual([]);
    const written = readFileSync(join(TMP_DIR, '.env.local'), 'utf-8');
    expect(written).not.toMatch(/^OPENAI_BASE_URL=/m);
  });

  it('flags restartRequired keys as restartPending so the UI can warn', () => {
    // LOG_LEVEL is metadata-flagged restartRequired:true.
    const result = applySettingsPatch({ LOG_LEVEL: 'debug' });
    expect(result.applied).toEqual(['LOG_LEVEL']);
    expect(result.restartPending).toEqual(['LOG_LEVEL']);
    // OPENAI_BASE_URL is NOT restartRequired — applied immediately.
    const result2 = applySettingsPatch({ OPENAI_BASE_URL: 'https://x' });
    expect(result2.applied).toEqual(['OPENAI_BASE_URL']);
    expect(result2.restartPending).toEqual([]);
  });

  it('preserves comments and unknown lines in the existing .env.local', () => {
    // Seed an existing file with comments + a non-allowlisted key (must not
    // be touched even though we patch a different key in the same call).
    const seedPath = join(TMP_DIR, '.env.local');
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(
      seedPath,
      ['# operator notes', 'CUSTOM_FREEFORM=keepme', 'OPENAI_BASE_URL=old'].join('\n'),
      { encoding: 'utf-8', mode: 0o600 },
    );

    applySettingsPatch({ OPENAI_BASE_URL: 'new' });
    const written = readFileSync(seedPath, 'utf-8');
    expect(written).toContain('# operator notes');
    expect(written).toContain('CUSTOM_FREEFORM=keepme');
    expect(written).toMatch(/^OPENAI_BASE_URL=new$/m);
    // The old value must not survive.
    expect(written).not.toMatch(/^OPENAI_BASE_URL=old$/m);
  });

  it('quotes values that contain shell-significant characters', () => {
    applySettingsPatch({ OPENAI_COMPATIBLE_LABEL: 'has spaces and "quotes"' });
    const written = readFileSync(join(TMP_DIR, '.env.local'), 'utf-8');
    expect(written).toMatch(/^OPENAI_COMPATIBLE_LABEL="has spaces and \\"quotes\\""$/m);
  });

  it('writes the .env.local with restricted permissions (0600)', () => {
    applySettingsPatch({ OPENAI_BASE_URL: 'https://x' });
    const { statSync } = require('node:fs') as typeof import('node:fs');
    const mode = statSync(join(TMP_DIR, '.env.local')).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
