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

/**
 * Deploy on own stronghold, or a gate this side currently holds.
 * Streets and resource nodes are never muster spots — paint alone does not unlock them.
 *
 * `ashLock`: after Justin Kern's gadget, the burned chair (the foe) may only
 * muster on its own home stronghold / home gates until the lock clears. Pass
 * null/undefined for ordinary play.
 */
export function canDeployOn(
  tile: Tile,
  control: ControlGrid,
  r: number,
  c: number,
  side: Side,
  ashLock?: Side | null,
): boolean {
  if (!tile || tile.kind === 'void') return false;
  // Hard reject: painted streets/resources are never legal muster circles.
  if (tile.kind === 'street' || tile.kind === 'resource') return false;

  if (ashLock === side) {
    // Burned chair: only own doors, not conquered mid-board gates.
    if (tile.kind === 'stronghold' || tile.kind === 'gate') return tile.home === side;
    return false;
  }

  if (tile.kind === 'stronghold') return tile.home === side;
  if (tile.kind === 'gate') return control[r]?.[c] === side;
  return false;
}
