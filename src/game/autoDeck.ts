/**
 * "Strongest deck": build the best legal working from what a player owns.
 *
 * Scoring borrows the rival mind's own valuation (`unitWorth`, the Expert's
 * worth of a unit on the field) and weighs rites by what the Expert gets from
 * them in play, per Resource spent. A light curve and unit floor keep the list
 * playable; head-to-head sims against the starter working tuned the weights.
 */
import { CARDS, cardById, isExcludedPlateId, isLossInjectId } from '../data/catalog';
import { pickAiAction, resetAiPlan, snapshotFromState, unitWorth } from './ai';
import { newMatch, playMatch, seededRand } from './engine';
import { MAPS, mapsForEra, type Side } from './maps';
import { buildOrderAllyWorkingIds, cardsFromIds, shuffleInPlace } from './deck';
import { isLegalForOrder, isSealedCenturyOrder, isSecondHourSociety } from './orders';
import type { Card } from './types';

export const AUTO_SIZE = 30;
/** Knobs tuned by head-to-head sims (scripts/sim-autodeck.ts). */
export const AUTO_TUNING = {
  /** Hold the field: at least this many units. */
  minUnits: 18,
  /** Cheap plates (cost ≤ 2) so the first rites are not empty. */
  minCheap: 8,
  /** Added to cost when dividing worth by price (higher = favors big plates). */
  costPad: 1.5,
  /** Scale on rite / device worth. */
  riteScale: 1.4,
};

const RITE_WORTH: Record<string, (n: number) => number> = {
  smite: (n) => 8 * n + 8,
  smite_all: (n) => 14 + 8 * n,
  destroy: () => 34,
  destroy_refund: () => 38,
  set_power: () => 20,
  lock: () => 16,
  bounce: () => 18,
  trepan: () => 18,
  leech: () => 16,
  empower: (n) => 6 * n + 5,
  empower_all: (n) => 12 + 6 * n,
  draw: (n) => 10 * n,
  bank: (n) => 7 * n,
  bank_draw: () => 15,
  shove: () => 9,
  snuff_guns: () => 12,
  sacrifice_splash: () => 14,
  sacrifice_bank: () => 10,
  field_poison: () => 14,
  no_bank: () => 12,
};

/** What a plate is worth in a working, per Resource it costs. */
export function plateScore(c: Card): number {
  let worth: number;
  if (c.kind === 'unit') {
    worth = unitWorth({ power: c.power ?? 0, keywords: c.keywords });
    if (c.death) worth += 4 * c.death;
    if (c.deathBank) worth += 3 * c.deathBank;
    if (c.alsoDraw) worth += 8 * c.alsoDraw;
    if (c.alsoBank) worth += 5 * c.alsoBank;
    if (c.act) worth += 8;
  } else {
    const op = c.effect?.op ?? c.act?.op ?? '';
    const n = c.effect?.n ?? c.act?.n ?? 1;
    worth = (RITE_WORTH[op] ?? (() => 10))(n);
    if (c.alsoDraw) worth += 8 * c.alsoDraw;
    if (c.alsoBank) worth += 5 * c.alsoBank;
    if (c.kind === 'device') worth += 6; // stays on the table
    worth *= AUTO_TUNING.riteScale;
  }
  return worth / (Math.max(0, c.cost) + AUTO_TUNING.costPad);
}

/** May this plate sit in an auto-built working for `faction` at all? */
export function autoEligible(c: Card, faction: string): boolean {
  return (
    c.kind !== 'hero' &&
    !c.keywords.includes('cryptid') &&
    !isExcludedPlateId(c.id) &&
    !isLossInjectId(c.id) &&
    isLegalForOrder(faction, c.faction)
  );
}

export type AutoBuild = { cards: string[]; short: number };

/**
 * The strongest legal working for the leader's order from `owned` copies
 * (id → count). `short` > 0 when the player owns too few legal plates.
 */
export function strongestDeck(faction: string, owned: Record<string, number>, size = AUTO_SIZE): AutoBuild {
  const pool = CARDS.filter((c) => autoEligible(c, faction) && (owned[c.id] ?? 0) > 0)
    .map((c) => ({ c, s: plateScore(c), left: Math.min(3, owned[c.id] ?? 0) }))
    .sort((a, b) => b.s - a.s || a.c.cost - b.c.cost || a.c.id.localeCompare(b.c.id));
  const picked: string[] = [];
  const take = (pred: (c: Card) => boolean, until: () => boolean) => {
    for (const p of pool) {
      while (p.left > 0 && pred(p.c) && !until() && picked.length < size) {
        picked.push(p.c.id);
        p.left -= 1;
      }
    }
  };
  const units = () => picked.filter((id) => cardById(id)?.kind === 'unit').length;
  const cheap = () => picked.filter((id) => (cardById(id)?.cost ?? 9) <= 2).length;
  // 1) the cheap floor, best first; 2) the unit floor; 3) the best of the rest.
  take((c) => c.cost <= 2, () => cheap() >= AUTO_TUNING.minCheap);
  take((c) => c.kind === 'unit', () => units() >= AUTO_TUNING.minUnits);
  take(() => true, () => picked.length >= size);
  const cards = picked.sort((a, b) => (cardById(a)!.cost - cardById(b)!.cost) || a.localeCompare(b));
  return { cards, short: Math.max(0, 30 - cards.length) };
}

