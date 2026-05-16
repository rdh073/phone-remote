/**
 * Hot-reloadable env settings — the schema and write-back to .env.local.
 *
 * Allowlist is deliberately narrow: provider API keys + assistant tuning +
 * adb hub knobs. Anything that requires a full process restart to take
 * effect (auth secrets, HOST/PORT, ADB_PATH, session signing) is NOT here
 * to avoid lying to the operator about "save & apply" actually applying.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { envFilePath, parseDotEnv, reloadEnvFiles } from './env-loader.js';

export type SettingCategory = 'providers' | 'assistant' | 'hub' | 'video';
export type SettingType = 'text' | 'password' | 'number' | 'boolean';

export interface SettingMeta {
  key: string;
  label: string;
  description: string;
  category: SettingCategory;
  type: SettingType;
  secret?: boolean;
  placeholder?: string;
  /** True when changing this value won't take effect until the hub restarts. */
  restartRequired?: boolean;
  /**
   * Closed-set option list. When present, the UI renders a dropdown instead
   * of a free-text input. label defaults to the value when omitted.
   */
  options?: { value: string; label?: string }[];
}

export const CATEGORY_ORDER: { id: SettingCategory; label: string; hint: string }[] = [
  { id: 'providers', label: 'Providers', hint: 'API keys + endpoints for the assistant providers.' },
  { id: 'assistant', label: 'Assistant', hint: 'Default model and tool-loop budget.' },
  { id: 'video', label: 'Video', hint: 'scrcpy stream quality per preset (main = focused tile, thumb = grid).' },
  { id: 'hub', label: 'Hub', hint: 'Local adb daemon and logging.' },
];

const SCRCPY_MAX_SIZE_OPTIONS = [
  { value: '480', label: '480 px · low (cellular-friendly)' },
  { value: '720', label: '720 px' },
  { value: '960', label: '960 px' },
  { value: '1080', label: '1080 px' },
  { value: '1280', label: '1280 px · default' },
  { value: '1440', label: '1440 px' },
  { value: '1920', label: '1920 px · high' },
];

const SCRCPY_BITRATE_OPTIONS = [
  { value: '500000', label: '500 Kbps · minimum' },
  { value: '1000000', label: '1 Mbps' },
  { value: '2000000', label: '2 Mbps' },
  { value: '4000000', label: '4 Mbps' },
  { value: '6000000', label: '6 Mbps · default' },
  { value: '8000000', label: '8 Mbps' },
  { value: '12000000', label: '12 Mbps · high' },
  { value: '20000000', label: '20 Mbps · max' },
];

const SCRCPY_FPS_OPTIONS = [
  { value: '10', label: '10 fps · low motion' },
  { value: '15', label: '15 fps' },
  { value: '24', label: '24 fps · cinematic' },
  { value: '30', label: '30 fps · default' },
  { value: '60', label: '60 fps · high' },
];

