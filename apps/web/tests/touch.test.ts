import { describe, expect, it } from 'vitest';

import { buildTouchMessage } from '../src/lib/touch';

const portraitVideo = { width: 1080, height: 1920 };
const fittedPortraitRect = { left: 10, top: 20, width: 200, height: 400 };

const mousePointer = {
  pointerType: 'mouse',
  pointerId: 9,
  clientX: 110,
  clientY: 220,
  pressure: 0,
  buttons: 1,
};

describe('buildTouchMessage', () => {
  it('maps mouse down to scrcpy mouse pointer metadata', () => {
    const message = buildTouchMessage('down', mousePointer, fittedPortraitRect, portraitVideo);

    expect(message).toMatchObject({
      kind: 'touch',
      action: 'down',
      pointerId: -1,
      pressure: 1,
      actionButton: 1,
      buttons: 1,
    });
    expect(message?.x).toBeCloseTo(0.5);
    expect(message?.y).toBeCloseTo(0.5);
  });

  it('preserves mouse button state on move without setting actionButton', () => {
    const message = buildTouchMessage('move', { ...mousePointer, buttons: 1 }, fittedPortraitRect, portraitVideo);

    expect(message).toMatchObject({
      kind: 'touch',
      action: 'move',
      pointerId: -1,
      actionButton: 0,
      buttons: 1,
    });
  });

  it('clears pressure and buttons on mouse up', () => {
    const message = buildTouchMessage('up', { ...mousePointer, pressure: 0.7 }, fittedPortraitRect, portraitVideo);

    expect(message).toMatchObject({
      kind: 'touch',
      action: 'up',
      pointerId: -1,
      pressure: 0,
      actionButton: 1,
      buttons: 0,
    });
  });

  it('preserves touch pointer ids without mouse button metadata', () => {
    const message = buildTouchMessage(
      'down',
      { ...mousePointer, pointerType: 'touch', pointerId: 42, pressure: 0.25, buttons: 1 },
      fittedPortraitRect,
      portraitVideo,
    );

    expect(message).toMatchObject({
      kind: 'touch',
      action: 'down',
      pointerId: 42,
      pressure: 0.25,
      actionButton: 0,
      buttons: 0,
    });
  });

  it('clamps down events to the visible letterboxed bounds', () => {
    const message = buildTouchMessage(
      'down',
      { ...mousePointer, clientY: 25 },
      fittedPortraitRect,
      portraitVideo,
    );

    expect(message?.x).toBeCloseTo(0.5);
    expect(message?.y).toBe(0);
  });

  it('normalizes coordinates against the visible video area, not the canvas box', () => {
    const message = buildTouchMessage(
      'down',
      { ...mousePointer, clientX: 200, clientY: 150 },
      { left: 100, top: 50, width: 300, height: 400 },
      { width: 1000, height: 2000 },
    );

    expect(message?.x).toBeCloseTo(0.25);
    expect(message?.y).toBeCloseTo(0.25);
  });
});
