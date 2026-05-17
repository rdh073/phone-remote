import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getValidAccessToken, isClaudeCodeAvailable } from '../src/claude-oauth.js';

describe('CLAUDE_OAUTH_TOKEN env precedence', () => {
  let originalEnv: string | undefined;
  let originalCreds: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CLAUDE_OAUTH_TOKEN;
    originalCreds = process.env.PHONE_REMOTE_CLAUDE_CREDS;
    // Point the credentials path at a location that definitely doesn't exist
    // so any file-fallback path would fail loudly.
    process.env.PHONE_REMOTE_CLAUDE_CREDS = '/tmp/phone-remote-test-nonexistent-creds.json';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_OAUTH_TOKEN;
    else process.env.CLAUDE_OAUTH_TOKEN = originalEnv;
    if (originalCreds === undefined) delete process.env.PHONE_REMOTE_CLAUDE_CREDS;
    else process.env.PHONE_REMOTE_CLAUDE_CREDS = originalCreds;
  });

  it('isClaudeCodeAvailable returns true when only the env var is set', () => {
    delete process.env.CLAUDE_OAUTH_TOKEN;
    expect(isClaudeCodeAvailable()).toBe(false);

    process.env.CLAUDE_OAUTH_TOKEN = 'sk-ant-oat01-test';
    expect(isClaudeCodeAvailable()).toBe(true);
  });

  it('getValidAccessToken returns the env value directly (no file read, no refresh)', async () => {
    process.env.CLAUDE_OAUTH_TOKEN = 'sk-ant-oat01-from-env';
    const token = await getValidAccessToken();
    expect(token).toBe('sk-ant-oat01-from-env');
  });

  it('empty CLAUDE_OAUTH_TOKEN does not short-circuit (treated as unset)', async () => {
    process.env.CLAUDE_OAUTH_TOKEN = '';
    // Empty string means "not set" — falls back to file lookup, which fails
    // because we pointed the path at a nonexistent file.
    await expect(getValidAccessToken()).rejects.toThrow(/credentials not found/);
  });
});
