/** Domination / loyalty bank formulas (ported from occultwar.grok.me). */

import type { Side, Tile } from './maps';

export const DOMINATION_WIN = 60;
export const LOYALTY_CAP = 14;
export const HAND_CAP = 7;

export type VictoryKind = 'dominance' | 'stronghold' | 'yield';

export type ControlGrid = (Side | null)[][];

/** Circles held for end-of-rite domination (stronghold home + painted tiles). */
export function countHoldings(
  tiles: Tile[][],
  control: ControlGrid,
  side: Side,
): number {
  let n = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const tile = tiles[r][c];
      if (tile.kind === 'void') continue;
      if (tile.kind === 'stronghold') {
        if (tile.home === side) n += 1;
        continue;
      }
      if (control[r][c] === side) n += 1;
    }
  }
  return n;
}

export type BankUnit = {
  side: Side;
  keywords: string[];
  r: number;
  c: number;
};

/**
 * Loyalty banked at rite open from holdings.
 * Stronghold home +2; each controlled resource +symbols (1 or 2);
 * hearth keyword on a unit standing on a resource doubles that node;
 * tithe / tithe2 on standing units +1 / +2.
 */
export function bankFromHoldings(
  tiles: Tile[][],
  control: ControlGrid,
  side: Side,
  units: BankUnit[] = [],
): number {
  let n = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const tile = tiles[r][c];
      if (tile.kind === 'stronghold' && tile.home === side) n += 2;
      if (tile.kind === 'resource' && control[r][c] === side) {
        let seals = tile.symbols ?? 1;
        const here = units.find((u) => u.r === r && u.c === c && u.side === side);
        if (here?.keywords.includes('hearth')) seals *= 2;
        n += seals;
      }
    }
  }
  for (const u of units) {
    if (u.side !== side) continue;
    if (u.keywords.includes('tithe')) n += 1;
    if (u.keywords.includes('tithe2')) n += 2;
  }
  return n;
}

export function applyBank(current: number, gain: number): number {
  return Math.min(LOYALTY_CAP, current + gain);
}

export function victoryHeadline(kind: VictoryKind, won: boolean): string {
  if (won) {
    if (kind === 'stronghold') return 'Victory';
    if (kind === 'yield') return 'Victory';
    return 'Victory';
  }
  return 'Defeat';
}

export function victoryReason(kind: VictoryKind, won: boolean): string {
  if (won) {
    if (kind === 'stronghold') return 'Victory by storming the stronghold';
    if (kind === 'yield') return 'Victory by yield';
    return 'Victory by dominance';
  }
  if (kind === 'stronghold') return 'Defeat. Your stronghold was stormed.';
  if (kind === 'yield') return 'Defeat by yield.';
  return 'Defeat by dominance.';
}

export function sideLabel(side: Side): string {
  return side === 'blue' ? 'Azure' : 'Crimson';
}