export const SETTINGS_META: SettingMeta[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key',
    description: 'Enables the anthropic-api provider in the assistant.',
    category: 'providers',
    type: 'password',
    secret: true,
    placeholder: 'sk-ant-…',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API key',
    description: 'Enables the openai provider.',
    category: 'providers',
    type: 'password',
    secret: true,
    placeholder: 'sk-…',
  },
  {
    key: 'OPENAI_BASE_URL',
    label: 'OpenAI base URL',
    description: 'Override the default https://api.openai.com/v1 endpoint.',
    category: 'providers',
    type: 'text',
    placeholder: 'https://api.openai.com/v1',
  },
  {
    key: 'GOOGLE_GENERATIVE_AI_API_KEY',
    label: 'Google Gemini API key',
    description: 'Enables the google provider.',
    category: 'providers',
    type: 'password',
    secret: true,
  },
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API key',
    description: 'Enables the deepseek provider.',
    category: 'providers',
    type: 'password',
    secret: true,
    placeholder: 'sk-…',
  },
  {
    key: 'OLLAMA_BASE_URL',
    label: 'Ollama base URL',
    description: 'Remote Ollama OpenAI-compat endpoint. TLS verification is disabled for this provider.',
    category: 'providers',
    type: 'text',
    placeholder: 'https://136.24.37.174:8443/v1',
  },
  {
    key: 'OPENAI_COMPATIBLE_BASE_URL',
    label: 'OpenAI-compatible base URL',
    description: 'Generic OpenAI-shaped endpoint — OpenRouter, Together, Groq, vLLM, …',
    category: 'providers',
    type: 'text',
    placeholder: 'https://openrouter.ai/api/v1',
  },
  {
    key: 'OPENAI_COMPATIBLE_API_KEY',
    label: 'OpenAI-compatible API key',
    description: 'Optional bearer token for the compat endpoint.',
    category: 'providers',
    type: 'password',
    secret: true,
  },
  {
    key: 'OPENAI_COMPATIBLE_LABEL',
    label: 'OpenAI-compatible label',
    description: 'Display label shown in the assistant provider dropdown.',
    category: 'providers',
    type: 'text',
    placeholder: 'OpenRouter',
  },
  {
    key: 'ASSISTANT_MODEL',
    label: 'Default assistant model',
    description: 'Used when no per-provider model is selected.',
    category: 'assistant',
    type: 'text',
    placeholder: 'claude-sonnet-4-6',
  },
  {
    key: 'ASSISTANT_MAX_STEPS',
    label: 'Max tool-call steps',
    description: 'Stops the assistant tool loop after N steps. Guards against runaway loops.',
    category: 'assistant',
    type: 'number',
    placeholder: '20',
  },
  {
    key: 'SCRCPY_MAIN_MAX_SIZE',
    label: 'Main resolution',
    description: 'Longest edge of the focused-tile stream. Applies to new sessions.',
    category: 'video',
    type: 'number',
    placeholder: '1280',
    options: SCRCPY_MAX_SIZE_OPTIONS,
  },
  {
    key: 'SCRCPY_MAIN_VIDEO_BITRATE',
    label: 'Main bitrate',
    description: 'H.264 target bitrate for the focused-tile stream.',
    category: 'video',
    type: 'number',
    placeholder: '6000000',
    options: SCRCPY_BITRATE_OPTIONS,
  },
  {
    key: 'SCRCPY_MAIN_MAX_FPS',
    label: 'Main fps cap',
    description: 'Frame-rate ceiling for the focused-tile stream.',
    category: 'video',
    type: 'number',
    placeholder: '30',
    options: SCRCPY_FPS_OPTIONS,
  },
  {
    key: 'SCRCPY_THUMB_MAX_SIZE',
    label: 'Thumb resolution',
    description: 'Longest edge of the grid-tile (thumbnail) stream.',
    category: 'video',
    type: 'number',
    placeholder: '1280',
    options: SCRCPY_MAX_SIZE_OPTIONS,
  },
  {
    key: 'SCRCPY_THUMB_VIDEO_BITRATE',
    label: 'Thumb bitrate',
    description: 'H.264 target bitrate for the grid-tile (thumbnail) stream.',
    category: 'video',
    type: 'number',
    placeholder: '6000000',
    options: SCRCPY_BITRATE_OPTIONS,
  },
  {
    key: 'SCRCPY_THUMB_MAX_FPS',
    label: 'Thumb fps cap',
    description: 'Frame-rate ceiling for the grid-tile (thumbnail) stream.',
    category: 'video',
    type: 'number',
    placeholder: '30',
    options: SCRCPY_FPS_OPTIONS,
  },
  {
    key: 'ADB_AUTO_START',
    label: 'Auto-start adb-server at boot',
    description: 'Runs `adb start-server` when the hub launches. Avoids manual setup after a reboot.',
    category: 'hub',
    type: 'boolean',
    restartRequired: true,
  },
  {
    key: 'LOG_LEVEL',
    label: 'Log level',
    description: 'Fastify logger verbosity. Restart required for the change to take effect.',
    category: 'hub',
    type: 'text',
    placeholder: 'info',
    restartRequired: true,
    options: [
      { value: 'trace', label: 'trace · everything, including per-request internals' },
      { value: 'debug', label: 'debug · verbose operator-level detail' },
      { value: 'info', label: 'info · default — requests, lifecycle, warnings' },
      { value: 'warn', label: 'warn · only warnings and errors' },
      { value: 'error', label: 'error · errors only' },
      { value: 'fatal', label: 'fatal · just fatal crashes' },
      { value: 'silent', label: 'silent · disable all logging' },
    ],
  },
];

