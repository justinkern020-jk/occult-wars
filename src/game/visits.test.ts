import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SIGHTING_EVERY,
  cryptidPoolFor,
  pickCryptid,
  readVisitCount,
  recordMatchVisit,
  rollVisitTurn,
  setVisitsForNextSighting,
} from './visits';

const store = new Map<string, string>();
const session = new Map<string, string>();

beforeEach(() => {
  store.clear();
  session.clear();
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
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (session.has(k) ? session.get(k)! : null),
      setItem: (k: string, v: string) => {
        session.set(k, String(v));
      },
      removeItem: (k: string) => {
        session.delete(k);
      },
      clear: () => session.clear(),
    },
  });
});

afterEach(() => {
  store.clear();
  session.clear();
});

describe('recordMatchVisit', () => {
  it(`returns true on every ${SIGHTING_EVERY}th visit`, () => {
    for (let i = 1; i <= SIGHTING_EVERY - 1; i++) {
      session.clear(); // simulate separate match boots
      expect(recordMatchVisit('first')).toBe(false);
    }
    session.clear();
    expect(recordMatchVisit('first')).toBe(true);
    expect(readVisitCount('first')).toBe(SIGHTING_EVERY);
    session.clear();
    expect(recordMatchVisit('first')).toBe(false);
  });

  it('does not double-count Strict Mode remounts', () => {
    expect(recordMatchVisit('first')).toBe(false);
    expect(recordMatchVisit('first')).toBe(false); // same gate window
    expect(readVisitCount('first')).toBe(1);
  });

  it('tracks second-hour separately', () => {
    setVisitsForNextSighting('second');
    expect(recordMatchVisit('second')).toBe(true);
    expect(readVisitCount('first')).toBe(0);
  });
});

describe('cryptid pools', () => {
  it('picks First Hour order cryptids for sightings', () => {
    const pool = cryptidPoolFor('The Vril Syndicate', 'first');
    expect(pool.some((c) => c.id === 'vril_wyrm' || c.id === 'foo_fighter')).toBe(
      true,
    );
    const card = pickCryptid('The Vril Syndicate', 'first', () => 0);
    expect(card?.keywords).toContain('cryptid');
  });

  it('keeps Second Hour beasts out of First Hour pools', () => {
    const first = cryptidPoolFor('The Vril Syndicate', 'first');
    expect(first.some((c) => c.id === 'blackout_hound')).toBe(false);
    const second = cryptidPoolFor('The Blackout Wardens', 'second');
    expect(second.some((c) => c.id === 'blackout_hound' || c.id === 'roof_moth')).toBe(
      true,
    );
  });

  it('rolls visit turn 2 or 3', () => {
    expect(rollVisitTurn(() => 0)).toBe(2);
    expect(rollVisitTurn(() => 0.99)).toBe(3);
  });
});
