/** Orthogonal step helpers for battlefield move highlights. */

import type { Tile } from './maps';

export type Pos = { r: number; c: number };
export type MoveDir = 'n' | 's' | 'e' | 'w';

const BOARD = 5;

/** Orthogonal neighbors on the 5×5 field (in-bounds only). */
export function orthoNeighbors(r: number, c: number, size = BOARD): Pos[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < size && p.c >= 0 && p.c < size);
}

/** Cardinal direction from `from` to an adjacent `to`. */
export function stepDir(from: Pos, to: Pos): MoveDir {
  if (to.r < from.r) return 'n';
  if (to.r > from.r) return 's';
  if (to.c < from.c) return 'w';
  return 'e';
}

export type LegalEmptySteps = {
  empty: Set<string>;
  dirs: Map<string, MoveDir>;
};

/**
 * Empty orthogonal steps from (r,c): skips void and occupied cells.
 * Keys are `${row},${col}`.
 */
export function legalEmptySteps(
  r: number,
  c: number,
  tiles: Tile[][],
  occupied: (row: number, col: number) => boolean,
): LegalEmptySteps {
  const empty = new Set<string>();
  const dirs = new Map<string, MoveDir>();
  const from = { r, c };
  for (const p of orthoNeighbors(r, c)) {
    const tile = tiles[p.r]?.[p.c];
    if (!tile || tile.kind === 'void') continue;
    if (occupied(p.r, p.c)) continue;
    const key = `${p.r},${p.c}`;
    empty.add(key);
    dirs.set(key, stepDir(from, p));
  }
  return { empty, dirs };
}

/** Stable N→E→S→W order of distinct legal step directions. */
export function orderedLegalDirs(dirs: Map<string, MoveDir>): MoveDir[] {
  const present = new Set(dirs.values());
  return (['n', 'e', 's', 'w'] as MoveDir[]).filter((d) => present.has(d));
}
