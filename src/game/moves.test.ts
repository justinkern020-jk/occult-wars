import { describe, expect, it } from 'vitest';
import { mapById } from './maps';
import {
  legalEmptySteps,
  orderedLegalDirs,
  orthoNeighbors,
  stepDir,
  type MoveDir,
} from './moves';

describe('orthoNeighbors + stepDir', () => {
  it('lists four dirs in the middle and assigns N/E/S/W', () => {
    const n = orthoNeighbors(2, 2);
    expect(n).toHaveLength(4);
    expect(stepDir({ r: 2, c: 2 }, { r: 1, c: 2 })).toBe('n');
    expect(stepDir({ r: 2, c: 2 }, { r: 2, c: 3 })).toBe('e');
    expect(stepDir({ r: 2, c: 2 }, { r: 3, c: 2 })).toBe('s');
    expect(stepDir({ r: 2, c: 2 }, { r: 2, c: 1 })).toBe('w');
  });
});

describe('legalEmptySteps — all four directions equal', () => {
  const free = () => false;

  it('includes every empty non-void ortho (N/E/S/W) when all are walkable', () => {
    const map = mapById('leaden-court');
    // Center street (2,2): N/E/S/W are all non-void
    expect(map.tiles[2][2].kind).toBe('street');
    for (const [r, c] of [
      [1, 2],
      [2, 3],
      [3, 2],
      [2, 1],
    ] as const) {
      expect(map.tiles[r][c].kind).not.toBe('void');
    }

    const { empty, dirs } = legalEmptySteps(2, 2, map.tiles, free);
    expect(empty.has('1,2')).toBe(true);
    expect(empty.has('2,3')).toBe(true);
    expect(empty.has('3,2')).toBe(true);
    expect(empty.has('2,1')).toBe(true);
    expect(dirs.get('1,2')).toBe('n');
    expect(dirs.get('2,3')).toBe('e');
    expect(dirs.get('3,2')).toBe('s');
    expect(dirs.get('2,1')).toBe('w');
    expect(orderedLegalDirs(dirs)).toEqual(['n', 'e', 's', 'w']);
  });

  it('does not drop east when east is an empty walkable tile', () => {
    const map = mapById('leaden-court');
    // row3 s1s1s — (3,2) street, east (3,3) resource (still walkable)
    expect(map.tiles[3][2].kind).toBe('street');
    expect(map.tiles[3][3].kind).not.toBe('void');

    const { empty, dirs } = legalEmptySteps(3, 2, map.tiles, free);
    expect(empty.has('3,3')).toBe(true);
    expect(dirs.get('3,3')).toBe('e');
    expect(orderedLegalDirs(dirs)).toContain('e');
  });

  it('skips void neighbors so fake gold-ring voids are never legal', () => {
    const map = mapById('ashen-cross');
    // (3,3) street: east (3,4) is void corner
    expect(map.tiles[3][3].kind).toBe('street');
    expect(map.tiles[3][4].kind).toBe('void');

    const { empty, dirs } = legalEmptySteps(3, 3, map.tiles, free);
    expect(empty.has('3,4')).toBe(false);
    expect(dirs.has('3,4')).toBe(false);
    expect(orderedLegalDirs(dirs).includes('e')).toBe(false);
    // N + W still counted (walkable)
    expect(empty.has('2,3')).toBe(true);
    expect(dirs.get('2,3')).toBe('n');
    expect(empty.has('3,2')).toBe(true);
    expect(dirs.get('3,2')).toBe('w');
  });

  it('skips occupied ortho tiles in every direction equally', () => {
    const map = mapById('leaden-court');
    const blocked = new Set(['1,2', '2,3', '3,2', '2,1']);
    const { empty, dirs } = legalEmptySteps(2, 2, map.tiles, (r, c) =>
      blocked.has(`${r},${c}`),
    );
    expect(empty.size).toBe(0);
    expect(dirs.size).toBe(0);
  });

  it('orderedLegalDirs is N→E→S→W regardless of Map insertion', () => {
    const dirs = new Map<string, MoveDir>([
      ['3,2', 's'],
      ['2,1', 'w'],
      ['1,2', 'n'],
      ['2,3', 'e'],
    ]);
    expect(orderedLegalDirs(dirs)).toEqual(['n', 'e', 's', 'w']);
  });
});
