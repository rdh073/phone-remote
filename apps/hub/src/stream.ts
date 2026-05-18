import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

import { AndroidKeyEventAction, AndroidKeyEventMeta, AndroidMotionEventAction } from '@yume-chan/scrcpy';
import type { AndroidKeyCode, ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

import { ClientMessage, type ServerMessage } from '@phone-remote/protocol';

import { startScrcpy, type ScrcpyPreset, type ScrcpyRes } from './scrcpy.js';

type Session = Awaited<ReturnType<typeof startScrcpy>>;
type VideoStream = NonNullable<Awaited<Session['videoStream']>>;
type Controller = NonNullable<Session['controller']>;
type OutputStream = Session['output'];

const PACKET_CONFIG = 0;
const PACKET_DATA = 1;
const PACKET_KEYFRAME = 2;
const WS_OPEN = 1;

export async function attachStreamSession(
  socket: WebSocket,
  serial: string,
  res: ScrcpyRes,
  log: FastifyBaseLogger,
  override?: Partial<ScrcpyPreset>,
): Promise<void> {
  let session: Session | undefined;
  try {
    session = await startScrcpy(serial, res, override);
    void drainOutput(session.output, serial, log);
    void session.exited
      .catch((err: unknown) => log.warn({ err, serial }, 'scrcpy server exited'))
      .finally(() => socket.close());

    const video = await session.videoStream;
    if (!video) {
      sendJson(socket, { kind: 'error', message: 'video disabled' });
      socket.close();
      return;
    }

    sendJson(socket, {
      kind: 'video-meta',
      codec: video.metadata.codec,
      width: video.width,
      height: video.height,
    });

    const owned = session;
    socket.on('close', () => {
      owned.close().catch((err: unknown) => log.error({ err }, 'scrcpy close failed'));
    });

    if (session.controller) {
      bindControl(socket, session.controller, video, log);
    }
    void pumpVideo(video, socket, log);
  } catch (err) {
    log.error({ err }, 'scrcpy session failed');
    sendJson(socket, { kind: 'error', message: (err as Error).message });
    await session?.close().catch(() => {});
    socket.close();
  }
}

async function drainOutput(output: OutputStream, serial: string, log: FastifyBaseLogger): Promise<void> {
  const reader = output.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) log.debug({ serial, line: value }, 'scrcpy');
    }
  } catch (err) {
    log.debug({ err, serial }, 'scrcpy output drain stopped');
  } finally {
    reader.releaseLock();
  }
}

function sendJson(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState !== WS_OPEN) return;
  socket.send(JSON.stringify(msg));
}

async function pumpVideo(video: VideoStream, socket: WebSocket, log: FastifyBaseLogger): Promise<void> {
  const reader = video.stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (socket.readyState !== socket.OPEN) break;
      socket.send(framePacket(value));
    }
  } catch (err) {
    log.error({ err }, 'video pump error');
  } finally {
    reader.releaseLock();
  }
}

export function framePacket(p: ScrcpyMediaStreamPacket): Uint8Array {
  const out = new Uint8Array(1 + p.data.length);
  out[0] = p.type === 'configuration' ? PACKET_CONFIG : p.keyframe ? PACKET_KEYFRAME : PACKET_DATA;
  out.set(p.data, 1);
  return out;
}

function bindControl(
  socket: WebSocket,
  controller: Controller,
  video: VideoStream,
  log: FastifyBaseLogger,
): void {
  socket.on('message', (raw: Buffer) => {
    const msg = parseClientMessage(raw, log);
    if (!msg) return;
    dispatchControl(msg, controller, video).catch((err: unknown) => {
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

async function dispatchControl(msg: ClientMessage, controller: Controller, video: VideoStream): Promise<void> {
  switch (msg.kind) {
    case 'touch':
      await controller.injectTouch({
        action: toMotionAction(msg.action),
        pointerId: BigInt(msg.pointerId),
        pointerX: Math.round(msg.x * video.width),
        pointerY: Math.round(msg.y * video.height),
        videoWidth: video.width,
        videoHeight: video.height,
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
