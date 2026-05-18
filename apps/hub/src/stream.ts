import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

import { AndroidKeyEventAction, AndroidKeyEventMeta, AndroidMotionEventAction } from '@yume-chan/scrcpy';
import type { AndroidKeyCode, ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

import { ClientMessage, type ServerMessage } from '@phone-remote/protocol';

import {
  attachConsumer,
  type ScrcpyController,
  type ScrcpyPreset,
  type ScrcpyRes,
  type VideoMeta,
} from './scrcpy.js';

const PACKET_CONFIG = 0;
const PACKET_DATA = 1;
const PACKET_KEYFRAME = 2;
const WS_OPEN = 1;

export async function attachStreamSession(
  socket: WebSocket,
  serial: string,
  res: ScrcpyRes,
  log: FastifyBaseLogger,
  override: Partial<ScrcpyPreset> = {},
): Promise<void> {
  let detach: (() => void) | undefined;
  let socketClosed = false;
  let teardownStarted = false;

  // Register the close handler BEFORE we await attachConsumer — the pool's
  // cold start can take 10-15s on first attach, and the browser may give up
  // before then. Without this, the consumer leaks into pool.consumers
  // forever and prevents the pool's grace-window teardown from firing.
  socket.on('close', () => {
    socketClosed = true;
    detach?.();
  });

  const safeClose = () => {
    if (teardownStarted) return;
    teardownStarted = true;
    detach?.();
    if (!socketClosed) {
      try {
        socket.close();
      } catch {
        // already closing
      }
    }
  };

  try {
    const handle = await attachConsumer(serial, res, override, {
      onPacket: (packet) => {
        if (socket.readyState !== WS_OPEN) return;
        try {
          socket.send(framePacket(packet));
        } catch {
          safeClose();
        }
      },
      onError: (err) => {
        log.warn({ err, serial }, 'scrcpy pool error');
        sendJson(socket, { kind: 'error', message: err.message });
      },
      onClose: () => safeClose(),
    });
    detach = handle.detach;

    // Browser may have given up during the cold start — detach immediately
    // so the consumer doesn't sit in the pool waiting for a stream that has
    // no recipient.
    if (socketClosed) {
      detach();
      return;
    }

    sendJson(socket, {
      kind: 'video-meta',
      codec: handle.meta.codec,
      width: handle.meta.width,
      height: handle.meta.height,
    });

    if (handle.controller) {
      bindControl(socket, handle.controller, handle.meta, log);
    }
  } catch (err) {
    log.error({ err }, 'scrcpy attach failed');
    sendJson(socket, { kind: 'error', message: (err as Error).message });
    safeClose();
  }
}

function sendJson(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState !== WS_OPEN) return;
  socket.send(JSON.stringify(msg));
}

export function framePacket(p: ScrcpyMediaStreamPacket): Uint8Array {
  const out = new Uint8Array(1 + p.data.length);
  out[0] = p.type === 'configuration' ? PACKET_CONFIG : p.keyframe ? PACKET_KEYFRAME : PACKET_DATA;
  out.set(p.data, 1);
  return out;
}

function bindControl(
  socket: WebSocket,
  controller: ScrcpyController,
  meta: VideoMeta,
  log: FastifyBaseLogger,
): void {
  socket.on('message', (raw: Buffer) => {
    const msg = parseClientMessage(raw, log);
    if (!msg) return;
    dispatchControl(msg, controller, meta).catch((err: unknown) => {
      log.error({ err }, 'control inject failed');
    });
  });
}

function parseClientMessage(raw: Buffer, log: FastifyBaseLogger): ClientMessage | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.toString());
  } catch (err) {
    log.warn({ err }, 'invalid control message json');
    return null;
  }

  const parsed = ClientMessage.safeParse(decoded);
  if (!parsed.success) {
    log.warn({ err: parsed.error }, 'invalid control message');
    return null;
  }
  return parsed.data;
}

async function dispatchControl(msg: ClientMessage, controller: ScrcpyController, meta: VideoMeta): Promise<void> {
  switch (msg.kind) {
    case 'touch':
      await controller.injectTouch({
        action: toMotionAction(msg.action),
        pointerId: BigInt(msg.pointerId),
        pointerX: Math.round(msg.x * meta.width),
        pointerY: Math.round(msg.y * meta.height),
        videoWidth: meta.width,
        videoHeight: meta.height,
        pressure: msg.pressure,
        actionButton: msg.actionButton,
        buttons: msg.buttons,
      });
      return;
    case 'key':
      await controller.injectKeyCode({
        action: msg.action === 'down' ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up,
        keyCode: msg.keyCode as AndroidKeyCode,
        repeat: 0,
        metaState: AndroidKeyEventMeta.None,
      });
      return;
    case 'text':
      await controller.injectText(msg.text);
      return;
  }
}

function toMotionAction(a: 'down' | 'up' | 'move') {
  if (a === 'down') return AndroidMotionEventAction.Down;
  if (a === 'up') return AndroidMotionEventAction.Up;
  return AndroidMotionEventAction.Move;
}
