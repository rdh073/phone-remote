import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPreset } from '../src/scrcpy.js';

const KEYS = [
  'SCRCPY_MAIN_MAX_SIZE',
  'SCRCPY_MAIN_VIDEO_BITRATE',
  'SCRCPY_MAIN_MAX_FPS',
  'SCRCPY_THUMB_MAX_SIZE',
  'SCRCPY_THUMB_VIDEO_BITRATE',
  'SCRCPY_THUMB_MAX_FPS',
] as const;

describe('readPreset', () => {
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it('returns the hardcoded defaults when no env is set', () => {
    expect(readPreset('main')).toEqual({ maxSize: 1280, videoBitRate: 6_000_000, maxFps: 30 });
    expect(readPreset('thumb')).toEqual({ maxSize: 1280, videoBitRate: 6_000_000, maxFps: 30 });
  });

  it('honors per-preset env overrides', () => {
    process.env.SCRCPY_MAIN_MAX_SIZE = '1920';
    process.env.SCRCPY_MAIN_VIDEO_BITRATE = '12000000';
    process.env.SCRCPY_MAIN_MAX_FPS = '60';
    process.env.SCRCPY_THUMB_MAX_SIZE = '720';
    process.env.SCRCPY_THUMB_VIDEO_BITRATE = '1000000';
    process.env.SCRCPY_THUMB_MAX_FPS = '15';

    expect(readPreset('main')).toEqual({ maxSize: 1920, videoBitRate: 12_000_000, maxFps: 60 });
    expect(readPreset('thumb')).toEqual({ maxSize: 720, videoBitRate: 1_000_000, maxFps: 15 });
  });

  it('falls back to default when the env value is not a positive finite number', () => {
    for (const bad of ['', 'abc', '0', '-5', 'NaN', 'Infinity']) {
      process.env.SCRCPY_MAIN_MAX_SIZE = bad;
      expect(readPreset('main').maxSize, `bad value ${JSON.stringify(bad)}`).toBe(1280);
    }
  });

  it('treats main and thumb env vars independently', () => {
    process.env.SCRCPY_MAIN_MAX_SIZE = '1920';
    // thumb left unset
    expect(readPreset('main').maxSize).toBe(1920);
    expect(readPreset('thumb').maxSize).toBe(1280);
  });
});
