import { describe, expect, it } from 'vitest';
import {
  normalizeRoomCode,
  peerIdForQuickSlot,
  peerIdForRoom,
  parseFriendMessage,
  quickRoomLabel,
  QUICK_SLOT_COUNT,
  randomRoomCode,
} from './friendSession';

describe('normalizeRoomCode', () => {
  it('uppercases and strips junk', () => {
    expect(normalizeRoomCode('ab-12cd')).toBe('ABCD');
    expect(normalizeRoomCode('  wxy z ')).toBe('WXYZ');
  });
  it('rejects short codes', () => {
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });
  it('trims to 4 letters', () => {
    expect(normalizeRoomCode('ABCDEF')).toBe('ABCD');
  });
});

describe('peerIdForRoom', () => {
  it('prefixes ow-', () => {
    expect(peerIdForRoom('WXYZ')).toBe('ow-WXYZ');
  });
  it('throws on bad room', () => {
    expect(() => peerIdForRoom('AB')).toThrow();
  });
});

describe('quick match slots', () => {
  it('builds ow-q-N ids', () => {
    expect(peerIdForQuickSlot(0)).toBe('ow-q-0');
    expect(peerIdForQuickSlot(31)).toBe('ow-q-31');
    expect(QUICK_SLOT_COUNT).toBe(32);
  });
  it('rejects out of range', () => {
    expect(() => peerIdForQuickSlot(-1)).toThrow();
    expect(() => peerIdForQuickSlot(32)).toThrow();
  });
  it('labels rooms', () => {
    expect(quickRoomLabel(3)).toBe('Q03');
  });
});

describe('randomRoomCode', () => {
  it('returns 4 uppercase letters without I/O', () => {
    for (let i = 0; i < 20; i++) {
      const r = randomRoomCode();
      expect(r).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
      expect(r).not.toMatch(/[IO]/);
    }
  });
});

describe('parseFriendMessage', () => {
  it('accepts v1 typed messages', () => {
    expect(parseFriendMessage({ v: 1, type: 'ping' })).toEqual({
      v: 1,
      type: 'ping',
    });
    expect(
      parseFriendMessage({ v: 1, type: 'hello', role: 'host', room: 'ABCD' }),
    ).toMatchObject({ type: 'hello', role: 'host' });
  });
  it('rejects junk', () => {
    expect(parseFriendMessage(null)).toBeNull();
    expect(parseFriendMessage({ v: 2, type: 'ping' })).toBeNull();
    expect(parseFriendMessage({ v: 1, type: 'nope' })).toBeNull();
  });
  it('accepts loadout messages with cards array', () => {
    expect(
      parseFriendMessage({
        v: 1,
        type: 'loadout',
        heroId: 'the_rune_colonel',
        cards: ['coil_novice'],
        faction: 'The Vril Syndicate',
      }),
    ).toMatchObject({ type: 'loadout', heroId: 'the_rune_colonel' });
  });
  it('rejects loadout without cards array', () => {
    expect(
      parseFriendMessage({ v: 1, type: 'loadout', heroId: 'x' }),
    ).toBeNull();
  });

});
