import type { ClientMessage } from '@phone-remote/protocol';

const SCRCPY_MOUSE_POINTER_ID = -1;
const ANDROID_PRIMARY_BUTTON = 1;

type TouchAction = Extract<ClientMessage, { kind: 'touch' }>['action'];
type TouchMessage = Extract<ClientMessage, { kind: 'touch' }>;

type RectLike = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

type PointerInput = {
  pointerType: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  pressure: number;
  buttons: number;
};

type VideoSize = {
  width: number;
  height: number;
};

export function buildTouchMessage(
  action: TouchAction,
  pointer: PointerInput,
  rect: RectLike,
  video: VideoSize,
): TouchMessage | null {
  const point = normalizedVideoPoint(rect, pointer.clientX, pointer.clientY, video.width, video.height);

  return {
    kind: 'touch',
    action,
    x: point.x,
    y: point.y,
    pointerId: pointerIdFor(pointer),
    pressure: action === 'up' ? 0 : pointer.pressure || 1,
    actionButton: actionButtonFor(pointer, action),
    buttons: buttonsFor(pointer, action),
  };
}

function normalizedVideoPoint(
  rect: RectLike,
  clientX: number,
  clientY: number,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number; inside: boolean } {
  const videoAspect = videoWidth / videoHeight;
  const rectAspect = rect.width / rect.height;
  let contentWidth = rect.width;
  let contentHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (rectAspect > videoAspect) {
    contentWidth = rect.height * videoAspect;
    offsetX = (rect.width - contentWidth) / 2;
  } else {
    contentHeight = rect.width / videoAspect;
    offsetY = (rect.height - contentHeight) / 2;
  }

  const rawX = (clientX - rect.left - offsetX) / contentWidth;
  const rawY = (clientY - rect.top - offsetY) / contentHeight;
  return { x: clamp(rawX), y: clamp(rawY), inside: rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1 };
}

function pointerIdFor(pointer: PointerInput): number {
  return pointer.pointerType === 'mouse' ? SCRCPY_MOUSE_POINTER_ID : pointer.pointerId;
}

function actionButtonFor(pointer: PointerInput, action: TouchAction): number {
  if (pointer.pointerType !== 'mouse') return 0;
  return action === 'move' ? 0 : ANDROID_PRIMARY_BUTTON;
}

function buttonsFor(pointer: PointerInput, action: TouchAction): number {
  if (pointer.pointerType !== 'mouse' || action === 'up') return 0;
  return pointer.buttons || ANDROID_PRIMARY_BUTTON;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
