import { beforeEach, describe, expect, it } from 'vitest';
import {
  noteFirstHourWin,
  readFirstHourWins,
  secondHourHint,
  secondHourTier,
  SECOND_HOUR_TIER1,
  SECOND_HOUR_TIER2,
  SECOND_HOUR_TIER3,
} from './secretHints';
import { writeHourOpen } from './hourUnlock';
import { shardGainFor } from './fortune';

function fakeStorage() {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('Second Hour hints', () => {
  beforeEach(fakeStorage);

  it('has ten distinct clues per tier, none spelling the code in quotes', () => {
    for (const pool of [SECOND_HOUR_TIER1, SECOND_HOUR_TIER2, SECOND_HOUR_TIER3]) {
      expect(new Set(pool).size).toBe(10);
      for (const h of pool) expect(h).not.toMatch(/["']the second hour["']/i);
    }
  });

  it('escalates: wins 1–2 vague, 3–4 names, 5+ near-plain', () => {
    expect([1, 2, 3, 4, 5, 9].map(secondHourTier)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(SECOND_HOUR_TIER1).toContain(secondHourHint(1));
    expect(SECOND_HOUR_TIER2).toContain(secondHourHint(3));
    expect(SECOND_HOUR_TIER3).toContain(secondHourHint(5));
    expect(secondHourHint(5)).not.toBe(secondHourHint(6));
  });

  it('counts wins and stops once the hour is open', () => {
    expect(noteFirstHourWin()).toBeTruthy();
    expect(noteFirstHourWin()).toBeTruthy();
    expect(readFirstHourWins()).toBe(2);
    writeHourOpen();
    expect(noteFirstHourWin()).toBeNull();
  });
});

describe('fortune', () => {
  it('pays from the same table as the profile', () => {
    expect(shardGainFor('training', true)).toBe(50);
    expect(shardGainFor('training', false)).toBe(15);
    expect(shardGainFor('second', true)).toBe(50);
    expect(shardGainFor('friend', true)).toBe(100);
    expect(shardGainFor('old', false)).toBe(15);
    expect(shardGainFor('hotseat', true)).toBe(0);
  });
});
