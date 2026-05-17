/**
 * Claude Code OAuth adapter — TypeScript port of cliper's _claude_oauth_auth.py.
 *
 * Reads + refreshes ~/.claude/.credentials.json so the existing Claude Code login
 * (the `claude` CLI) authenticates the hub assistant without an API key.
 *
 * The header set, beta gate list, billing block, and Agent SDK prefix are sourced
 * from Claude Code 2.1.x and have to match closely or the OAuth gate rejects the
 * request. Keep this file in sync with cliper's canonical constants.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, chmod, stat, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';

export const CLAUDE_REQUIRED_BETAS = [
  'claude-code-20250219',
  'oauth-2025-04-20',
  'interleaved-thinking-2025-05-14',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
  'structured-outputs-2025-12-15',
  'fast-mode-2026-02-01',
  'redact-thinking-2026-02-12',
  'token-efficient-tools-2026-03-28',
] as const;

const CLAUDE_CODE_BILLING_HEADER_VALUE = 'cc_version=2.1.126.88c; cc_entrypoint=cli; cch=00000;';
export const CLAUDE_CODE_BILLING_HEADER_TEXT = `x-anthropic-billing-header: ${CLAUDE_CODE_BILLING_HEADER_VALUE}`;
export const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.126 (external, cli)';
export const AGENT_SDK_SYSTEM_PREFIX =
  "You are a Claude agent, built on Anthropic's Claude Agent SDK.";

const CLAUDE_CODE_SESSION_ID = randomUUID();

export const CLAUDE_STAINLESS_HEADERS: Record<string, string> = {
  'X-App': 'cli',
  'X-Stainless-Retry-Count': '0',
  'X-Stainless-Runtime': 'node',
  'X-Stainless-Lang': 'js',
  'X-Stainless-Timeout': '600',
  'X-Stainless-Package-Version': '0.74.0',
  'X-Stainless-Runtime-Version': 'v24.3.0',
  'X-Stainless-Os': 'MacOS',
  'X-Stainless-Arch': 'arm64',
};

const REFRESH_LEEWAY_SECONDS = 60;

const DEFAULT_SCOPES = [
  'user:profile',
  'user:inference',
  'user:sessions:claude_code',
  'user:mcp_servers',
  'user:file_upload',
];

interface OauthBlock {
  accessToken: string;
  /** Absent when the access token is long-lived and not meant to be refreshed. */
  refreshToken: string | null;
  expiresAt: number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface CredentialsFile {
  claudeAiOauth?: OauthBlock;
  [k: string]: unknown;
}