/* ---- Sims-informed pick: short head-to-head trials between candidate lists ---- */


/** Tuning variants tried as candidates (the default first). */
const VARIANTS: Partial<typeof AUTO_TUNING>[] = [
  {},
  { riteScale: 1 },
  { riteScale: 1.9 },
  { costPad: 2.6 },
  { costPad: 1 },
  { minCheap: 12 },
  { minCheap: 5, costPad: 2.2 },
];

function withTuning<T>(t: Partial<typeof AUTO_TUNING>, fn: () => T): T {
  const saved = { ...AUTO_TUNING };
  Object.assign(AUTO_TUNING, t);
  try {
    return fn();
  } finally {
    Object.assign(AUTO_TUNING, saved);
  }
}

function eraOfFaction(faction: string): 'first' | 'second' | 'old' {
  if (isSecondHourSociety(faction)) return 'second';
  if (isSealedCenturyOrder(faction)) return 'old';
  return 'first';
}

/** One seeded trial: does list `a` beat list `b` (same leader, `aSide` seat)? */
function trial(a: string[], b: string[], heroId: string, faction: string, g: number): number {
  const leader = CARDS.find((c) => c.id === heroId);
  const maps = mapsForEra(eraOfFaction(faction));
  const pool = maps.length ? maps : MAPS;
  resetAiPlan();
  const rand = seededRand(9000 + g);
  const aSide: Side = g % 2 === 0 ? 'blue' : 'red';
  const st = newMatch({
    tiles: pool[g % pool.length]!.tiles,
    blueDeck: shuffleInPlace(cardsFromIds(aSide === 'blue' ? a : b), rand),
    redDeck: shuffleInPlace(cardsFromIds(aSide === 'red' ? a : b), rand),
    blueLeader: leader,
    redLeader: leader,
    rand,
  });
  const pol = (s: Parameters<typeof snapshotFromState>[0], avoid?: string[]) =>
    pickAiAction({ ...snapshotFromState(s), avoid }, 'experienced', { rand });
  const r = playMatch(st, { blue: pol, red: pol }, { maxTurns: 80 });
  return r.winner === aSide ? 1 : r.winner ? 0 : 0.5;
}

export type SimPick = { cards: string[]; short: number; winRate: number; candidates: number; games: number };

/**
 * Build candidate lists from the owned plates, then let them spar (Experienced
 * minds, seeded) against the current list and the oath's starter working.
 * A generator so the UI can run it in slices; `.next()` until done.
 */
export function* strongestBySims(
  faction: string,
  heroId: string,
  owned: Record<string, number>,
  current: string[] = [],
  gamesPer = 8,
): Generator<number, SimPick, void> {
  const seen = new Set<string>();
  const cands: AutoBuild[] = [];
  for (const v of VARIANTS) {
    const b = withTuning(v, () => strongestDeck(faction, owned));
    const key = [...b.cards].sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      cands.push(b);
    }
  }
  const base = cands[0]!;
  if (base.short > 0 || cands.length === 1) return { ...base, winRate: 0, candidates: cands.length, games: 0 };
  const legalCurrent = current.length >= 30 ? current : null;
  if (legalCurrent) {
    const key = [...legalCurrent].sort().join(',');
    if (!seen.has(key)) cands.push({ cards: [...legalCurrent], short: 0 });
  }
  const foes = [buildOrderAllyWorkingIds(faction, 30), ...(legalCurrent ? [legalCurrent] : [])];
  const total = cands.length * foes.length * gamesPer;
  let done = 0;
  let best = { i: 0, score: -1 };
  for (let i = 0; i < cands.length; i++) {
    let score = 0;
    for (const foe of foes) {
      for (let g = 0; g < gamesPer; g++) {
        score += trial(cands[i]!.cards, foe, heroId, faction, g);
        done += 1;
        yield done / total;
      }
    }
    if (score > best.score) best = { i, score };
  }
  const pick = cands[best.i]!;
  return {
    cards: [...pick.cards].sort((a, b) => (cardById(a)!.cost - cardById(b)!.cost) || a.localeCompare(b)),
    short: 0,
    winRate: best.score / (foes.length * gamesPer),
    candidates: cands.length,
    games: total,
  };
}

/** Run the generator to the end (tests, scripts). */
export function strongestBySimsSync(...args: Parameters<typeof strongestBySims>): SimPick {
  const it = strongestBySims(...args);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
