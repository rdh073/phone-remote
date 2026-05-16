import { describe, expect, it } from 'vitest';
import { parseServerMessage, parseStreamPacket } from '../src/lib/streamSocket';

describe('parseServerMessage', () => {
  it('parses a valid video-meta message', () => {
    const msg = parseServerMessage('{"kind":"video-meta","codec":42,"width":720,"height":1280}');
    expect(msg).toEqual({
      kind: 'video-meta',
      codec: 42,
      width: 720,
      height: 1280,
    });
  });

  it('parses a valid error message', () => {
    const msg = parseServerMessage('{"kind":"error","message":"boom"}');
    expect(msg).toEqual({ kind: 'error', message: 'boom' });
  });

  it('returns null for invalid json', () => {
    expect(parseServerMessage('{not-json')).toBeNull();
  });

  it('returns null for invalid schema', () => {
    expect(parseServerMessage('{"kind":"noop"}')).toBeNull();
  });
});

describe('parseStreamPacket', () => {
  it('parses configuration packet', () => {
    const packet = parseStreamPacket(new Uint8Array([0, 1, 2, 3]).buffer);
    expect(packet).toEqual({
      type: 'configuration',
      data: new Uint8Array([1, 2, 3]),
    });
  });

  it('parses data packet', () => {
    const packet = parseStreamPacket(new Uint8Array([2, 9, 8]).buffer);
    expect(packet).toEqual({
      type: 'data',
      keyframe: true,
      data: new Uint8Array([9, 8]),
    });
  });

  it('treats unknown frame tag as non-keyframe data', () => {
    const packet = parseStreamPacket(new Uint8Array([9, 9]).buffer);
    expect(packet).toEqual({
      type: 'data',
      keyframe: false,
      data: new Uint8Array([9]),
    });
  });

  it('returns null for invalid payload types', () => {
    expect(parseStreamPacket('not-bytes')).toBeNull();
  });
});
