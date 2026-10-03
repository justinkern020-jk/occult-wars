import { describe, expect, it } from 'vitest';
import { diffBoards, guestSounds, newOnPile, type FxBoard, type FxUnit } from './boardFx';
import type { Card } from './types';

const u = (uid: string, side: 'blue' | 'red', power: number, extra: Partial<FxUnit> = {}): FxUnit => ({
  uid,
  cardId: 'x',
  name: uid,
  side,
  power,
  keywords: [],
  ...extra,
});
const empty = (): FxBoard => Array.from({ length: 3 }, () => [null, null, null]);

describe('boardFx', () => {
  it('reads a step as a move', () => {
    const a = empty();
    const b = empty();
    a[0][0] = u('a', 'blue', 3);
    b[0][1] = u('a', 'blue', 3);
    const d = diffBoards(a, b);
    expect(d.moves).toHaveLength(1);
    expect(guestSounds(d, [])).toEqual(['move']);
  });

  it('reads a melee strike with a death as a clash', () => {
    const a = empty();
    const b = empty();
    a[0][0] = u('a', 'blue', 3);
    a[0][1] = u('b', 'red', 2);
    b[0][0] = u('a', 'blue', 3, { attacked: true });
    const d = diffBoards(a, b);
    expect(d.deaths.map((x) => x.unit.uid)).toEqual(['b']);
    expect(guestSounds(d, [])).toEqual(['clash']);
  });

  it('reads a ranged shot at distance as a gunshot, with wounds and gains', () => {
    const a = empty();
    const b = empty();
    a[0][0] = u('a', 'blue', 3, { keywords: ['ranged'] });
    a[2][2] = u('b', 'red', 5);
    a[1][1] = u('c', 'blue', 1);
    b[0][0] = u('a', 'blue', 3, { keywords: ['ranged'], attacked: true });
    b[2][2] = u('b', 'red', 2);
    b[1][1] = u('c', 'blue', 2);
    const d = diffBoards(a, b);
    expect(d.wounds[0].amount).toBe(3);
    expect(d.gains[0].amount).toBe(1);
    expect(guestSounds(d, [])).toEqual(['gunshot']);
  });

  it('a called power is heard', () => {
    const a = empty();
    const b = empty();
    a[1][1] = u('a', 'blue', 3);
    b[1][1] = u('a', 'blue', 4, { used: true });
    const d = diffBoards(a, b);
    expect(d.calls).toHaveLength(1);
    expect(guestSounds(d, [])).toEqual(['power']);
  });

  it('a rite reaching the pile is a cast', () => {
    const rite = { id: 'r', kind: 'rite', keywords: [] } as unknown as Card;
    const gas = { id: 'g', kind: 'rite', keywords: ['gas'] } as unknown as Card;
    expect(newOnPile([], [rite])).toEqual([rite]);
    expect(guestSounds(diffBoards(empty(), empty()), [rite])).toEqual(['cast']);
    expect(guestSounds(diffBoards(empty(), empty()), [gas])).toEqual(['gas']);
  });
});
