/**
 * Training Rite AI heuristics (simplified port of grok Ut()).
 * Operates on a snapshot; returns one action for the current side.
 */

import type { Side, Tile } from './maps';
import type { Card } from './types';
import type { ControlGrid } from './scoring';
import { canDeployOn, isEnemyStronghold, isPaintable } from './control';
import { canBeStruck, hasKeyword, manhattan, rangedReach } from './keywords';

export type AiUnit = {
  uid: string;
  side: Side;
  power: number;
  keywords: string[];
  moved: boolean;
  attacked: boolean;
  r: number;
  c: number;
};

export type AiSnapshot = {
  side: Side;
  tiles: Tile[][];
  control: ControlGrid;
  board: (AiUnit | null)[][];
  hand: Card[];
  loyalty: number;
};

export type AiAction =
  | { type: 'deploy'; index: number; r: number; c: number }
  | { type: 'move'; uid: string; r: number; c: number }
  | { type: 'attack'; uid: string; targetUid: string }
  | { type: 'end' };

function neighbors(r: number, c: number): { r: number; c: number }[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < 5 && p.c >= 0 && p.c < 5);
}

function deployScore(tile: Tile): number {
  if (tile.kind === 'stronghold') return 2;
  if (tile.kind === 'gate') return 6;
  if (tile.kind === 'resource') return 8 + (tile.symbols === 2 ? 6 : 0);
  return 0;
}

function moveScore(
  snap: AiSnapshot,
  unit: AiUnit,
  r: number,
  c: number,
): number {
  const tile = snap.tiles[r][c];
  const occ = snap.board[r][c];
  if (occ && occ.side !== unit.side) {
    return attackScore(unit, occ) - (unit.keywords.includes('ranged') ? 30 : 0);
  }
  let score = 0;
  if (snap.control[r][c] !== unit.side) {
    if (tile.kind === 'resource') score += tile.symbols === 2 ? 16 : 9;
    else if (tile.kind === 'gate') score += 8;
    else if (tile.kind === 'street') score += 4;
  }
  if (isEnemyStronghold(tile, unit.side)) score += 100;
  return score;
}

function attackScore(attacker: AiUnit, defender: AiUnit): number {
  if (hasKeyword(defender, 'veiled')) return -999;
  let score = 1 + defender.power;
  if (attacker.power >= defender.power) score += 40;
  else score += attacker.power * 3;
  if (
    attacker.power < defender.power &&
    defender.power >= attacker.power
  ) {
    score -= 25;
  }
  return score;
}

function listUnits(snap: AiSnapshot, side: Side): AiUnit[] {
  const out: AiUnit[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = snap.board[r][c];
      if (u && u.side === side) out.push(u);
    }
  return out;
}

function deploySpots(snap: AiSnapshot, side: Side): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const tile = snap.tiles[r][c];
      if (snap.board[r][c]) continue;
      if (canDeployOn(tile, snap.control, r, c, side)) out.push({ r, c });
    }
  return out;
}

function unitValue(card: Card): number {
  const p = card.power ?? 0;
  let v = p * 2 + card.cost;
  if (card.keywords.includes('fast')) v += 2;
  if (card.keywords.includes('ranged')) v += 2;
  if (card.keywords.includes('tough')) v += 2;
  return v;
}

/** Pick one heuristic action for the current side. */
export function pickTrainingAction(snap: AiSnapshot): AiAction {
  const side = snap.side;

  // 1. Deploy best affordable unit to best spot
  const playable = snap.hand
    .map((card, index) => ({ card, index }))
    .filter(
      ({ card }) =>
        card.kind === 'unit' &&
        card.power != null &&
        card.cost <= snap.loyalty,
    )
    .sort(
      (a, b) =>
        unitValue(b.card) - unitValue(a.card) || a.card.cost - b.card.cost,
    );
  const spots = deploySpots(snap, side);
  if (playable.length > 0 && spots.length > 0) {
    spots.sort(
      (a, b) =>
        deployScore(snap.tiles[b.r][b.c]) - deployScore(snap.tiles[a.r][a.c]),
    );
    const dest = spots[0];
    return {
      type: 'deploy',
      index: playable[0].index,
      r: dest.r,
      c: dest.c,
    };
  }

  // 2. Prefer moves that claim unowned tiles / storm stronghold
  let bestMove: { uid: string; r: number; c: number; score: number } | null =
    null;
  for (const unit of listUnits(snap, side)) {
    if (unit.moved || unit.attacked) continue;
    for (const p of neighbors(unit.r, unit.c)) {
      const tile = snap.tiles[p.r][p.c];
      if (tile.kind === 'void') continue;
      const occ = snap.board[p.r][p.c];
      if (occ && occ.side === side) continue;
      // Prefer claim moves (empty paintable not ours, or enemy stronghold)
      const claiming =
        (!occ &&
          isPaintable(tile) &&
          snap.control[p.r][p.c] !== side) ||
        isEnemyStronghold(tile, side);
      if (!claiming && occ == null) continue;
      if (occ && occ.side !== side) continue; // attacks handled below
      const score = moveScore(snap, unit, p.r, p.c);
      if (!bestMove || score > bestMove.score) {
        bestMove = { uid: unit.uid, r: p.r, c: p.c, score };
      }
    }
  }
  if (bestMove && bestMove.score > 0) {
    return {
      type: 'move',
      uid: bestMove.uid,
      r: bestMove.r,
      c: bestMove.c,
    };
  }

  // 3. Best attack (melee + ranged; skip veiled / shuttered-at-range)
  let bestAtk: {
    uid: string;
    targetUid: string;
    score: number;
  } | null = null;
  for (const unit of listUnits(snap, side)) {
    if (unit.moved || unit.attacked) continue;
    const reach = rangedReach(unit);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const foe = snap.board[r][c];
        if (!foe || foe.side === side) continue;
        const dist = manhattan(unit.r, unit.c, r, c);
        if (!canBeStruck(unit, foe, dist)) continue;
        const score = attackScore(unit, foe) + (dist > 1 ? 5 : 0);
        if (!bestAtk || score > bestAtk.score) {
          bestAtk = { uid: unit.uid, targetUid: foe.uid, score };
        }
      }
    }
    void reach;
  }
  if (bestAtk && bestAtk.score > 0) {
    return {
      type: 'attack',
      uid: bestAtk.uid,
      targetUid: bestAtk.targetUid,
    };
  }

  // 4. Any forward move
  let anyMove: { uid: string; r: number; c: number; score: number } | null =
    null;
  for (const unit of listUnits(snap, side)) {
    if (unit.moved || unit.attacked) continue;
    for (const p of neighbors(unit.r, unit.c)) {
      const tile = snap.tiles[p.r][p.c];
      if (tile.kind === 'void') continue;
      if (snap.board[p.r][p.c]) continue;
      const score = moveScore(snap, unit, p.r, p.c);
      if (!anyMove || score > anyMove.score) {
        anyMove = { uid: unit.uid, r: p.r, c: p.c, score };
      }
    }
  }
  if (anyMove && anyMove.score > 0) {
    return { type: 'move', uid: anyMove.uid, r: anyMove.r, c: anyMove.c };
  }

  return { type: 'end' };
}
