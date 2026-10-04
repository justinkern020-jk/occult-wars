import { describe, expect, it } from 'vitest';
import { placeCandles } from './MenuAtmosphere';

type Box = { l: number; t: number; r: number; b: number };
const overlaps = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
/** What a candle actually covers: wax, wick and flame. */
const candleBox = (c: { x: number; y: number; h: number }): Box => ({ l: c.x - 8, r: c.x + 8, t: c.y - c.h - 26, b: c.y });
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('placeCandles', () => {
  // A desktop hero: title, lede, plate and buttons in the left/middle; the right side is painted art.
  const desktop: Box[] = [
    { l: 14, t: 30, r: 160, b: 100 },
    { l: 14, t: 100, r: 360, b: 160 },
    { l: 14, t: 160, r: 470, b: 210 },
    { l: 360, t: 200, r: 540, b: 300 },
    { l: 14, t: 360, r: 460, b: 600 },
    { l: 14, t: 590, r: 880, b: 1600 },
  ];

  it('never sets a candle over a control or a line of text, and stays inside the frame', () => {
    const cs = placeCandles(900, 1650, 860, desktop, 6, rand);
    expect(cs.length).toBeGreaterThanOrEqual(4);
    expect(cs.length).toBeLessThanOrEqual(6);
    for (const c of cs) {
      const b = candleBox(c);
      for (const o of desktop) expect(overlaps(b, o)).toBe(false);
      expect(b.l).toBeGreaterThanOrEqual(0);
      expect(b.r).toBeLessThanOrEqual(900);
      expect(b.t).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps candles on the first screen when there is room, spread apart', () => {
    const cs = placeCandles(900, 1650, 860, desktop, 6, rand);
    for (const c of cs) expect(c.y).toBeLessThanOrEqual(860);
    const xs = cs.map((c) => c.x);
    const ys = cs.map((c) => c.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(150);
    expect(Math.max(...xs)).toBeGreaterThan(600);
  });

  it('respects the cap (4 on phones)', () => {
    expect(placeCandles(356, 2200, 820, [], 4, rand).length).toBeLessThanOrEqual(4);
  });

  it('falls back to the lower edge when the first screen is full', () => {
    const full: Box[] = [{ l: 0, t: 0, r: 356, b: 2000 }];
    const cs = placeCandles(356, 2200, 820, full, 4, rand);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.y).toBe(2188);
      for (const o of full) expect(overlaps(candleBox(c), o)).toBe(false);
    }
  });
});
