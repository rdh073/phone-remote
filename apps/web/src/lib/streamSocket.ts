import { ServerMessage, type ServerMessage as ServerMessageType } from '@phone-remote/protocol';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

export type ParsedServerMessage = ServerMessageType;

export function parseServerMessage(raw: unknown): ParsedServerMessage | null {
  if (typeof raw !== 'string') return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = ServerMessage.safeParse(decoded);
  return result.success ? result.data : null;
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof Blob) return null;
  return null;
}

export function parseStreamPacket(data: unknown): ScrcpyMediaStreamPacket | null {
  const bytes = toUint8Array(data);
  if (!bytes) return null;

  const tag = bytes[0];
  const payload = bytes.subarray(1);

  if (tag === 0) {
    return { type: 'configuration', data: payload };
  }

  return {
    type: 'data',
    keyframe: tag === 2,
    data: payload,
  };
}
