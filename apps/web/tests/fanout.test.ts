import { describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '@phone-remote/protocol';
import { broadcastFrom, registerSender } from '../src/lib/fanout';

const msg: ClientMessage = { kind: 'text', text: 'hi' };

describe('fanout', () => {
  it('delivers to all senders except the origin', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const unA = registerSender('a', a);
    const unB = registerSender('b', b);
    const unC = registerSender('c', c);

    broadcastFrom('a', msg, ['a', 'b', 'c']);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(msg);
    expect(c).toHaveBeenCalledWith(msg);

    unA(); unB(); unC();
  });

  it('respects the targets filter (no broadcast to unticked)', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const unA = registerSender('a', a);
    const unB = registerSender('b', b);
    const unC = registerSender('c', c);

    broadcastFrom('a', msg, ['a', 'b']);

    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();

    unA(); unB(); unC();
  });

  it('unregister removes the sender', () => {
    const a = vi.fn();
    const unA = registerSender('a', a);
    unA();
    broadcastFrom('z', msg, ['a']);
    expect(a).not.toHaveBeenCalled();
  });

  it('unregister is a no-op if the sender was already replaced', () => {
    const a1 = vi.fn();
    const a2 = vi.fn();
    const un1 = registerSender('a', a1);
    registerSender('a', a2); // replace
    un1(); // should NOT remove a2
    broadcastFrom('z', msg, ['a']);
    expect(a2).toHaveBeenCalledTimes(1);
  });
});
