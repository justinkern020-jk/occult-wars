import { describe, expect, it } from 'vitest';
import { memoryStore } from './store.js';
import { signUp } from './accounts.js';
import {
  DIV_PTS,
  LOSS_PTS,
  MAGUS_PTS,
  MIN_SITTING_MS,
  PAIR_DAILY_CAP,
  STREAK_BONUS,
  WIN_PTS,
  applyPoints,
  beginSitting,
  rankFor,
  readBoard,
  readMine,
  reportSitting,
} from './ranked.js';

async function two() {
  const store = memoryStore();
  const t0 = Date.UTC(2026, 9, 3, 12);
  const a = (await signUp(store, { email: 'a@x.io', password: 'password1', name: 'Ada' }, t0)).user;
  const b = (await signUp(store, { email: 'b@x.io', password: 'password1', name: 'Bram' }, t0)).user;
  return { store, a, b, t0 };
}

describe('ranked ladder', () => {
  it('names the grades with divisions, Magus on top', () => {
    expect(rankFor(0).label).toBe('Initiate III');
    expect(rankFor(DIV_PTS * 2 + 10).label).toBe('Initiate I');
    expect(rankFor(DIV_PTS * 3).label).toBe('Neophyte III');
    expect(rankFor(MAGUS_PTS - 1).label).toBe('Adeptus Exemptus I');
    expect(rankFor(MAGUS_PTS).label).toBe('Magus');
    expect(rankFor(99999).label).toBe('Magus');
  });

  it('pays a streak from the third straight win, and a loss keeps the division', () => {
    let r = { name: 'A', pts: 0, w: 0, l: 0, s: 0 };
    r = applyPoints(r, true);
    r = applyPoints(r, true);
    expect(r.pts).toBe(WIN_PTS * 2);
    r = applyPoints(r, true);
    expect(r.pts).toBe(WIN_PTS * 3 + STREAK_BONUS);
    expect(r.s).toBe(3);
    const before = r.pts;
    r = applyPoints(r, false);
    expect(r.s).toBe(0);
    expect(r.pts).toBe(Math.max(Math.floor(before / DIV_PTS) * DIV_PTS, before - LOSS_PTS));
    // At a division's floor, a loss costs nothing.
    const floor = applyPoints({ name: 'B', pts: DIV_PTS * 4, w: 0, l: 0, s: 0 }, false);
    expect(floor.pts).toBe(DIV_PTS * 4);
  });

  it('reaches Magus in about 100 sittings at an even win rate', () => {
    // Deterministic pseudo-random coin, many seasons: the median sits near 100.
    let seed = 1893;
    const coin = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) < 0.5;
    const runs: number[] = [];
    for (let k = 0; k < 400; k++) {
      let r = { name: 'C', pts: 0, w: 0, l: 0, s: 0 };
      let n = 0;
      while (r.pts < MAGUS_PTS && n < 1000) {
        r = applyPoints(r, coin());
        n++;
      }
      runs.push(n);
    }
    runs.sort((a, b) => a - b);
    const median = runs[runs.length >> 1];
    expect(median).toBeGreaterThan(80);
    expect(median).toBeLessThan(120);
  });

  it('settles only when both hands agree, after a believable sitting', async () => {
    const { store, a, b, t0 } = await two();
    await beginSitting(store, a, 'room0nonce1', t0);
    await beginSitting(store, b, 'room0nonce1', t0 + 1000);
    const t = t0 + MIN_SITTING_MS + 5000;
    const first = await reportSitting(store, a, { nonce: 'room0nonce1', sitting: 0, won: true }, t);
    expect(first.waiting).toBe(true);
    const second = await reportSitting(store, b, { nonce: 'room0nonce1', sitting: 0, won: false }, t + 200);
    expect(second.settled).toBe(true);
    expect((await readMine(store, a, t)).pts).toBe(WIN_PTS);
    expect((await readMine(store, b, t)).pts).toBe(0);
    const board = await readBoard(store, t);
    expect(board.rows[0].name).toBe('Ada');
    // A repeat report changes nothing.
    await reportSitting(store, b, { nonce: 'room0nonce1', sitting: 0, won: false }, t + 300);
    expect((await readMine(store, a, t)).pts).toBe(WIN_PTS);
  });

  it('refuses disputes, quick sittings, strangers and a third chair', async () => {
    const { store, a, b, t0 } = await two();
    await beginSitting(store, a, 'room0nonce2', t0);
    await beginSitting(store, b, 'room0nonce2', t0);
    await reportSitting(store, a, { nonce: 'room0nonce2', sitting: 0, won: true }, t0 + 1000);
    const quick = await reportSitting(store, b, { nonce: 'room0nonce2', sitting: 0, won: false }, t0 + 2000);
    expect(quick.settled).toBe(false);
    const t = t0 + MIN_SITTING_MS * 2;
    await reportSitting(store, a, { nonce: 'room0nonce2', sitting: 1, won: true }, t);
    const both = await reportSitting(store, b, { nonce: 'room0nonce2', sitting: 1, won: true }, t);
    expect(both.reason).toBe('disputed');
    const c = (await signUp(store, { email: 'c@x.io', password: 'password1', name: 'Cy' }, t0)).user;
    await expect(reportSitting(store, c, { nonce: 'room0nonce2', sitting: 2, won: true }, t)).rejects.toThrow();
    await expect(beginSitting(store, c, 'room0nonce2', t)).rejects.toThrow();
  });

  it('caps one pair per day', async () => {
    const { store, a, b, t0 } = await two();
    await beginSitting(store, a, 'room0nonce3', t0);
    await beginSitting(store, b, 'room0nonce3', t0);
    let t = t0;
    for (let i = 0; i < PAIR_DAILY_CAP + 2; i++) {
      t += MIN_SITTING_MS + 1000;
      await reportSitting(store, a, { nonce: 'room0nonce3', sitting: i, won: true }, t);
      await reportSitting(store, b, { nonce: 'room0nonce3', sitting: i, won: false }, t);
    }
    expect((await readMine(store, a, t)).w).toBe(PAIR_DAILY_CAP);
  });
});