export function credentialsPath(): string {
  const override = process.env.PHONE_REMOTE_CLAUDE_CREDS ?? process.env.CLAUDE_CODE_CREDS;
  if (override) return resolve(override.replace(/^~\//, `${homedir()}/`));
  return join(homedir(), '.claude', '.credentials.json');
}

/**
 * Operator-supplied access token. When set, wins over credentials.json:
 * the hub treats it as a long-lived token and skips both the file read and
 * the OAuth refresh cycle. Intended for environments where the credentials
 * file can't be mounted (sandboxed container, ephemeral runner) or where
 * the operator wants to inject a fresh token at deploy time.
 */
function envOauthToken(): string | undefined {
  const v = process.env.CLAUDE_OAUTH_TOKEN;
  return v && v.length > 0 ? v : undefined;
}

export function isClaudeCodeAvailable(): boolean {
  return Boolean(envOauthToken()) || existsSync(credentialsPath());
}

async function loadCredentials(): Promise<CredentialsFile> {
  const path = credentialsPath();
  if (!existsSync(path)) {
    throw new Error(
      `Claude Code credentials not found at ${path}. Run \`claude\` once to log in, ` +
        `or set PHONE_REMOTE_CLAUDE_CREDS to a different path.`,
    );
  }
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as CredentialsFile;
}

async function saveCredentials(data: CredentialsFile): Promise<void> {
  // Write-then-rename: rename(2) on POSIX is atomic within the same
  // filesystem, so the credentials file is either fully the old content
  // or fully the new content — never partially written. A second
  // writeFile to the live path is NOT atomic (a crash mid-write leaves
  // the file truncated and unparseable, locking the operator out of the
  // assistant).
  const path = credentialsPath();
  const tmp = `${path}.tmp.${process.pid}`;
  const body = JSON.stringify(data, null, 2);
  await writeFile(tmp, body, 'utf-8');
  try {
    const st = await stat(path);
    await chmod(tmp, st.mode & 0o777);
  } catch {
    // best-effort permission preservation when the original is missing
  }
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  void dirname;
}

function isExpired(expiresAtMs: number): boolean {
  return expiresAtMs / 1000 - Date.now() / 1000 <= REFRESH_LEEWAY_SECONDS;
}

async function refreshTokens(refreshToken: string, scopes: string[]): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
      scope: scopes.join(' '),
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

export async function getValidAccessToken(): Promise<string> {
  // CLAUDE_OAUTH_TOKEN wins: treated as a long-lived token, no file I/O,
  // no refresh attempted. Operators using this env var own token rotation.
  const env = envOauthToken();
  if (env) return env;

  const data = await loadCredentials();
  const block = data.claudeAiOauth;
  if (!block) throw new Error("credentials file missing 'claudeAiOauth' block");

  const { accessToken, refreshToken, expiresAt } = block;
  const scopes = block.scopes && block.scopes.length > 0 ? block.scopes : DEFAULT_SCOPES;
  if (!accessToken) throw new Error('credentials file missing accessToken');

  // A missing refreshToken signals a long-lived access token (e.g. issued for
  // a service account or by a non-CLI flow). Skip the expiry check entirely
  // and return as-is — there's nothing to refresh against.
  if (!refreshToken) return accessToken;

  if (!isExpired(expiresAt)) return accessToken;

  const fresh = await refreshTokens(refreshToken, scopes);
  const newAccess = fresh.access_token;
  if (!newAccess) throw new Error('OAuth refresh response missing access_token');

  const updated: OauthBlock = {
    ...block,
    accessToken: newAccess,
    refreshToken: fresh.refresh_token ?? refreshToken,
    expiresAt: Date.now() + fresh.expires_in * 1000,
    scopes: fresh.scope ? fresh.scope.split(' ') : block.scopes,
  };
  await saveCredentials({ ...data, claudeAiOauth: updated });
  return newAccess;
}

/**
 * The full Claude Code header set. `Authorization` is set separately via
 * createAnthropic's `authToken` option so the SDK can rotate it without us
 * re-instantiating the provider per request.
 */
export function claudeCodeHeaders(): Record<string, string> {
  return {
    'anthropic-beta': CLAUDE_REQUIRED_BETAS.join(','),
    'anthropic-version': '2023-06-01',
    'User-Agent': CLAUDE_CODE_USER_AGENT,
    'X-Claude-Code-Session-Id': CLAUDE_CODE_SESSION_ID,
    'x-client-request-id': randomUUID(),
    Connection: 'keep-alive',
    ...CLAUDE_STAINLESS_HEADERS,
  };
}

type SystemBlock = { type: 'text'; text: string; [k: string]: unknown };

/**
 * Mutate an outgoing Anthropic Messages body so its system prompt starts with
 * the billing-header text block and the Agent SDK prefix block. Without these,
 * the OAuth gate rejects the request.
 *
 * Idempotent: existing copies of either prefix are stripped so we don't
 * accumulate duplicates across retries or pre-mutated payloads.
 */
export function prepareClaudeCodeBody(rawBody: string): string {
  let payload: { system?: unknown; messages?: unknown; [k: string]: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
  if (!payload || typeof payload !== 'object' || !('messages' in payload)) return rawBody;

  const incoming = systemTexts(payload.system).filter(
    (t) => t !== CLAUDE_CODE_BILLING_HEADER_TEXT && t !== AGENT_SDK_SYSTEM_PREFIX,
  );
  const next: SystemBlock[] = [
    { type: 'text', text: CLAUDE_CODE_BILLING_HEADER_TEXT },
    { type: 'text', text: AGENT_SDK_SYSTEM_PREFIX },
    ...incoming.map((text) => ({ type: 'text' as const, text })),
  ];
  payload.system = next;
  return JSON.stringify(payload);
}

function systemTexts(system: unknown): string[] {
  if (typeof system === 'string') return system.trim() ? [system] : [];
  if (!Array.isArray(system)) return [];
  const out: string[] = [];
  for (const block of system) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      const text = (block as { text: string }).text;
      if (text.trim()) out.push(text);
    }
  }
  return out;
}

/**
 * A fetch wrapper that, for outbound calls to Anthropic's Messages endpoint,
 * injects the required Claude Code system blocks. Pass into createAnthropic's
 * `fetch` option. Non-Messages traffic (e.g. count_tokens) passes through.
 */
export const claudeCodeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (!init?.body || typeof init.body !== 'string' || !url.includes('/v1/messages')) {
    return fetch(input as Parameters<typeof fetch>[0], init);
  }
  const patched: RequestInit = { ...init, body: prepareClaudeCodeBody(init.body) };
  return fetch(input as Parameters<typeof fetch>[0], patched);
};
