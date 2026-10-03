import { beforeEach, describe, expect, it } from 'vitest';
import {
  declineSeatInvite,
  markSeatOffered,
  markSeated,
  noteSeatMatch,
  readSeatInvite,
  shouldOfferSeat,
} from './seatInvite';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

/** Play n matches; return the match numbers on which the invite was offered. */
function play(n: number, declineOn: number[] = []): number[] {
  const offered: number[] = [];
  for (let i = 1; i <= n; i++) {
    const s = noteSeatMatch();
    if (shouldOfferSeat(s)) {
      markSeatOffered();
      offered.push(i);
      if (declineOn.includes(i)) declineSeatInvite();
    }
  }
  return offered;
}

describe('the Take a seat invitation', () => {
  it('is offered after the first finished match, then every 5th', () => {
    expect(play(16)).toEqual([1, 6, 11, 16]);
  });

  it('never before a match has finished', () => {
    expect(shouldOfferSeat(readSeatInvite())).toBe(false);
  });

  it('stops after "Not now" twice', () => {
    expect(play(30, [1, 6])).toEqual([1, 6]);
    expect(readSeatInvite().declined).toBe(2);
  });

  it('one "Not now" only waits for the next round', () => {
    expect(play(11, [1])).toEqual([1, 6, 11]);
  });

  it('never returns once an account has sat on this device', () => {
    play(1);
    markSeated();
    expect(play(20)).toEqual([]);
  });

  it('a garbled store reads as fresh', () => {
    store.set('occult-wars-seat-invite', '{nope');
    expect(readSeatInvite()).toEqual({ matches: 0, declined: 0, lastOfferedAt: 0, seated: false });
  });
});
