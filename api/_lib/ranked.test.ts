import { describe, expect, it } from 'vitest';
import { memoryStore } from './store.js';
import { signUp } from './accounts.js';
import { MIN_SITTING_MS, PAIR_DAILY_CAP, WIN_PTS, beginSitting, rankFor, readBoard, readMine, reportSitting } from './ranked.js';

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
    expect(rankFor(250).label).toBe('Initiate I');
    expect(rankFor(300).label).toBe('Neophyte III');
    expect(rankFor(99999).label).toBe('Magus');
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
