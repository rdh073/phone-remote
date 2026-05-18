import { useEffect, useRef, useState, type RefObject } from 'react';
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { ReadableStream } from '@yume-chan/stream-extra';

import { type ClientMessage } from '@phone-remote/protocol';
import { registerSender } from '../lib/fanout';
import { useInputLockStore } from '../stores/inputLock';
import { useReconnectStore } from '../stores/reconnect';
import { getThumbQuality, useVideoQualityStore } from '../stores/videoQuality';
import { parseServerMessage, parseStreamPacket } from '../lib/streamSocket';

export type VideoMeta = { codec: number; width: number; height: number };
export type StreamRes = 'main' | 'thumb';

type Options = {
  serial: string;
  res: StreamRes;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** When true, no WS opens and the decoder is torn down. Flip back to false
   * and the hook reconnects from scratch — used by Tile's IntersectionObserver
   * to pause offscreen streams. */
  paused?: boolean;
};

const VIDEO_CANVAS_WAIT_MS = 2500;

export type StreamHealth = 'connecting' | 'live' | 'stalled' | 'dead' | 'paused';
export type StreamStats = { fps: number; kbps: number; fpsSamples: number[]; kbpsSamples: number[] };

const STREAM_LIVE_WINDOW_MS = 1800;
const STREAM_STALLED_WINDOW_MS = 5000;
const SAMPLE_WINDOW = 30; // seconds of rolling history

