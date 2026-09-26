/** Board ownership / conquer paint (ported from occultwar.grok.me). */

import type { Side, Tile } from './maps';
import type { ControlGrid } from './scoring';

export type { ControlGrid };

/** Initial paint: tile.home (gates + strongholds) claimed for that side. */
export function initialControl(tiles: Tile[][]): ControlGrid {
  return tiles.map((row) => row.map((t) => t.home ?? null));
}

export function emptyControl(): ControlGrid {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
}

/** Street, gate, and resource tiles can be painted by stepping. */
export function isPaintable(tile: Tile | null | undefined): boolean {
  if (!tile) return false;
  return (
    tile.kind === 'street' || tile.kind === 'gate' || tile.kind === 'resource'
  );
}

export function isEnemyStronghold(tile: Tile, side: Side): boolean {
  return tile.kind === 'stronghold' && !!tile.home && tile.home !== side;
}

/**
 * Claim a paintable tile for `side`. Returns a new control grid.
 * Strongholds are not painted this way (storm ends the match instead).
 */
export function paintTile(
  control: ControlGrid,
  tiles: Tile[][],
  r: number,
  c: number,
  side: Side,
): ControlGrid {
  const tile = tiles[r]?.[c];
  if (!isPaintable(tile)) return control;
  const next = control.map((row) => [...row]);
  next[r][c] = side;
  return next;
}

/** Deploy on own stronghold, or a gate this side currently holds. */
export function canDeployOn(
  tile: Tile,
  control: ControlGrid,
  r: number,
  c: number,
  side: Side,
): boolean {
  if (tile.kind === 'void') return false;
  if (tile.kind === 'stronghold') return tile.home === side;
  if (tile.kind === 'gate') return control[r][c] === side;
  return false;
}
