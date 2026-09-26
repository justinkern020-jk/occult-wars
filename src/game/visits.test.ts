import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cryptidPoolFor,
  pickCryptid,
  readVisitCount,
  recordMatchVisit,
  rollVisitTurn,
  setVisitsForNextSighting,
} from './visits';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  store.clear();
});

describe('recordMatchVisit', () => {
  it('returns true on every 15th visit', () => {
    for (let i = 1; i <= 14; i++) {
      expect(recordMatchVisit('first')).toBe(false);
    }
    expect(recordMatchVisit('first')).toBe(true);
    expect(readVisitCount('first')).toBe(15);
    expect(recordMatchVisit('first')).toBe(false);
  });

  it('tracks second-hour separately', () => {
    setVisitsForNextSighting('second');
    expect(recordMatchVisit('second')).toBe(true);
    expect(readVisitCount('first')).toBe(0);
  });
});

describe('cryptid pools', () => {
  it('locks cryptids out of First Hour', () => {
    expect(cryptidPoolFor('The Vril Syndicate', 'first')).toEqual([]);
    expect(pickCryptid('The Vril Syndicate', 'first', () => 0)).toBeNull();
  });

  it('picks second-hour society cryptids', () => {
    const pool = cryptidPoolFor('The Blackout Wardens', 'second');
    expect(pool.some((c) => c.id === 'blackout_hound' || c.id === 'roof_moth')).toBe(
      true,
    );
  });

  it('rolls visit turn 2 or 3', () => {
    expect(rollVisitTurn(() => 0)).toBe(2);
    expect(rollVisitTurn(() => 0.99)).toBe(3);
  });
});