export function useScrcpyStream({ serial, res, canvasRef, paused = false }: Options) {
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<StreamHealth>('connecting');
  const [stats, setStats] = useState<StreamStats>({ fps: 0, kbps: 0, fpsSamples: [], kbpsSamples: [] });
  const reconnectGen = useReconnectStore((s) => s.counters[serial] ?? 0);
  const thumbTier = useVideoQualityStore((s) => s.tier);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessagesRef = useRef<string[]>([]);
  const lastFrameAtRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const byteCountRef = useRef(0);

  useEffect(() => {
    setMeta(null);
    setError(null);
    setStats({ fps: 0, kbps: 0, fpsSamples: [], kbpsSamples: [] });
    lastFrameAtRef.current = null;
    frameCountRef.current = 0;
    byteCountRef.current = 0;

    // Paused mode: no WS, no decoder, no fanout registration. Cleanup is a
    // no-op since nothing was created. health = 'paused' so Tile can show an
    // overlay distinct from 'dead'/'stalled' (which would imply a problem).
    if (paused) {
      setHealth('paused');
      return;
    }

    setHealth('connecting');

    let cancelled = false;
    let packetController: ReadableStreamDefaultController<ScrcpyMediaStreamPacket> | undefined;
    let packetStreamClosed = false;
    let decoder: WebCodecsVideoDecoder | undefined;

    const closePacketStream = () => {
      if (!packetController || packetStreamClosed) return;
      packetStreamClosed = true;
      try {
        packetController.close();
      } catch {
        // Ignore close races if stream is already closed.
      }
    };

    const waitForCanvas = (): Promise<HTMLCanvasElement> => {
      const deadline = Date.now() + VIDEO_CANVAS_WAIT_MS;
      return new Promise((resolve, reject) => {
        const tick = () => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (canvas) return resolve(canvas);
          if (Date.now() >= deadline) return reject(new Error('canvas not ready'));
          requestAnimationFrame(tick);
        };
        tick();
      });
    };

    const flushPending = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const queued = pendingMessagesRef.current;
      for (const msg of queued.splice(0, queued.length)) {
        ws.send(msg);
      }
    };

    const params = new URLSearchParams({ res });
    if (res === 'thumb') {
      const q = getThumbQuality(thumbTier);
      params.set('maxSize', String(q.maxSize));
      params.set('bitrate', String(q.videoBitRate));
      params.set('fps', String(q.maxFps));
    }
    const ws = new WebSocket(`/ws/dev/${encodeURIComponent(serial)}?${params.toString()}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    ws.onerror = () => {
      if (!cancelled) setError('websocket error');
    };
    ws.onopen = flushPending;
    ws.onclose = () => {
      if (!cancelled) closePacketStream();
    };

    ws.onmessage = async (event) => {
      if (cancelled) return;

      const parsed = parseServerMessage(event.data);
      if (typeof event.data === 'string') {
        if (!parsed) {
          setError('invalid server message');
          return;
        }
        if (parsed.kind === 'video-meta') {
          setMeta(parsed);
          setError(null);
          try {
            const canvas = await waitForCanvas();
            const renderer = new WebGLVideoFrameRenderer(canvas);
            decoder = new WebCodecsVideoDecoder({
              codec: parsed.codec as ScrcpyVideoCodecId,
              renderer,
            });
            const stream = new ReadableStream<ScrcpyMediaStreamPacket>({
              start(controller) {
                packetController = controller;
              },
            });
            stream.pipeTo(decoder.writable).catch((err: unknown) => {
              if (!cancelled) setError(String(err));
            });
            return;
          } catch (err) {
            if (!cancelled) setError(String(err));
            return;
          }
        }
        if (parsed.kind === 'error') {
          setError(parsed.message);
          return;
        }
        return;
      }

      const packet = parseStreamPacket(event.data);
      if (!packetController || !packet) return;
      if (packetStreamClosed) return;
      try {
        packetController.enqueue(packet);
        lastFrameAtRef.current = performance.now();
        if (packet.type !== 'configuration') {
          frameCountRef.current += 1;
          byteCountRef.current += packet.data.byteLength;
        }
      } catch (err) {
        setError(String(err));
      }
    };

    // Rate-limited health classifier — re-checks every second but only re-renders
    // on bucket transitions, so 50 tiles cost 50 setState/sec max (vs 1500/sec if
    // we updated on every frame).
    const healthTick = window.setInterval(() => {
      if (cancelled) return;
      const last = lastFrameAtRef.current;
      const ws = wsRef.current;
      let next: StreamHealth;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        next = 'dead';
      } else if (last == null) {
        next = 'connecting';
      } else {
        const age = performance.now() - last;
        if (age < STREAM_LIVE_WINDOW_MS) next = 'live';
        else if (age < STREAM_STALLED_WINDOW_MS) next = 'stalled';
        else next = 'dead';
      }
      setHealth((prev) => (prev === next ? prev : next));

      // 1-second rolling stats — reset counters every tick, smooth with prior sample.
      const fps = frameCountRef.current;
      const kbps = Math.round((byteCountRef.current * 8) / 1000);
      frameCountRef.current = 0;
      byteCountRef.current = 0;
      setStats((prev) => {
        const fpsSamples = [...prev.fpsSamples, fps].slice(-SAMPLE_WINDOW);
        const kbpsSamples = [...prev.kbpsSamples, kbps].slice(-SAMPLE_WINDOW);
        return { fps, kbps, fpsSamples, kbpsSamples };
      });
    }, 1000);

    const send = (msg: ClientMessage) => {
      // Honor per-device input lock at the WS boundary so broadcasts from other
      // tiles (sync mode), command-palette text injections, and toolbar key presses
      // routed via fanout are also swallowed — not just direct canvas taps.
      if (useInputLockStore.getState().lockedSerials.includes(serial)) return;
      const json = JSON.stringify(msg);
      const wsCurrent = wsRef.current;
      if (!wsCurrent || wsCurrent.readyState === WebSocket.CLOSED || wsCurrent.readyState === WebSocket.CLOSING) {
        pendingMessagesRef.current.push(json);
        return;
      }
      if (wsCurrent.readyState === WebSocket.OPEN) {
        wsCurrent.send(json);
        return;
      }
      pendingMessagesRef.current.push(json);
    };

    const unregister = registerSender(serial, send);

    return () => {
      cancelled = true;
      window.clearInterval(healthTick);
      unregister();
      ws.close();
      closePacketStream();
      decoder?.dispose();
      wsRef.current = null;
      pendingMessagesRef.current = [];
      lastFrameAtRef.current = null;
    };
  }, [serial, res, canvasRef, reconnectGen, paused, thumbTier]);

  const send = (msg: ClientMessage) => {
    const ws = wsRef.current;
    const json = JSON.stringify(msg);
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      pendingMessagesRef.current.push(json);
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
      return;
    }
    pendingMessagesRef.current.push(json);
  };

  return { meta, error, send, health, stats };
}