export const ALLOWED_KEYS = new Set(SETTINGS_META.map((m) => m.key));

export interface SettingValue {
  key: string;
  value: string | null;
  /** True when this key is currently defined in process.env. */
  defined: boolean;
  /** True when the metadata flags this key as secret (UI shows masked preview only). */
  secret: boolean;
  /** A short masked preview for secrets, e.g. "sk-ant-…abcd". */
  preview?: string;
}

export function getSettingValues(): SettingValue[] {
  return SETTINGS_META.map((meta) => {
    const raw = process.env[meta.key];
    const defined = raw != null && raw !== '';
    const value = meta.secret ? null : (raw ?? null);
    const preview = meta.secret && defined ? maskPreview(raw!) : undefined;
    return { key: meta.key, value, defined, secret: meta.secret === true, preview };
  });
}

function maskPreview(value: string): string {
  if (value.length <= 8) return '•'.repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Apply a patch — write to .env.local (preserving comments + non-allowlisted
 * keys), mutate process.env, and rebuild precedence so a key cleared from
 * .env.local but still present in .env reverts to the .env value.
 *
 * `null` value clears the key from .env.local (and from process.env).
 * Throws if any key is outside the allowlist.
 *
 * `restartPending` carries the subset of touched keys whose `restartRequired`
 * flag is set in `SETTINGS_META` — they were written to .env.local but the
 * running process won't honour them until it restarts. The route forwards
 * this so the UI can warn the operator instead of pretending success.
 */
export function applySettingsPatch(patch: Record<string, string | null>): {
  applied: string[];
  removed: string[];
  restartPending: string[];
} {
  const applied: string[] = [];
  const removed: string[] = [];
  const restartRequired = new Set(
    SETTINGS_META.filter((m) => m.restartRequired === true).map((m) => m.key),
  );
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k)) throw new Error(`disallowed key: ${k}`);
    if (v === null || v === '') removed.push(k);
    else applied.push(k);
  }

  writeEnvLocal(patch);

  // For applied keys, set straight away; for removed keys, drop from process.env
  // then let reloadEnvFiles re-apply .env's baseline (if any).
  for (const k of applied) process.env[k] = patch[k] as string;
  reloadEnvFiles(removed);

  const restartPending = [...applied, ...removed].filter((k) => restartRequired.has(k));
  return { applied, removed, restartPending };
}

function writeEnvLocal(patch: Record<string, string | null>): void {
  const path = envFilePath('.env.local');
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const lines = existing.split(/\r?\n/);
  const handled = new Set<string>();
  const next: string[] = [];

  for (const line of lines) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
    const key = m?.[1];
    if (key && key in patch) {
      handled.add(key);
      const value = patch[key];
      if (value === null || value === undefined || value === '') continue; // drop the line
      next.push(`${key}=${quoteIfNeeded(value)}`);
    } else {
      next.push(line);
    }
  }

  // Append keys not already present in the file.
  for (const [k, v] of Object.entries(patch)) {
    if (handled.has(k)) continue;
    if (v === null || v === '') continue;
    next.push(`${k}=${quoteIfNeeded(v)}`);
  }

  // Collapse trailing blank lines to exactly one final newline.
  while (next.length > 1 && next[next.length - 1] === '' && next[next.length - 2] === '') {
    next.pop();
  }
  const body = next.join('\n').replace(/\n*$/, '\n');
  writeFileSync(path, body, { encoding: 'utf-8', mode: 0o600 });
}

function quoteIfNeeded(value: string): string {
  if (/^[\w./:@=+-]+$/.test(value) && !value.startsWith(' ') && !value.endsWith(' ')) {
    return value;
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/** Re-read both env files. Returns the load report so callers can log it. */
export { parseDotEnv } from './env-loader.js';
