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

import {
  HINT_POOLS,
  PLACE_WEIGHTS,
  pickWhisper,
  matchOverWhisper,
  markSecretFound,
  secretTier,
  whisperFor,
  type WhisperCtx,
} from './secretHints';

function seq(...xs: number[]) {
  let i = 0;
  return () => xs[i++ % xs.length]!;
}
const base: WhisperCtx = { hourOpen: false, found: new Set(), wins: 0, played: 0, turn: 0 };

describe('every secret whispers', () => {
  beforeEach(fakeStorage);

  it('has at least ten distinct lines per tier for every secret, never the codes themselves', () => {
    for (const [secret, tiers] of Object.entries(HINT_POOLS)) {
      expect(tiers).toHaveLength(3);
      for (const pool of tiers) {
        expect(new Set(pool).size).toBeGreaterThanOrEqual(10);
        for (const line of pool) {
          const l = line.toLowerCase();
          expect(l).not.toContain('athens ohio');
          expect(l).not.toContain('athens, ohio');
          expect(l).not.toContain('seth kern');
          expect(l).not.toContain('justin kern');
          expect(l).not.toContain('oppenheimer');
          if (secret !== 'second') expect(l).not.toContain('second hour');
        }
      }
    }
  });

  it('picks by the place weights, skipping found secrets', () => {
    const counts: Record<string, number> = {};
    let x = 0;
    const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 4000; i++) {
      const hit = pickWhisper('inspect', { ...base, turn: i }, () => 0);
      expect(hit).not.toBeNull();
      const h = pickWhisper('victory', { ...base, turn: i }, rnd);
      if (h) counts[h.secret] = (counts[h.secret] ?? 0) + 1;
    }
    const w = PLACE_WEIGHTS.victory;
    // Athens is heard more often than Justin.
    expect(w.athens).toBeGreaterThan(w.justin);
    expect(counts.athens!).toBeGreaterThan(counts.justin!);
    const found = new Set(['seth', 'justin', 'athens']);
    for (let i = 0; i < 50; i++) {
      const h = pickWhisper('menu', { ...base, found, turn: i }, seq(0, (i % 10) / 10));
      expect(h?.secret).toBe('second');
    }
    // Everything found and the hour open: nothing to whisper.
    expect(pickWhisper('menu', { ...base, hourOpen: true, found }, () => 0)).toBeNull();
  });

  it('the cryptids always speak of Athens; places keep their odds', () => {
    const found = new Set(['athens']);
    for (let i = 0; i < 20; i++) {
      expect(pickWhisper('cryptid', { ...base, found, turn: i }, seq(0, i / 20))?.secret).toBe('athens');
    }
    expect(pickWhisper('inspect', base, () => 0.5)).toBeNull();
  });

  it('tiers grow with matches played (Second Hour with First Hour wins)', () => {
    expect(secretTier('athens', { wins: 0, played: 0 })).toBe(1);
    expect(secretTier('athens', { wins: 0, played: 6 })).toBe(2);
    expect(secretTier('seth', { wins: 0, played: 20 })).toBe(3);
    expect(secretTier('second', { wins: 5, played: 0 })).toBe(3);
    const h = pickWhisper('defeat', { ...base, played: 25 }, seq(0, 0.99));
    expect(HINT_POOLS[h!.secret][2]).toContain(h!.text);
  });

  it('whisperFor and matchOverWhisper read this device', () => {
    for (const id of ['seth', 'justin', 'athens']) markSecretFound(id);
    writeHourOpen();
    expect(whisperFor('inspect')).toBeNull();
    expect(matchOverWhisper(true, true, () => 0)).toBeNull();
  });
});
