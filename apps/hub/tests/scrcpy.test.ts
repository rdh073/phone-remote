import { describe, expect, it } from 'vitest';
import { isScrcpyRes } from '../src/scrcpy.js';

describe('isScrcpyRes', () => {
  it.each([
    ['main', true],
    ['thumb', true],
    ['high', false],
    ['', false],
    [undefined, false],
    [123, false],
  ])('%j → %s', (v, expected) => {
    expect(isScrcpyRes(v)).toBe(expected);
  });
});
