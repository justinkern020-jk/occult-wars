import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GESTURE_SLOP, classifyGesture, clampScroll, momentumStep, releaseVelocity } from './handGesture';

describe('hand gestures: drag-deploy vs hand scroll', () => {
  it('a small wobble is still a tap (select / peek)', () => {
    expect(classifyGesture(3, -4, true)).toBe('wait');
    expect(classifyGesture(GESTURE_SLOP - 1, 0, true)).toBe('wait');
  });
  it('an upward or downward motion lifts the plate to muster', () => {
    expect(classifyGesture(0, -40, true)).toBe('drag');
    expect(classifyGesture(20, -40, true)).toBe('drag'); // up and a little sideways
    expect(classifyGesture(-30, -31, true)).toBe('drag');
    expect(classifyGesture(0, 30, true)).toBe('drag');
  });
  it('a sideways motion scrolls a hand that slides', () => {
    expect(classifyGesture(-40, 5, true)).toBe('scroll');
    expect(classifyGesture(25, -10, true)).toBe('scroll');
  });
  it('a hand that fits never scrolls: every motion is a drag', () => {
    expect(classifyGesture(-40, 5, false)).toBe('drag');
  });
  it('a flick keeps gliding and then settles', () => {
    const v = releaseVelocity([
      { t: 0, x: 300 },
      { t: 16, x: 280 },
      { t: 32, x: 250 },
      { t: 48, x: 210 },
    ]);
    expect(v).toBeLessThan(-1); // finger moving left fast
    let speed = -v;
    let travelled = 0;
    let frames = 0;
    while (speed && frames < 600) {
      const s = momentumStep(speed, 16);
      travelled += s.dx;
      speed = s.v;
      frames++;
    }
    expect(travelled).toBeGreaterThan(100);
    expect(frames).toBeLessThan(600);
  });
  it('a slow release does not glide', () => {
    expect(releaseVelocity([{ t: 0, x: 100 }])).toBe(0);
    expect(momentumStep(0.01, 16).v).toBe(0);
  });
  it('scroll stays inside the row', () => {
    expect(clampScroll(-20, 500)).toBe(0);
    expect(clampScroll(620, 500)).toBe(500);
    expect(clampScroll(10, -3)).toBe(0);
  });
});

describe('hand CSS keeps the muster drag safe on touch', () => {
  const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8') + readFileSync(new URL('../polish.css', import.meta.url), 'utf8');
  it('draggable plates switch the browser pan off, even in a hand that slides', () => {
    const rules = [...css.matchAll(/([^{}]*\.hand-card\.is-draggable[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, sel, body] of rules) {
      const ta = /touch-action:\s*([^;]+);/.exec(body!)?.[1]?.trim();
      if (ta) expect({ sel: sel!.trim(), ta }).toEqual({ sel: sel!.trim(), ta: 'none' });
    }
  });
  it('the slider rail takes its own touch', () => {
    expect(/\.hand-slider\s*\{[^}]*touch-action:\s*none/.test(css)).toBe(true);
  });
});
