import { describe, expect, it } from 'vitest';
import { ClientMessage, Device, PairRequest, ServerMessage } from '../src/index';

describe('Device schema', () => {
  it('parses a USB device', () => {
    const r = Device.safeParse({ serial: 'abc123', state: 'device', source: 'usb' });
    expect(r.success).toBe(true);
  });
  it('accepts tailnet metadata', () => {
    const r = Device.safeParse({
      serial: '100.64.0.5:5555',
      state: 'device',
      source: 'tcp',
      tailnet: {
        nodeId: 'n-abc',
        name: 'sg-15-device',
        hostname: 'sg-15-device',
        location: 'SG',
        region: 'SEA',
        site: 'site-sg-15',
        tags: ['tag:site-sg', 'tag:my'],
      },
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown state', () => {
    const r = Device.safeParse({ serial: 'abc', state: 'bogus', source: 'usb' });
    expect(r.success).toBe(false);
  });
});

describe('ClientMessage', () => {
  it('accepts a touch with defaults', () => {
    const r = ClientMessage.parse({ kind: 'touch', action: 'down', x: 0.5, y: 0.5 });
    expect(r).toMatchObject({ kind: 'touch', pointerId: 0, pressure: 1, actionButton: 0, buttons: 0 });
  });
  it('accepts scrcpy mouse pointer id for touch', () => {
    const r = ClientMessage.safeParse({
      kind: 'touch',
      action: 'down',
      x: 0.5,
      y: 0.5,
      pointerId: -1,
      actionButton: 1,
      buttons: 1,
    });
    expect(r.success).toBe(true);
  });
  it('rejects invalid touch coordinates', () => {
    expect(ClientMessage.safeParse({ kind: 'touch', action: 'down', x: 'abc', y: 0 }).success).toBe(false);
    expect(ClientMessage.safeParse({ kind: 'touch', action: 'down', x: -0.1, y: 0 }).success).toBe(false);
    expect(ClientMessage.safeParse({ kind: 'touch', action: 'down', x: 0.5, y: 1.1 }).success).toBe(false);
  });
  it('accepts a key message', () => {
    const r = ClientMessage.safeParse({ kind: 'key', keyCode: 4, action: 'down' });
    expect(r.success).toBe(true);
  });
  it('rejects invalid key codes', () => {
    expect(ClientMessage.safeParse({ kind: 'key', keyCode: -1, action: 'down' }).success).toBe(false);
    expect(ClientMessage.safeParse({ kind: 'key', keyCode: 4.5, action: 'down' }).success).toBe(false);
  });
  it('accepts a text message', () => {
    const r = ClientMessage.safeParse({ kind: 'text', text: 'hi' });
    expect(r.success).toBe(true);
  });
});

describe('ServerMessage', () => {
  it('parses video-meta', () => {
    const r = ServerMessage.safeParse({ kind: 'video-meta', codec: 1748121140, width: 1080, height: 1920 });
    expect(r.success).toBe(true);
  });
  it('parses error', () => {
    const r = ServerMessage.safeParse({ kind: 'error', message: 'nope' });
    expect(r.success).toBe(true);
  });
});

describe('PairRequest', () => {
  it('rejects non-6-digit pair codes', () => {
    expect(PairRequest.safeParse({ ip: '1.2.3.4', pairPort: 1, pairCode: '12345', connectPort: 2 }).success).toBe(false);
    expect(PairRequest.safeParse({ ip: '1.2.3.4', pairPort: 1, pairCode: 'abcdef', connectPort: 2 }).success).toBe(false);
  });
  it('rejects port 0 or 70000', () => {
    expect(PairRequest.safeParse({ ip: '1.2.3.4', pairPort: 0, pairCode: '123456', connectPort: 2 }).success).toBe(false);
    expect(PairRequest.safeParse({ ip: '1.2.3.4', pairPort: 70000, pairCode: '123456', connectPort: 2 }).success).toBe(false);
  });
  it('accepts a valid pair request', () => {
    const r = PairRequest.safeParse({ ip: '100.64.0.5', pairPort: 42891, pairCode: '123456', connectPort: 38743 });
    expect(r.success).toBe(true);
  });
});
