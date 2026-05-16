/**
 * Repo-root .env loader with cliper-style precedence.
 *
 * Order:
 *   1. .env           — committed defaults (or local fallback)
 *   2. .env.local     — operator overrides; wins over .env
 *
 * Both are merged into process.env. Later loads overwrite earlier ones so
 * `.env.local` always has the final say. Call `loadEnvFiles()` at hub startup
 * before anything else reads process.env, and again after a settings PATCH
 * so a delete-and-revert (removing a key from .env.local that .env also
 * defines) restores the .env baseline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// apps/hub/src/env-loader.ts → ../../.. = repo root
const REPO_ROOT = resolve(HERE, '../../..');

const FILES = ['.env', '.env.local'] as const;

export function repoRoot(): string {
  return REPO_ROOT;
}

export function envFilePath(name: (typeof FILES)[number]): string {
  return resolve(REPO_ROOT, name);
}

export interface EnvLoadReport {
  files: { name: string; path: string; count: number }[];
}

export function loadEnvFiles(): EnvLoadReport {
  const files: EnvLoadReport['files'] = [];
  for (const name of FILES) {
    const path = envFilePath(name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf-8');
    let count = 0;
    for (const [k, v] of parseDotEnv(content)) {
      process.env[k] = v;
      count += 1;
    }
    files.push({ name, path, count });
  }
  return { files };
}

/**
 * Re-resolve precedence after a PATCH. Pass the keys whose .env.local entry
 * was removed: they're deleted from process.env first so a stale value can't
 * shadow the .env fallback once we reload.
 */
export function reloadEnvFiles(removed: Iterable<string> = []): EnvLoadReport {
  for (const k of removed) delete process.env[k];
  return loadEnvFiles();
}

export function parseDotEnv(content: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out.push([key, value]);
  }
  return out;
}
