import { describe, expect, it } from 'vitest';
import { framePacket } from '../src/stream.js';

describe('framePacket wire format', () => {
  it('tags configuration packets with 0', () => {
    const p = framePacket({ type: 'configuration', data: new Uint8Array([1, 2, 3]) });
    expect(p[0]).toBe(0);
    expect(Array.from(p.subarray(1))).toEqual([1, 2, 3]);
  });
  it('tags data (non-keyframe) packets with 1', () => {
    const p = framePacket({ type: 'data', data: new Uint8Array([9, 8]), keyframe: false });
    expect(p[0]).toBe(1);
    expect(Array.from(p.subarray(1))).toEqual([9, 8]);
  });
  it('tags keyframe packets with 2', () => {
    const p = framePacket({ type: 'data', data: new Uint8Array([7]), keyframe: true });
    expect(p[0]).toBe(2);
    expect(Array.from(p.subarray(1))).toEqual([7]);
  });
  it('preserves the original byte length', () => {
    const payload = new Uint8Array(1024).fill(42);
    const p = framePacket({ type: 'data', data: payload });
    expect(p.length).toBe(1 + payload.length);
  });
});
