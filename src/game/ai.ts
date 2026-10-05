/**
 * Rival mind (Crimson AI).
 *
 * Port of Justin's grok.me AI (occultwar.grok.me, App bundle `We`…`rt`) onto the
 * Vercel engine, with three levels:
 *   - easy:        spends the bank, misses the killing line (random among the top).
 *   - experienced: fights for nodes, trades and removal (best heuristic pick).
 *   - expert:      grok's heuristics plus a genius layer — lethal search, a
 *                  whole-rite beam search on the real rules engine, and a
 *                  1-ply simulated reply from the other chair (see `expertPick`).
 *
 * Every candidate is scored by the grok heuristics below; the per-level
 * threshold filter (`passesLevel`) and pickers match grok's `Ke` / `rt`.
 */

import type { Side, Tile } from './maps';
import { cardById } from '../data/catalog';
import type { Card } from './types';
import type { ControlGrid } from './scoring';
import { DOMINATION_WIN, bankFromHoldings, countHoldings } from './scoring';
import { canDeployOn, isEnemyStronghold, isPaintable } from './control';
import { canBeStruck, hasKeyword, manhattan, rangedReach } from './keywords';
import { applyDamage, combatantFrom, resolveMelee } from './combat';
import { MEASURED_BLOODED, bloodedResult, crownBonusOnBoard, type RulesBoard } from './rules';
import { isRecallableFromDiscard, type EffectUnit } from './effects';
import {
  applyAction,
  cloneState,
  foeOf,
  listPlaced,
  seededRand,
  type EngineAction,
  type EngineState,
} from './engine';

export type AiDifficulty = 'easy' | 'experienced' | 'expert';
export const AI_DIFFICULTIES: AiDifficulty[] = ['easy', 'experienced', 'expert'];
export const AI_DIFFICULTY_KEY = 'occult-wars-ai';

export function aiDifficultyLabel(d: AiDifficulty): string {
  return d === 'easy' ? 'Easy' : d === 'experienced' ? 'Experienced' : 'Expert';
}

export const AI_DIFFICULTY_BLURB: Record<AiDifficulty, string> = {
  easy: 'Spends the bank. Misses the killing line.',
  experienced: 'Fights for nodes, trades, and removal.',
  expert: 'Reads the whole rite, takes every killing line, and guards the door.',
};

export function readAiDifficulty(raw: string | null | undefined): AiDifficulty {
  return raw === 'easy' || raw === 'experienced' || raw === 'expert' ? raw : 'expert';
}

/** Max AI actions per rite (grok: 22 / 16 / 12). */
export function aiStepCap(d: AiDifficulty): number {
  return d === 'expert' ? 22 : d === 'experienced' ? 16 : 12;
}

export type AiUnit = {
  uid: string;
  side: Side;
  power: number;
  keywords: string[];
  moved: boolean;
  attacked: boolean;
  sick?: boolean;
  used?: boolean;
  once?: boolean;
  cardId?: string;
  r: number;
  c: number;
  maxPower?: number;
  tough?: boolean;
  fast?: boolean;
  arrest?: number;
  shutter?: boolean;
  silenced?: boolean;
  powder?: boolean;
  name?: string;
  loyalty?: number;
};

export type AiSnapshot = {
  side: Side;
  tiles: Tile[][];
  control: ControlGrid;
  board: (AiUnit | null)[][];
  hand: Card[];
  /** Own discard (for Cayce recall / Whitethorn revive). */
  discard?: Card[];
  loyalty: number;
  domination?: { blue: number; red: number };
  leader?: Card;
  leaderUsed?: boolean;
  /** Actions that already failed this rite (JSON keys) — never pick again. */
  avoid?: string[];
  /** Public info about the other chair (bank on the HUD). */
  foeLoyalty?: number;
  turn?: number;
};

export type AiAction = EngineAction;

type Scored = { action: AiAction; score: number };

export function actionKey(a: AiAction): string {
  return JSON.stringify(a);
}

// ── board helpers ───────────────────────────────────────────────────────────

function ortho(r: number, c: number): { r: number; c: number }[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < 5 && p.c >= 0 && p.c < 5);
}

function units(s: AiSnapshot, side?: Side): AiUnit[] {
  const out: AiUnit[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = s.board[r][c];
      if (u && (side == null || u.side === side)) out.push(u);
    }
  return out;
}

function strongholdOf(tiles: Tile[][], side: Side): { r: number; c: number } | null {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const t = tiles[r][c];
      if (t?.kind === 'stronghold' && t.home === side) return { r, c };
    }
  return null;
}

/** Unclaiming / Veiled: crosses ground without conquering (cannot storm). */
function noClaim(u: { keywords: string[] }): boolean {
  return hasKeyword(u, 'unclaiming') || hasKeyword(u, 'veiled');
}

function rooted(s: AiSnapshot, side: Side, r: number, c: number): boolean {
  for (const p of ortho(r, c)) {
    const u = s.board[p.r][p.c];
    if (u && u.side !== side && hasKeyword(u, 'root')) return true;
  }
  return false;
}

function airshipNear(s: AiSnapshot, side: Side, r: number, c: number): boolean {
  for (const p of ortho(r, c)) {
    const u = s.board[p.r][p.c];
    if (u && u.side === side && hasKeyword(u, 'airship')) return true;
  }
  return false;
}

/** Ready to strike (arrest still lets a unit strike on this engine). */
function canStrikeNow(s: AiSnapshot, u: AiUnit): boolean {
  return !(u.sick || u.moved || u.attacked || rooted(s, u.side, u.r, u.c));
}

/** Ready to step. */
function canMoveNow(s: AiSnapshot, u: AiUnit): boolean {
  return canStrikeNow(s, u) && !((u.arrest ?? 0) > 0);
}

function exhausted(u: AiUnit): boolean {
  return !!(u.sick || u.moved || u.attacked);
}

/** grok `V`: what a unit is worth on the field. */
export function unitWorth(u: { power: number; keywords: string[]; tough?: boolean; fast?: boolean }): number {
  let v = Math.max(0, u.power) * 7 + 6;
  if (hasKeyword(u, 'fast')) v += 8;
  if (hasKeyword(u, 'ranged')) v += 6;
  if (hasKeyword(u, 'tough')) v += 5;
  if (hasKeyword(u, 'crown')) v += 6;
  if (hasKeyword(u, 'root')) v += 8;
  if (hasKeyword(u, 'hearth')) v += 5;
  if (hasKeyword(u, 'tithe')) v += 4;
  if (hasKeyword(u, 'tithe2')) v += 7;
  if (hasKeyword(u, 'relay')) v += 4;
  if (hasKeyword(u, 'devour')) v += 8;
  if (hasKeyword(u, 'banish')) v += 6;
  return v;
}

/** grok `Ee`: circles matter more as either chair nears 60. */
function endgameWeight(s: AiSnapshot): number {
  const me = s.domination?.[s.side] ?? 0;
  const them = s.domination?.[foeOf(s.side)] ?? 0;
  if (me >= 48 || them >= 48) return 1.6;
  if (me >= 36 || them >= 36) return 1.28;
  return 1;
}

/** grok `De`: worth of taking a circle. */
function tileWorth(s: AiSnapshot, t: Tile, alreadyMine: boolean): number {
  if (alreadyMine) return 0;
  let v = 0;
  if (t.kind === 'resource') v = t.symbols === 2 ? 30 : 18;
  else if (t.kind === 'gate') v = 14;
  else if (t.kind === 'street') v = 7;
  return v * endgameWeight(s);
}

function combatant(u: { uid?: string; power: number; keywords: string[]; tough?: boolean; fast?: boolean }, bonus = 0) {
  return combatantFrom({
    id: u.uid ?? 'u',
    name: u.uid ?? 'u',
    power: u.power,
    keywords: u.keywords,
    tough: !!u.tough || hasKeyword(u, 'tough'),
    fast: !!u.fast || hasKeyword(u, 'fast'),
    slow: hasKeyword(u, 'slow'),
    strikeBonus: bonus,
  });
}

/** grok `H`: damage a blow of `raw` deals to this unit. */
function blowOn(power: number, keywords: string[], tough: boolean | undefined, raw: number): number {
  return applyDamage(combatant({ power, keywords, tough }), raw);
}

function crown(s: AiSnapshot, side: Side, r: number, c: number): number {
  return crownBonusOnBoard(s.board as unknown as RulesBoard, side, r, c);
}

/** grok `U`: melee preview with Lamp (crown) bonuses. */
function meleePreview(atk: AiUnit, def: AiUnit, s: AiSnapshot) {
  const f = resolveMelee(
    combatant(atk, crown(s, atk.side, atk.r, atk.c)),
    combatant(def, crown(s, def.side, def.r, def.c)),
  );
  return {
    attackerDestroyed: f.attackerDestroyed,
    defenderDestroyed: f.defenderDestroyed,
    atkPower: f.attacker.power,
    defPower: f.defender.power,
  };
}

function strikable(atk: AiUnit, def: AiUnit, at?: { r: number; c: number }): boolean {
  const to = at ?? def;
  return canBeStruck(atk, def, manhattan(atk.r, atk.c, to.r, to.c), atk, to);
}

// ── grok scoring ───────────────────────────────────────────────────────────

function isMeasuredBlooded(u: AiUnit): boolean {
  return !!u.cardId && MEASURED_BLOODED.has(u.cardId);
}

/**
 * Worth of Blooded firing on `u` with `left` power after the fight. Classic
 * Blooded keeps grok's flat bonus; measured Blooded is worth `perPoint` for
 * the +1 it gains every time it strikes and survives.
 */
function bloodedEdge(u: AiUnit, left: number, flat: number, perPoint: number): number {
  if (!isMeasuredBlooded(u)) return flat;
  const next = bloodedResult({ cardId: u.cardId, power: left, maxPower: u.maxPower ?? u.power }, u.power);
  return Math.max(0, next.power - left) * perPoint;
}

/** grok `ke`: strike score. */
function attackScore(s: AiSnapshot, atk: AiUnit, def: AiUnit): number {
  if (!canStrikeNow(s, atk)) return -9999;
  if (!strikable(atk, def)) return -9999;
  const melee = manhattan(atk.r, atk.c, def.r, def.c) <= 1;
  const advances = melee && !((atk.arrest ?? 0) > 0);
  const tile = s.tiles[def.r]?.[def.c];
  const defV = unitWorth(def);
  const atkV = unitWorth(atk);
  const storms = advances && !!tile && isEnemyStronghold(tile, atk.side) && !noClaim(atk);
  if (hasKeyword(atk, 'devour') || (melee && hasKeyword(def, 'devour'))) {
    const mine = hasKeyword(atk, 'devour');
    const theirs = melee && hasKeyword(def, 'devour');
    if (mine && !theirs) {
      let v = defV + 10;
      if (storms) v += 9000;
      else if (advances && tile && isPaintable(tile)) v += tileWorth(s, tile, s.control[def.r][def.c] === atk.side);
      return v;
    }
    return theirs && !mine ? -atkV - 30 : defV - atkV;
  }
  if (hasKeyword(atk, 'banish') || hasKeyword(atk, 'veiled')) {
    let v = defV * 0.72;
    if (storms) v += 9000;
    else if (advances && tile && isPaintable(tile) && !noClaim(atk))
      v += tileWorth(s, tile, s.control[def.r][def.c] === atk.side);
    return v;
  }
  let kills = false;
  let dies = false;
  let dealt = 0;
  let taken = 0;
  let atkLeft = atk.power;
  let defLeft = def.power;
  if (melee) {
    const f = meleePreview(atk, def, s);
    atkLeft = f.atkPower;
    defLeft = f.defPower;
    kills = f.defenderDestroyed;
    dies = f.attackerDestroyed;
    dealt = Math.max(0, def.power - f.defPower);
    taken = Math.max(0, atk.power - f.atkPower);
  } else {
    const bonus = crown(s, atk.side, atk.r, atk.c);
    dealt = blowOn(def.power, def.keywords, def.tough, atk.power + bonus);
    kills = def.power - dealt <= 0;
    dies = false;
  }
  let v = 0;
  if (kills && !dies) {
    v += defV + 14;
    if (storms) v += 9000;
    else if (tile && isPaintable(tile) && s.control[def.r][def.c] !== atk.side && !noClaim(atk))
      v += tileWorth(s, tile, false);
    if (hasKeyword(atk, 'blooded')) v += bloodedEdge(atk, atkLeft, 8, 4);
  } else if (kills && dies) {
    v += defV - atkV - 4;
  } else if (!kills && dies) {
    v += -atkV - 24;
  } else {
    v += dealt * 4 - taken * 5;
    if (dealt <= 0) v -= 10;
    if (hasKeyword(atk, 'blooded') && !dies && dealt > 0)
      v += bloodedEdge(atk, atkLeft, 6, 3);
    if (hasKeyword(def, 'blooded') && !kills) {
      // Measured Blooded only grows when it strikes back (melee).
      if (!isMeasuredBlooded(def)) v -= 6;
      else if (melee) v -= bloodedEdge(def, defLeft, 6, 3);
    }
  }
  return v;
}

/** grok `Ae`: foes that can storm our stronghold next rite. */
function strongholdThreats(s: AiSnapshot): Set<string> {
  const out = new Set<string>();
  const home = strongholdOf(s.tiles, s.side);
  if (!home) return out;
  const keeper = s.board[home.r][home.c];
  for (const f of units(s, foeOf(s.side))) {
    if (manhattan(f.r, f.c, home.r, home.c) !== 1 || noClaim(f)) continue;
    if (!keeper) {
      out.add(f.uid);
      continue;
    }
    const m = meleePreview(f, keeper, s);
    if (m.defenderDestroyed && !m.attackerDestroyed) out.add(f.uid);
  }
  return out;
}

/** grok `je`: how exposed a unit is standing on (r, c). */
function exposure(s: AiSnapshot, u: AiUnit, r: number, c: number): number {
  let worst = 0;
  const here = { ...u, r, c };
  for (const f of units(s, foeOf(s.side))) {
    const d = manhattan(f.r, f.c, r, c);
    if (d < 1 || d > rangedReach(f) || !strikable(f, here, { r, c })) continue;
    if (d > 1) {
      const bonus = crown(s, f.side, f.r, f.c);
      const dmg = blowOn(u.power, u.keywords, u.tough, f.power + bonus);
      worst = u.power - dmg <= 0 ? Math.max(worst, unitWorth(u) * 0.72) : Math.max(worst, dmg * 2);
    } else {
      const m = meleePreview(f, here, s);
      worst =
        m.defenderDestroyed && !m.attackerDestroyed
          ? Math.max(worst, unitWorth(u) * 0.8)
          : m.defenderDestroyed
            ? Math.max(worst, unitWorth(u) * 0.3)
            : Math.max(worst, Math.max(0, u.power - m.defPower) * 2);
    }
  }
  return worst;
}

/** grok `Me`: value of standing on our own empty stronghold under threat. */
function guardValue(s: AiSnapshot, u: AiUnit, r: number, c: number): number {
  const home = strongholdOf(s.tiles, s.side);
  if (!home || home.r !== r || home.c !== c || s.board[r][c]) return 0;
  const near = units(s, foeOf(s.side)).filter((f) => manhattan(f.r, f.c, r, c) === 1 && !noClaim(f));
  if (near.length === 0) return 0;
  const keeper = { ...u, r, c, side: s.side };
  for (const f of near) {
    const m = meleePreview(f, keeper, s);
    if (m.defenderDestroyed && !m.attackerDestroyed) return 24;
  }
  return 640;
}

function deployCells(s: AiSnapshot): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (s.board[r][c]) continue;
      const t = s.tiles[r][c];
      if (!t || t.kind === 'void') continue;
      const air = airshipNear(s, s.side, r, c) && !isEnemyStronghold(t, s.side);
      if (canDeployOn(t, s.control, r, c, s.side) || air) out.push({ r, c });
    }
  return out;
}

/** grok `Pe`: penalty for spending what a big muster needs. */
function starvesMuster(s: AiSnapshot, cost: number): number {
  const left = s.loyalty - cost;
  return s.hand.some((h) => h.kind === 'unit' && (h.power ?? 0) >= 3 && h.cost <= s.loyalty && h.cost > left)
    ? 16
    : 0;
}

/** grok `Fe`: deploy score. */
function deployScore(s: AiSnapshot, card: Card, r: number, c: number): number {
  const side = s.side;
  let p = card.power ?? 0;
  if (card.keywords.includes('warband')) p += units(s, side).length;
  const u: AiUnit = {
    uid: `new-${card.id}`,
    side,
    power: p,
    keywords: card.keywords,
    moved: false,
    attacked: false,
    r,
    c,
    maxPower: p,
  };
  let v = unitWorth(u) * 0.62 - card.cost * 1.15;
  v += (p / Math.max(1, card.cost)) * 5;
  const chill = units(s, foeOf(side)).some((f) => hasKeyword(f, 'chill'));
  if (card.keywords.includes('delay') || chill) v -= 8;
  const foeHome = strongholdOf(s.tiles, foeOf(side));
  if (foeHome) v += Math.max(0, 4 - manhattan(r, c, foeHome.r, foeHome.c)) * 3;
  v += guardValue(s, u, r, c);
  v -= exposure(s, u, r, c) * 0.45;
  v -= starvesMuster(s, card.cost) * 0.35;
  if (card.keywords.includes('scandal')) v += 6;
  return v;
}

/** grok `Ie`: step score. */
function moveScore(s: AiSnapshot, u: AiUnit, r: number, c: number): number {
  if (!canMoveNow(s, u)) return -9999;
  const t = s.tiles[r]?.[c];
  if (!t || t.kind === 'void' || s.board[r][c] || !ortho(u.r, u.c).some((p) => p.r === r && p.c === c))
    return -9999;
  if (isEnemyStronghold(t, u.side) && !noClaim(u)) return 9000;
  const side = u.side;
  let v = 0;
  if (isPaintable(t)) v += tileWorth(s, t, s.control[r][c] === side);
  const foeHome = strongholdOf(s.tiles, foeOf(side));
  if (foeHome) {
    const was = manhattan(u.r, u.c, foeHome.r, foeHome.c);
    const now = manhattan(r, c, foeHome.r, foeHome.c);
    v += (was - now) * 5;
    if (now === 1 && !noClaim(u)) v += 28;
  }
  const from = s.tiles[u.r][u.c];
  if (
    from?.kind === 'stronghold' &&
    from.home === side &&
    units(s, foeOf(side)).some((f) => manhattan(f.r, f.c, u.r, u.c) === 1 && !noClaim(f))
  )
    return -900;
  if (
    from &&
    isPaintable(from) &&
    s.control[u.r][u.c] === side &&
    units(s, foeOf(side)).some((f) => manhattan(f.r, f.c, u.r, u.c) === 1)
  )
    v -= tileWorth(s, from, false) * 0.7;
  const g = guardValue(s, u, r, c);
  if (g >= 600 || isEnemyStronghold(t, side)) return v + g;
  v += g;
  v -= exposure(s, u, r, c);
  return g < 100 && v < 4 ? -5 : v;
}

function threatBonus(threats: Set<string>, uid: string, kills: boolean): number {
  return kills && threats.has(uid) ? 680 : 0;
}

/** grok `Re`: best circle to shove/slide an exhausted unit into. */
function shoveTarget(s: AiSnapshot, u: AiUnit): { r: number; c: number; score: number } | null {
  if (!exhausted(u)) return null;
  let best: { r: number; c: number; score: number } | null = null;
  const side = s.side;
  const home = strongholdOf(s.tiles, side);
  for (const p of ortho(u.r, u.c)) {
    const t = s.tiles[p.r]?.[p.c];
    if (!t || t.kind === 'void' || t.kind === 'stronghold' || s.board[p.r][p.c]) continue;
    let v = 0;
    if (u.side === side) {
      if (isPaintable(t)) v += tileWorth(s, t, s.control[p.r][p.c] === side);
      const foeHome = strongholdOf(s.tiles, foeOf(side));
      if (foeHome && manhattan(p.r, p.c, foeHome.r, foeHome.c) === 1 && !noClaim(u)) v += 34;
    } else if (home) {
      const was = manhattan(u.r, u.c, home.r, home.c) === 1;
      const now = manhattan(p.r, p.c, home.r, home.c) === 1;
      if (was && !now) v += 560;
      if (!was && now) v -= 220;
      if (isPaintable(t) && s.control[p.r][p.c] !== u.side) v -= tileWorth(s, t, false) * 0.45;
    }
    if (!best || v > best.score) best = { r: p.r, c: p.c, score: v };
  }
  return best;
}

/** grok `ze`: aimed rite / leader target score. */
function aimedScore(s: AiSnapshot, op: string, n: number, t: AiUnit, threats: Set<string>): number {
  const mine = t.side === s.side;
  const dmg = blowOn(t.power, t.keywords, t.tough, n);
  if (op === 'smite' || op === 'trepan') {
    const kills = op === 'trepan' ? dmg >= t.power && t.power > 0 : t.power - dmg <= 0;
    if (op === 'trepan' && !kills) return -30;
    if (mine) return kills ? -unitWorth(t) : -dmg * 4;
    return kills ? unitWorth(t) * 0.9 + threatBonus(threats, t.uid, true) : dmg * 3 + (threats.has(t.uid) ? 40 : 0);
  }
  if (op === 'destroy' || op === 'bounce') {
    if (hasKeyword(t, 'veiled')) return -999;
    const v = op === 'bounce' ? unitWorth(t) * 0.7 : unitWorth(t) * 0.95;
    return mine ? -v : v + threatBonus(threats, t.uid, true);
  }
  if (op === 'destroy_refund') {
    return mine ? -unitWorth(t) : unitWorth(t) * 0.85 - t.power + threatBonus(threats, t.uid, true);
  }
  if (op === 'lock') return mine ? -8 : (threats.has(t.uid) ? 620 : 22) + Math.min(12, t.power);
  if (op === 'empower') return !mine || n <= 0 ? -6 : n * 6 + (t.power >= 3 ? 4 : 0);
  if (op === 'set_power') {
    return mine
      ? Math.max(-8, (n - t.power) * 5)
      : Math.max(-8, (t.power - n) * 5) + (n <= 0 ? threatBonus(threats, t.uid, true) : 0);
  }
  return 0;
}

function resourceSeals(s: AiSnapshot, side: Side): number {
  let n = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const t = s.tiles[r][c];
      if (t?.kind === 'resource' && s.control[r][c] === side) n += t.symbols === 2 ? 2 : 1;
    }
  return n;
}

const AIMED_RITES = ['smite', 'empower', 'lock', 'set_power', 'destroy', 'bounce', 'destroy_refund', 'trepan'];

/** grok `Be`: rite / device scoring. */
function castCandidates(s: AiSnapshot, threats: Set<string>, out: Scored[]) {
  const side = s.side;
  s.hand.forEach((card, index) => {
    if ((card.kind !== 'rite' && card.kind !== 'device') || !card.effect || card.cost > s.loyalty) return;
    const op = card.effect.op;
    const n = card.effect.n ?? 0;
    const cost = card.cost * 2.4 + starvesMuster(s, card.cost);
    const extra = (card.alsoBank ?? 0) * 2 + (card.alsoDraw ?? 0) * 5;
    const push = (v: number, action: AiAction) => {
      const score = v + extra - cost;
      if (score > -5) out.push({ action, score });
    };
    const plain: AiAction = { type: 'cast', index };
    if (op === 'draw') {
      const room = Math.max(0, 6 - s.hand.length);
      push((room > 0 ? 7 : 1) * Math.min(n, Math.max(room, 1)), plain);
      return;
    }
    if (op === 'bank' || op === 'bank_draw') {
      const gain = op === 'bank_draw' ? 1 : n;
      const unlocks = s.hand.some(
        (h) =>
          h.kind === 'unit' &&
          (h.power ?? 0) >= 3 &&
          h.cost > s.loyalty - card.cost &&
          h.cost <= s.loyalty - card.cost + gain,
      );
      push((unlocks ? 22 : gain * 2) + (op === 'bank_draw' ? 6 : 0), plain);
      return;
    }
    if (op === 'empower_all') {
      push(units(s, side).length * n * 6, plain);
      return;
    }
    if (op === 'smite_all') {
      let v = 0;
      for (const u of units(s)) {
        const d = blowOn(u.power, u.keywords, u.tough, n);
        const dead = u.power - d <= 0;
        v +=
          u.side === side
            ? dead
              ? -unitWorth(u)
              : -d * 3
            : dead
              ? unitWorth(u) * 0.75 + threatBonus(threats, u.uid, true)
              : d * 2;
      }
      push(v, plain);
      return;
    }
    if (op === 'tide') {
      let v = 0;
      for (const u of units(s, foeOf(side))) {
        if (hasKeyword(u, 'gills')) continue;
        const d = blowOn(u.power, u.keywords, u.tough, 1);
        v += u.power - d <= 0 ? unitWorth(u) * 0.7 + threatBonus(threats, u.uid, true) : d * 3;
      }
      push(v, plain);
      return;
    }
    if (op === 'snuff_guns') {
      let v = 0;
      for (const u of units(s, foeOf(side))) {
        if (!hasKeyword(u, 'ranged')) continue;
        const d = blowOn(u.power, u.keywords, u.tough, 2);
        v += u.power - d <= 0 ? unitWorth(u) * 0.8 : 10;
      }
      push(v, plain);
      return;
    }
    if (op === 'leech') {
      push(10, plain);
      return;
    }
    if (op === 'empty') {
      push(s.loyalty < 4 ? 16 : -8, plain);
      return;
    }
    if (op === 'field_poison') {
      push((units(s, foeOf(side)).length - units(s, side).length) * (n || 3) * 3, plain);
      return;
    }
    if (op === 'no_bank') {
      push((resourceSeals(s, foeOf(side)) - resourceSeals(s, side)) * 8, plain);
      return;
    }
    if (op === 'shove') {
      let best: Scored | null = null;
      for (const u of units(s)) {
        if (hasKeyword(u, 'veiled')) continue;
        const t = shoveTarget(s, u);
        if (!t) continue;
        const score = t.score + extra - cost;
        const action: AiAction = { type: 'cast', index, targetUid: u.uid, r: t.r, c: t.c };
        if (!best || score > best.score) best = { action, score };
      }
      if (best && best.score > 0) out.push(best);
      return;
    }
    if (!AIMED_RITES.includes(op)) return;
    let best: Scored | null = null;
    for (const u of units(s)) {
      if (hasKeyword(u, 'veiled') && op !== 'empower') continue;
      const score = aimedScore(s, op, n, u, threats) + extra - cost;
      const action: AiAction = { type: 'cast', index, targetUid: u.uid };
      if (!best || score > best.score) best = { action, score };
    }
    if (best && best.score > 0) out.push(best);
  });
}

/** grok `He`: leader power scoring. */
function leaderCandidates(s: AiSnapshot, threats: Set<string>, out: Scored[]) {
  const hero = s.leader;
  const lp = hero?.leaderPower;
  if (!hero || !lp || s.leaderUsed) return;
  const pay = hero.cost ?? 0;
  if (pay > s.loyalty) return;
  const op = lp.op;
  const n = lp.n ?? 0;
  const cost = pay * 2.2 + starvesMuster(s, pay);
  const push = (v: number, action: AiAction) => {
    if (v - cost > 0) out.push({ action, score: v - cost });
  };
  if (op === 'draw') return push(s.hand.length < 5 ? 8 * n : 2, { type: 'leader' });
  if (op === 'master') return push(s.hand.length < 5 ? 22 : 10, { type: 'leader' });
  if (op === 'tide') {
    let v = 0;
    for (const u of units(s, foeOf(s.side))) {
      if (hasKeyword(u, 'gills')) continue;
      const d = blowOn(u.power, u.keywords, u.tough, 1);
      v += u.power - d <= 0 ? unitWorth(u) * 0.65 : 4;
    }
    return push(v, { type: 'leader' });
  }
  if (op === 'playback' || op === 'grave') return push(14, { type: 'leader' });
  if (op === 'claim') {
    let best: Scored | null = null;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        if (s.board[r][c]) continue;
        const t = s.tiles[r][c];
        if (!t || !isPaintable(t)) continue;
        const score = tileWorth(s, t, s.control[r][c] === s.side) - cost;
        if (!best || score > best.score) best = { action: { type: 'leader', r, c }, score };
      }
    if (best && best.score > 0) out.push(best);
    return;
  }
  if (op === 'slide') {
    let best: Scored | null = null;
    for (const u of units(s)) {
      if (hasKeyword(u, 'veiled')) continue;
      const t = shoveTarget(s, u);
      if (!t) continue;
      const score = t.score - cost;
      if (!best || score > best.score) best = { action: { type: 'leader', targetUid: u.uid, r: t.r, c: t.c }, score };
    }
    if (best && best.score > 0) out.push(best);
    return;
  }
  if (op === 'snuff') {
    const mine = units(s, s.side)[0];
    if (mine) push(16 + (threats.size > 0 ? 4 : 0), { type: 'leader', targetUid: mine.uid });
    return;
  }
  // Untargeted unique workings.
  if (op === 'green_surge') {
    const nHit = units(s, s.side).filter((u) => cardById(u.cardId ?? '')?.faction === 'Sons of the Green Lion').length;
    return push(6 + nHit * 8, { type: 'leader' });
  }
  if (op === 'ready_works') {
    const nHit = units(s, s.side).filter(
      (u) => cardById(u.cardId ?? '')?.faction === 'The Mercury Works' && (u.sick || u.moved || u.attacked),
    ).length;
    return push(4 + nHit * 14, { type: 'leader' });
  }
  if (op === 'steal_res') return push(18, { type: 'leader' });
  if (op === 'icon_harvest') return push(units(s, foeOf(s.side)).length >= 2 ? 20 : 8, { type: 'leader' });
  if (op === 'death_tithe') return push(12, { type: 'leader' });
  if (op === 'scry3') return push(s.hand.length < 5 ? 16 : 6, { type: 'leader', pick: 0 });
  if (op === 'seek') return push(s.hand.length < 5 ? 18 : 8, { type: 'leader', seek: 'unit' });
  if (op === 'recall') {
    if (s.hand.length >= 7) return; // HAND_CAP
    const disc = s.discard ?? [];
    let bestIdx = -1;
    let bestV = -Infinity;
    for (let i = 0; i < disc.length; i++) {
      const c = disc[i]!;
      if (!isRecallableFromDiscard(c)) continue;
      const v = c.kind === 'unit' ? 12 + (c.power ?? 0) * 2 : 14 + (c.cost ?? 0);
      if (v > bestV) {
        bestV = v;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) push(bestV, { type: 'leader', discardIndex: bestIdx });
    return;
  }
  if (op === 'revive_coven') {
    const disc = s.discard ?? [];
    const discIdx = disc.findIndex((c) => c.kind === 'unit' && c.faction === 'The Whitethorn Coven');
    if (discIdx < 0) return;
    let best: Scored | null = null;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        if (s.board[r][c] || s.control[r][c] !== s.side) continue;
        const t = s.tiles[r][c];
        if (!t || t.kind === 'void' || t.kind === 'stronghold') continue;
        const score = 22 - cost;
        if (!best || score > best.score)
          best = { action: { type: 'leader', r, c, discardIndex: discIdx }, score };
      }
    if (best && best.score > 0) out.push(best);
    return;
  }
  const friendly = new Set([
    'mend', 'haste', 'bulwark', 'empower_draw', 'empower',
    'ward', 'last_stand', 'charge', 'breach', 'copy_kw',
  ]);
  const hostile = new Set(['smite', 'lock', 'set_power', 'destroy', 'bounce', 'trepan', 'martyr', 'transmute']);
  if (!friendly.has(op) && !hostile.has(op)) return push(4, { type: 'leader' });
  let best: Scored | null = null;
  for (const u of units(s)) {
    let v = 0;
    if (op === 'martyr') {
      if (u.side !== s.side) continue;
      v = -unitWorth(u) * 0.5;
      for (const p of ortho(u.r, u.c)) {
        const o = s.board[p.r][p.c];
        if (!o) continue;
        const d = blowOn(o.power, o.keywords, o.tough, 2);
        const dead = o.power - d <= 0;
        v += o.side === s.side ? (dead ? -unitWorth(o) : -d * 3) : dead ? unitWorth(o) * 0.8 : d * 3;
      }
    } else if (op === 'haste' || op === 'charge' || op === 'breach') {
      if (u.side !== s.side) continue;
      v = canStrikeNow(s, u) ? 8 : 28 + u.power * 2;
      if (op === 'breach') v += 6;
      if (op === 'charge') v += 4;
    } else if (op === 'ward' || op === 'last_stand') {
      if (u.side !== s.side) continue;
      v = 14 + u.power * 2 + (threats.has(u.uid) ? 8 : 0);
    } else if (op === 'copy_kw') {
      if (u.side !== s.side) continue;
      const pupil = units(s, s.side).find((o) => o.uid !== u.uid);
      if (!pupil) continue;
      v = 10 + (u.keywords?.length ?? 0) * 4;
      const score = v - cost;
      if (!best || score > best.score)
        best = { action: { type: 'leader', targetUid: u.uid, secondUid: pupil.uid }, score };
      continue;
    } else if (op === 'bulwark' || op === 'mend') {
      if (u.side !== s.side) continue;
      const lost = (u.maxPower ?? u.power) - u.power;
      v = op === 'mend' ? 10 + lost * 4 : 16;
    } else if (op === 'empower_draw' || op === 'empower') {
      if (u.side !== s.side) continue;
      v = (n || 1) * 6 + 4;
    } else if (op === 'transmute') {
      if (u.side === s.side) continue;
      v = unitWorth(u) * 0.85;
    } else {
      v = aimedScore(s, op, n || (op === 'smite' ? 2 : 0), u, threats);
    }
    const score = v - cost;
    if (!best || score > best.score) best = { action: { type: 'leader', targetUid: u.uid }, score };
  }
  if (best && best.score > 0) out.push(best);
}

/** grok `Ue`: unit activated abilities. */
function actCandidates(s: AiSnapshot, threats: Set<string>, out: Scored[]) {
  for (const u of units(s, s.side)) {
    if (u.sick || u.silenced) continue;
    const act = (u.cardId ? cardById(u.cardId) : undefined)?.act;
    if (!act || (act.once ? u.once : u.used)) continue;
    const pay = act.pay ?? 0;
    if (pay > s.loyalty) continue;
    const cost = pay * 2 + starvesMuster(s, pay);
    const near = ortho(u.r, u.c)
      .map((p) => s.board[p.r][p.c])
      .filter((x): x is AiUnit => !!x);
    if (act.op === 'wail') {
      let v = -cost;
      for (const o of near) v += o.side === s.side ? -unitWorth(o) : unitWorth(o) + threatBonus(threats, o.uid, true);
      if (v > 0) out.push({ action: { type: 'act', uid: u.uid }, score: v });
      continue;
    }
    if (act.op === 'gadget') {
      let v = -40 - cost;
      for (const o of units(s)) v += o.side === s.side ? -unitWorth(o) : unitWorth(o);
      if (v > 0) out.push({ action: { type: 'act', uid: u.uid }, score: v });
      continue;
    }
    if (act.op === 'jab' || act.op === 'once-nick' || act.op === 'once-sting' || act.op === 'sacrifice-hit') {
      const raw = act.op === 'sacrifice-hit' ? (act.n ?? 3) : 1;
      const pool =
        act.op === 'jab' || act.op === 'sacrifice-hit'
          ? near.filter((o) => o.side !== s.side && !hasKeyword(o, 'veiled'))
          : units(s, foeOf(s.side)).filter((o) => !hasKeyword(o, 'veiled'));
      let best: Scored | null = null;
      for (const o of pool) {
        if (act.op === 'once-sting' && o.power < 2) continue;
        const d = blowOn(o.power, o.keywords, o.tough, raw);
        let v = (o.power - d <= 0 ? unitWorth(o) * 0.9 + threatBonus(threats, o.uid, true) : d * 4) - cost;
        if (act.op === 'sacrifice-hit') v -= unitWorth(u) * 0.85;
        if (act.op === 'once-sting') v -= 6;
        if (!best || v > best.score) best = { action: { type: 'act', uid: u.uid, targetUid: o.uid }, score: v };
      }
      if (best && best.score > 0) out.push(best);
      continue;
    }
    if (act.op === 'tap-draw') {
      if (s.hand.length < 6) out.push({ action: { type: 'act', uid: u.uid }, score: 8 - cost });
      continue;
    }
    if (act.op === 'tap-crown') {
      const dom = s.domination?.[s.side] ?? 0;
      out.push({ action: { type: 'act', uid: u.uid }, score: (dom >= 40 ? 14 : 5) - cost });
      continue;
    }
    if (act.op === 'tap-bank' || act.op === 'sacrifice-bank') {
      const gain = act.n ?? (act.op === 'sacrifice-bank' ? 3 : 1);
      let v = gain * 3 - cost;
      if (act.op === 'sacrifice-bank') v -= unitWorth(u) * 0.7;
      if (s.hand.some((h) => h.kind === 'unit' && h.cost > s.loyalty - pay && h.cost <= s.loyalty - pay + gain)) v += 14;
      if (v > 0) out.push({ action: { type: 'act', uid: u.uid }, score: v });
      continue;
    }
    if (act.op === 'bolster' || act.op === 'once-power' || act.op === 'self-power') {
      const gain = act.n ?? 1;
      const pool = act.op === 'self-power' ? [u] : units(s, s.side);
      let best: Scored | null = null;
      for (const o of pool) {
        const v = gain * 6 - cost;
        const action: AiAction = {
          type: 'act',
          uid: u.uid,
          ...(act.op === 'self-power' ? {} : { targetUid: o.uid }),
        };
        if (!best || v > best.score) best = { action, score: v };
      }
      if (best && best.score > 0) out.push(best);
      continue;
    }
    if (act.op === 'sacrifice-fast') {
      for (const o of near) {
        if (o.side !== s.side || o.uid === u.uid || hasKeyword(o, 'fast')) continue;
        const v = o.power * 3 - unitWorth(u) * 0.6 - cost;
        if (v > 0) out.push({ action: { type: 'act', uid: u.uid, targetUid: o.uid }, score: v });
      }
      continue;
    }
    if (act.op === 'once-tough') {
      const top = units(s, s.side).sort((a, b) => b.power - a.power)[0];
      if (top && !hasKeyword(top, 'tough'))
        out.push({ action: { type: 'act', uid: u.uid, targetUid: top.uid }, score: 12 - cost });
      continue;
    }
    if (act.op === 'copy') {
      let best: Scored | null = null;
      for (const o of units(s)) {
        if (o.uid === u.uid || (act.foe && o.side === s.side)) continue;
        const v = (o.power - u.power) * 5 - cost;
        if (!best || v > best.score) best = { action: { type: 'act', uid: u.uid, targetUid: o.uid }, score: v };
      }
      if (best && best.score > 0) out.push(best);
      continue;
    }
    if (act.op === 'recall' && (u.maxPower ?? u.power) >= 3 && u.power <= 1) {
      out.push({ action: { type: 'act', uid: u.uid, targetUid: u.uid }, score: 8 - cost });
    }
  }
}

/** grok `Ge`: does this strike remove the target? */
function removesTarget(s: AiSnapshot, atk: AiUnit, def: AiUnit): boolean {
  if (hasKeyword(atk, 'banish') || hasKeyword(atk, 'veiled') || hasKeyword(atk, 'devour')) return true;
  if (manhattan(atk.r, atk.c, def.r, def.c) > 1) {
    const bonus = crown(s, atk.side, atk.r, atk.c);
    return def.power - blowOn(def.power, def.keywords, def.tough, atk.power + bonus) <= 0;
  }
  return meleePreview(atk, def, s).defenderDestroyed;
}

/** grok `We`: every scored candidate for the side to act. */
export function scoredCandidates(s: AiSnapshot): Scored[] {
  const out: Scored[] = [];
  const side = s.side;
  const threats = strongholdThreats(s);
  for (const u of units(s, side)) {
    if (!canStrikeNow(s, u)) continue;
    for (const p of ortho(u.r, u.c)) {
      const t = s.tiles[p.r]?.[p.c];
      if (!t || t.kind === 'void') continue;
      const o = s.board[p.r][p.c];
      if (o && o.side !== side) {
        const raw = attackScore(s, u, o) + threatBonus(threats, o.uid, true);
        const score =
          raw >= 9000 || hasKeyword(u, 'banish') || hasKeyword(u, 'veiled') || hasKeyword(u, 'devour') || removesTarget(s, u, o)
            ? raw
            : raw - threatBonus(threats, o.uid, true);
        if (score > -40) out.push({ action: { type: 'attack', uid: u.uid, targetUid: o.uid }, score });
        continue;
      }
      if (o) continue;
      const m = moveScore(s, u, p.r, p.c);
      if (m > -20) out.push({ action: { type: 'move', uid: u.uid, r: p.r, c: p.c }, score: m });
    }
    if (hasKeyword(u, 'ranged')) {
      for (const o of units(s, foeOf(side))) {
        if (manhattan(u.r, u.c, o.r, o.c) <= 1) continue;
        const score = attackScore(s, u, o) + (removesTarget(s, u, o) ? threatBonus(threats, o.uid, true) : 0);
        if (score > -20) out.push({ action: { type: 'attack', uid: u.uid, targetUid: o.uid }, score });
      }
    }
  }
  const cells = deployCells(s);
  s.hand.forEach((card, index) => {
    if (card.kind !== 'unit' || card.power == null || card.cost > s.loyalty) return;
    for (const p of cells) {
      out.push({ action: { type: 'deploy', index, r: p.r, c: p.c }, score: deployScore(s, card, p.r, p.c) });
    }
  });
  castCandidates(s, threats, out);
  leaderCandidates(s, threats, out);
  actCandidates(s, threats, out);
  return out;
}

/** grok `Ke`: per-level threshold for taking a candidate at all. */
function passesLevel(d: AiDifficulty, a: AiAction, score: number): boolean {
  if (d === 'easy') {
    if (score >= 2000) return true;
    if (a.type === 'leader' || a.type === 'cast') return false;
    if (a.type === 'act') return score > 28;
    if (a.type === 'attack') return score > 32;
    if (a.type === 'move') return score > 16;
    return a.type === 'deploy' && score > 0;
  }
  if (score >= 500) return true;
  if (d === 'expert') return score > 0;
  if (a.type === 'leader') return score > 14;
  if (a.type === 'cast') return score > 10;
  if (a.type === 'act') return score > 6;
  if (a.type === 'attack') return score > 0;
  return score > 2;
}

function rankedFor(s: AiSnapshot, d: AiDifficulty): Scored[] {
  const avoid = new Set(s.avoid ?? []);
  return scoredCandidates(s)
    .filter((x) => !avoid.has(actionKey(x.action)))
    .map((x) => (d === 'easy' && x.action.type === 'deploy' ? { ...x, score: x.score + 36 } : x))
    .filter((x) => passesLevel(d, x.action, x.score))
    .sort((a, b) => b.score - a.score);
}

export type PickOptions = {
  /** Random source for Easy / Experienced variety (default Math.random). */
  rand?: () => number;
  /** Expert search time budget in ms (default 650). */
  budgetMs?: number;
  /** Collects scored Expert plans (tests / tuning). */
  debug?: string[];
};

/**
 * Pick one action for the side to act.
 * Easy / Experienced follow grok's `rt`; Expert runs `expertPick`.
 */
export function pickAiAction(s: AiSnapshot, d: AiDifficulty = 'expert', opts: PickOptions = {}): AiAction {
  if (d === 'expert') return expertPick(s, opts);
  const rand = opts.rand ?? Math.random;
  const ranked = rankedFor(s, d);
  if (ranked.length === 0) return { type: 'end' };
  if (d === 'easy') {
    const near = ranked.filter((x) => x.score >= ranked[0].score - 16);
    return (near[Math.floor(rand() * near.length)] ?? ranked[0]).action;
  }
  if (ranked.length > 1 && rand() < 0.1) return ranked[1].action;
  return ranked[0].action;
}

/** Deterministic Experienced pick (grok heuristics, no variety). */
export function pickTrainingAction(s: AiSnapshot): AiAction {
  const ranked = rankedFor(s, 'experienced');
  return ranked[0]?.action ?? { type: 'end' };
}

// ── engine bridge ──────────────────────────────────────────────────────────

/** AI view of an engine state for `side` (exhaustion folded like Battlefield). */
export function snapshotFromState(st: EngineState, side: Side = st.side): AiSnapshot {
  const ctx = st.ctx;
  const board: (AiUnit | null)[][] = ctx.board.map((row, r) =>
    row.map((id, c) => {
      const u = id ? ctx.units[id] : undefined;
      if (!u) return null;
      return {
        uid: u.uid,
        side: u.side,
        power: u.power,
        keywords: u.keywords,
        moved: !!u.moved || !!u.sick,
        attacked: !!u.attacked || !!u.sick,
        sick: !!u.sick,
        used: !!u.used,
        once: !!u.once,
        cardId: u.cardId,
        r,
        c,
        maxPower: u.maxPower,
        tough: !!u.tough || u.keywords.includes('tough'),
        fast: !!u.fast || u.keywords.includes('fast'),
        arrest: u.arrest ?? 0,
        shutter: !!u.shutter,
        silenced: !!u.silenced,
        powder: !!u.powder,
        name: u.name,
        loyalty: u.loyalty,
      };
    }),
  );
  return {
    side,
    tiles: st.tiles,
    control: ctx.control,
    board,
    hand: ctx.hand[side],
    discard: ctx.discard[side],
    loyalty: ctx.loyalty[side],
    domination: { ...ctx.domination },
    leader: st.leaders[side],
    leaderUsed: st.leaderUsed[side],
    foeLoyalty: ctx.loyalty[foeOf(side)],
    turn: st.turn,
  };
}

/**
 * Rebuild a planning state from what the AI may see: the board, its own hand,
 * both banks and domination. The other chair's hand and both decks stay hidden
 * (empty), so the search never peeks at secret information.
 */
export function stateFromSnapshot(s: AiSnapshot): EngineState {
  const unitsById: Record<string, EffectUnit> = {};
  const board = s.board.map((row) =>
    row.map((u) => {
      if (!u) return null;
      const card = u.cardId ? cardById(u.cardId) : undefined;
      unitsById[u.uid] = {
        uid: u.uid,
        cardId: u.cardId ?? u.uid,
        name: u.name ?? card?.name ?? u.uid,
        side: u.side,
        power: u.power,
        maxPower: u.maxPower ?? u.power,
        loyalty: u.loyalty ?? card?.cost ?? 0,
        keywords: [...u.keywords],
        moved: u.moved,
        attacked: u.attacked,
        sick: u.sick,
        tough: u.tough,
        fast: u.fast,
        shutter: u.shutter,
        silenced: u.silenced,
        powder: u.powder,
        used: u.used,
        once: u.once,
        arrest: u.arrest,
      };
      return u.uid;
    }),
  );
  const me = s.side;
  const them = foeOf(me);
  const loyalty = { blue: 0, red: 0 };
  loyalty[me] = s.loyalty;
  loyalty[them] = s.foeLoyalty ?? 0;
  const hand = { blue: [] as Card[], red: [] as Card[] };
  hand[me] = [...s.hand];
  // The other chair's hand is hidden: assume a typical muster or two so the
  // search respects "deploy on a held gate and step in" threats.
  hand[them] = EXPERT_TUNING.phantoms ? [...PHANTOM_HAND] : [];
  const leaders: EngineState['leaders'] = {};
  leaders[me] = s.leader;
  const leaderUsed = { blue: true, red: true };
  leaderUsed[me] = !!s.leaderUsed;
  return {
    tiles: s.tiles,
    ctx: {
      side: me,
      loyalty,
      domination: { ...(s.domination ?? { blue: 0, red: 0 }) },
      hand,
      deck: { blue: [], red: [] },
      discard: { blue: [], red: [] },
      units: unitsById,
      board,
      control: s.control.map((row) => [...row]),
      log: [],
      fieldPoisonDamage: 0,
      noBankOpens: 0,
      tiles: s.tiles,
    },
    side: me,
    turn: s.turn ?? 10,
    leaders,
    leaderUsed,
    winner: null,
    winKind: null,
    // Planned musters must never reuse a live uid.
    uidSeq: 900000,
    rand: seededRand(7),
  };
}

// ── Expert: genius layer ───────────────────────────────────────────────────

/** Stand-ins for the other chair's unseen cards during lookahead. */
const PHANTOM_HAND: Card[] = [
  { id: 'phantom_2', name: 'Unseen Hand', faction: '', kind: 'unit', rarity: 'common', cost: 2, oath: 0, power: 2, keywords: [], text: '' },
  { id: 'phantom_3', name: 'Unseen Hand', faction: '', kind: 'unit', rarity: 'common', cost: 3, oath: 0, power: 3, keywords: [], text: '' },
];

/** Search knobs (exported for sims / tuning). */
export const EXPERT_TUNING = {
  beam: 5,
  maxDepth: 10,
  /** After the simulated reply, also play our own greedy follow-up rite. */
  followUp: true,
  /** Penalty when the other chair has a killing line two rites out (0 = off). */
  secondReply: 3000,
  /** How many leading plans are re-scored against a planned reply (0 = off). */
  refine: 6,
  /** Give the hidden foe hand two stand-in musters. */
  phantoms: true,
  matW: 0.5,
  holdW: 7,
  raceW: 9,
  domW: 1.5,
  bankW: 4,
};

const WIN = 1_000_000;

type PlanStep = {
  action: AiAction;
  /** Positions resolve unit uids at replay time (fresh muster uids differ). */
  src?: { r: number; c: number };
  tgt?: { r: number; c: number };
  /** Board signature expected before this step. */
  sig: string;
};

let planCache: PlanStep[] = [];

/** Uid-free signature of what matters for plan replay. */
function signature(s: AiSnapshot): string {
  const cells: string[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = s.board[r][c];
      if (u) cells.push(`${r}${c}${u.side[0]}${u.cardId}:${u.power}${u.moved ? 'm' : ''}${u.attacked ? 'a' : ''}${u.used ? 'u' : ''}${u.once ? 'o' : ''}`);
    }
  return `${s.side}|${s.loyalty}|${s.leaderUsed ? 1 : 0}|${s.hand.map((h) => h.id).join(',')}|${cells.join(';')}`;
}

function stepFor(st: EngineState, a: AiAction): PlanStep {
  const ctx = st.ctx;
  const pos = (uid?: string) => {
    if (!uid) return undefined;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (ctx.board[r][c] === uid) return { r, c };
    return undefined;
  };
  const src = 'uid' in a ? pos(a.uid) : undefined;
  const tgt = 'targetUid' in a ? pos(a.targetUid) : undefined;
  return { action: a, src, tgt, sig: signature(snapshotFromState(st)) };
}

function replayStep(s: AiSnapshot, step: PlanStep): AiAction | null {
  const a = step.action;
  const at = (p?: { r: number; c: number }) => (p ? s.board[p.r]?.[p.c]?.uid : undefined);
  if (a.type === 'move' || a.type === 'attack' || a.type === 'act') {
    const uid = at(step.src);
    if (!uid) return null;
    if (a.type === 'move') return { ...a, uid };
    if (a.type === 'attack') {
      const t = at(step.tgt);
      return t ? { ...a, uid, targetUid: t } : null;
    }
    const t = a.targetUid ? at(step.tgt) : undefined;
    if (a.targetUid && !t) return null;
    return t ? { ...a, uid, targetUid: t } : { type: 'act', uid };
  }
  if ((a.type === 'cast' || a.type === 'leader') && a.targetUid) {
    const t = at(step.tgt);
    return t ? { ...a, targetUid: t } : null;
  }
  return a;
}

function holdingsOf(st: EngineState, side: Side): number {
  return countHoldings(st.tiles, st.ctx.control, side);
}

/**
 * Static evaluation from `me`'s chair: material, domination race, income,
 * pressure on each stronghold, cards and bank.
 */
export function evaluateState(st: EngineState, me: Side): number {
  if (st.winner) return st.winner === me ? WIN : -WIN;
  const them = foeOf(me);
  const ctx = st.ctx;
  const placed = listPlaced(ctx);
  const myHome = strongholdOf(st.tiles, me);
  const theirHome = strongholdOf(st.tiles, them);
  let v = 0;
  for (const u of placed) {
    const w = unitWorth(u);
    v += (u.side === me ? w : -w) * EXPERT_TUNING.matW;
  }
  const domMe = ctx.domination[me];
  const domThem = ctx.domination[them];
  const holdMe = holdingsOf(st, me);
  const holdThem = holdingsOf(st, them);
  // Rites left to 60 at the current rate — the real domination race.
  const ritesMe = (DOMINATION_WIN - domMe) / Math.max(1, holdMe);
  const ritesThem = (DOMINATION_WIN - domThem) / Math.max(1, holdThem);
  const T = EXPERT_TUNING;
  v += (ritesThem - ritesMe) * T.raceW;
  v += (domMe - domThem) * T.domW + (holdMe - holdThem) * T.holdW;
  v +=
    (bankFromHoldings(st.tiles, ctx.control, me, placed) - bankFromHoldings(st.tiles, ctx.control, them, placed)) *
    T.bankW;
  v += Math.min(ctx.loyalty[me], 10) * 1.2 - Math.min(ctx.loyalty[them], 10) * 1.2;
  v += ctx.hand[me].length * 3;
  // Stronghold pressure.
  if (theirHome) {
    const keeper = ctx.board[theirHome.r][theirHome.c];
    for (const u of placed) {
      if (u.side !== me || noClaim(u)) continue;
      const d = manhattan(u.r, u.c, theirHome.r, theirHome.c);
      v += Math.max(0, 4 - d) * 4;
      if (d === 1 && !keeper) v += st.side === me && !u.sick ? 4000 : 40;
    }
  }
  if (myHome) {
    const keeper = ctx.board[myHome.r][myHome.c];
    for (const u of placed) {
      if (u.side !== them || noClaim(u)) continue;
      const d = manhattan(u.r, u.c, myHome.r, myHome.c);
      v -= Math.max(0, 4 - d) * 5;
      if (d === 1 && !keeper) v -= st.side === them ? 4000 : 70;
    }
  }
  return v;
}

function apply(st: EngineState, a: AiAction): EngineState | null {
  const next = cloneState(st);
  return applyAction(next, a) ? null : next;
}

/** Strongest sensible candidates in a state (grok scores, expert filter). */
function topCandidates(st: EngineState, k: number, avoid?: Set<string>): Scored[] {
  const snap = snapshotFromState(st);
  return scoredCandidates(snap)
    .filter((x) => x.score > 0)
    .filter((x) => !avoid || !avoid.has(actionKey(x.action)))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Wider candidate set for the Expert search: the best few of each kind, even
 * ones grok's one-step heuristic dislikes (a trade, an exposed step), so the
 * lookahead — not the heuristic — decides.
 */
function searchCandidates(st: EngineState, avoid?: Set<string>): Scored[] {
  const snap = snapshotFromState(st);
  const all = scoredCandidates(snap).filter((x) => !avoid || !avoid.has(actionKey(x.action)));
  const pick = (type: AiAction['type'][], n: number, floor: number) =>
    all
      .filter((x) => type.includes(x.action.type) && x.score > floor)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  // One deploy per card (its best cell) so musters don't crowd out the rest.
  const deploys: Scored[] = [];
  const seenCard = new Set<string>();
  for (const x of pick(['deploy'], 40, -30)) {
    const a = x.action as Extract<AiAction, { type: 'deploy' }>;
    const id = snap.hand[a.index]?.id ?? String(a.index);
    if (seenCard.has(id)) continue;
    seenCard.add(id);
    deploys.push(x);
    if (deploys.length >= 3) break;
  }
  // Plus the most forward muster (a held gate near their door, an airship).
  const foeHome = strongholdOf(st.tiles, foeOf(st.side));
  if (foeHome) {
    const forward = all
      .filter((x) => x.action.type === 'deploy')
      .map((x) => {
        const a = x.action as Extract<AiAction, { type: 'deploy' }>;
        return { x, d: manhattan(a.r, a.c, foeHome.r, foeHome.c) };
      })
      .sort((p, q) => p.d - q.d || q.x.score - p.x.score)[0];
    if (forward && forward.d <= 2 && !deploys.includes(forward.x)) deploys.push(forward.x);
  }
  return [
    ...pick(['attack'], 4, -60),
    ...pick(['move'], 5, -60),
    ...deploys,
    ...pick(['cast', 'leader', 'act'], 3, -5),
  ];
}

/** Moves / strikes that can matter for a stronghold storm within `depth` actions. */
function stormMoves(st: EngineState, depth: number): AiAction[] {
  const snap = snapshotFromState(st);
  const me = st.side;
  const home = strongholdOf(st.tiles, foeOf(me));
  if (!home) return [];
  const out: AiAction[] = [];
  for (const u of units(snap, me)) {
    if (!canStrikeNow(snap, u) || noClaim(u)) continue;
    const d = manhattan(u.r, u.c, home.r, home.c);
    if (d > depth + 1) continue;
    for (const p of ortho(u.r, u.c)) {
      const o = snap.board[p.r][p.c];
      if (!o) {
        if (canMoveNow(snap, u) && manhattan(p.r, p.c, home.r, home.c) < d) out.push({ type: 'move', uid: u.uid, r: p.r, c: p.c });
      } else if (o.side !== me && manhattan(p.r, p.c, home.r, home.c) <= Math.min(2, depth)) {
        out.push({ type: 'attack', uid: u.uid, targetUid: o.uid });
      }
    }
  }
  // Fresh musters on a held gate / airship circle next to the door can strike
  // or step in at once (unless slow muster or a Chill foe holds them).
  const chill = units(snap, foeOf(me)).some((f) => hasKeyword(f, 'chill'));
  if (!chill && depth >= 2) {
    const cells = deployCells(snap).filter((p) => manhattan(p.r, p.c, home.r, home.c) <= 1);
    snap.hand.forEach((card, index) => {
      if (card.kind !== 'unit' || card.power == null || card.cost > snap.loyalty) return;
      if (card.keywords.includes('delay') || noClaim(card)) return;
      for (const p of cells) out.push({ type: 'deploy', index, r: p.r, c: p.c });
    });
  }
  // Strikes (incl. ranged) and removal that clear the gate or its keeper.
  for (const x of scoredCandidates(snap)) {
    const a = x.action;
    if (a.type === 'move' || a.type === 'deploy') continue;
    const tgt = 'targetUid' in a && a.targetUid ? units(snap).find((u) => u.uid === a.targetUid) : undefined;
    if (!tgt || tgt.side === me) continue;
    if (manhattan(tgt.r, tgt.c, home.r, home.c) <= 1) out.push(a);
  }
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = actionKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Lethal search: a sequence of up to `depth` actions this rite that storms the
 * enemy stronghold or reaches 60 domination. Returns the plan or null.
 */
export function findLethal(st: EngineState, depth = 3, deadline = Infinity): AiAction[] | null {
  const me = st.side;
  // Domination: ending now (or after a painting step) reaches 60.
  const ended = apply(st, { type: 'end' });
  if (ended?.winner === me) return [{ type: 'end' }];
  const dfs = (cur: EngineState, left: number): AiAction[] | null => {
    if (left <= 0 || performance.now() > deadline) return null;
    for (const a of stormMoves(cur, left)) {
      const nx = apply(cur, a);
      if (!nx) continue;
      if (nx.winner === me) return [a];
      if (nx.winner) continue;
      const rest = dfs(nx, left - 1);
      if (rest) return [a, ...rest];
    }
    return null;
  };
  return dfs(st, depth);
}

/** Simulate the other chair's whole rite greedily (their hand is hidden). */
function simulateReply(st: EngineState, maxSteps = 10, endIt = true): EngineState {
  let cur = st;
  const avoid = new Set<string>();
  for (let i = 0; i < maxSteps && !cur.winner; i++) {
    const lethal = i === 0 ? findLethal(cur, 2) : null;
    const top = lethal ? [{ action: lethal[0], score: WIN }] : topCandidates(cur, 1, avoid);
    const pick = top[0]?.action ?? ({ type: 'end' } as AiAction);
    const nx = apply(cur, pick);
    if (!nx) {
      avoid.add(actionKey(pick));
      continue;
    }
    if (pick.type === 'end' && !endIt) return cur;
    cur = nx;
    if (pick.type === 'end') return cur;
  }
  if (!cur.winner && endIt) {
    const nx = apply(cur, { type: 'end' });
    if (nx) cur = nx;
  }
  return cur;
}

/**
 * The other chair plans its rite with a small beam (its own lethal first) and
 * picks what it likes best; returns the state at our next rite open.
 */
function plannedReply(st: EngineState, me: Side, deadline: number): EngineState {
  const them = st.side;
  const lethal = findLethal(st, 2);
  if (lethal) {
    let cur = st;
    for (const a of lethal) cur = apply(cur, a) ?? cur;
    if (cur.winner) return cur;
  }
  let beam: { st: EngineState; score: number }[] = [{ st, score: 0 }];
  let pick: { st: EngineState; score: number } | null = null;
  const offer = (end: EngineState) => {
    const v = end.winner ? (end.winner === them ? WIN : -WIN) : -evaluateState(end, me);
    if (!pick || v > pick.score) pick = { st: end, score: v };
  };
  for (let depth = 0; depth < 8 && beam.length; depth++) {
    const children: { st: EngineState; score: number }[] = [];
    for (const node of beam) {
      const ended = apply(node.st, { type: 'end' });
      if (ended) offer(ended);
      for (const c of topCandidates(node.st, 4)) {
        const nx = apply(node.st, c.action);
        if (!nx) continue;
        if (nx.winner) {
          offer(nx);
          continue;
        }
        children.push({ st: nx, score: evaluateState(nx, them) + c.score * 0.05 });
      }
    }
    if (performance.now() > deadline && pick) break;
    const seen = new Set<string>();
    beam = children
      .sort((a, b) => b.score - a.score)
      .filter((n) => {
        const k = sigOf(n.st);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3);
  }
  const chosen = pick as { st: EngineState; score: number } | null;
  return chosen ? chosen.st : simulateReply(st);
}

type Node = { st: EngineState; plan: PlanStep[]; score: number };

function sigOf(st: EngineState): string {
  return signature(snapshotFromState(st));
}

/**
 * Expert: lethal first, then a beam search over whole-rite plans on the real
 * rules engine. Each finished plan is scored after a simulated reply from the
 * other chair, so Expert guards the door, avoids losing trades it cannot see
 * through one action at a time, and sets up next rite's storm.
 */
function expertPick(s: AiSnapshot, opts: PickOptions): AiAction {
  const avoid = new Set(s.avoid ?? []);
  // Follow the cached plan while the board matches what we expected.
  if (planCache.length && avoid.size === 0 && planCache[0].sig === signature(s)) {
    const step = planCache.shift()!;
    const a = replayStep(s, step);
    if (a) return a;
  }
  planCache = [];
  const started = performance.now();
  const deadline = started + (opts.budgetMs ?? 650);
  let root: EngineState;
  try {
    root = stateFromSnapshot(s);
  } catch {
    return pickAiAction(s, 'experienced', { rand: () => 0.5 });
  }
  const me = s.side;

  // 1) Lethal: storm or 60 domination this rite.
  const lethal = findLethal(root, 3, started + (opts.budgetMs ?? 650) * 0.4);
  if (lethal && !avoid.has(actionKey(lethal[0]))) {
    let cur = root;
    const plan: PlanStep[] = [];
    for (const a of lethal) {
      plan.push(stepFor(cur, a));
      cur = apply(cur, a) ?? cur;
    }
    planCache = plan.slice(1);
    return lethal[0];
  }

  // 2) Beam search over this rite's plans.
  const BEAM = EXPERT_TUNING.beam;
  const MAX_DEPTH = EXPERT_TUNING.maxDepth;
  let beam: Node[] = [{ st: root, plan: [], score: 0 }];
  let best: { plan: PlanStep[]; score: number } | null = null;
  const finals: { plan: PlanStep[]; score: number; after: EngineState }[] = [];
  const finish = (n: Node, after: EngineState) => {
    let score: number;
    if (after.winner) score = after.winner === me ? WIN - n.plan.length : -WIN;
    else {
      let replied = simulateReply(after);
      if (replied.winner) {
        // Lost to the reply: still prefer the line that leaves us best placed.
        score = replied.winner === me ? WIN / 2 : -WIN + Math.max(-5000, Math.min(5000, evaluateState(after, me)));
      } else {
        if (EXPERT_TUNING.followUp) replied = simulateReply(replied, 10, false);
        score = evaluateState(replied, me);
        if (EXPERT_TUNING.secondReply && !replied.winner) {
          // Two rites out: does the other chair have a killing line then?
          const next = apply(replied, { type: 'end' });
          if (next && next.winner && next.winner !== me) score -= 6000;
          else if (next && !next.winner && findLethal(next, 2)) score -= EXPERT_TUNING.secondReply;
        }
      }
    }
    if (!best || score > best.score) best = { plan: n.plan, score };
    finals.push({ plan: n.plan, score, after });
    if (opts.debug) opts.debug.push(`${score.toFixed(1)} ${n.plan.map((p) => actionKey(p.action)).join(' > ')}`);
  };
  for (let depth = 0; depth < MAX_DEPTH && beam.length; depth++) {
    const children: Node[] = [];
    for (const node of beam) {
      if (performance.now() > deadline && best) break;
      // Ending here is always a plan.
      const endStep = stepFor(node.st, { type: 'end' });
      const ended = apply(node.st, { type: 'end' });
      if (ended) finish({ ...node, plan: [...node.plan, endStep] }, ended);
      if (depth === MAX_DEPTH - 1) continue;
      const cands = searchCandidates(node.st, depth === 0 ? avoid : undefined);
      for (const c of cands) {
        const nx = apply(node.st, c.action);
        if (!nx) continue;
        const plan = [...node.plan, stepFor(node.st, c.action)];
        if (nx.winner) {
          finish({ st: nx, plan, score: 0 }, nx);
          continue;
        }
        children.push({ st: nx, plan, score: evaluateState(nx, me) + c.score * 0.05 });
      }
    }
    if (performance.now() > deadline && best) break;
    const seen = new Set<string>();
    beam = children
      .sort((a, b) => b.score - a.score)
      .filter((n) => {
        const k = sigOf(n.st);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, BEAM);
  }
  let chosen = best as { plan: PlanStep[]; score: number } | null;
  // 3) Refine the leading plans against a *planned* reply (the other chair
  //    searching its own rite), not just a greedy one.
  if (EXPERT_TUNING.refine > 0 && chosen && chosen.score < WIN / 2) {
    const seen = new Set<string>();
    const top = finals
      .filter((f) => !f.after.winner)
      .sort((a, b) => b.score - a.score)
      .filter((f) => {
        const k = sigOf(f.after);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, EXPERT_TUNING.refine);
    let refined: { plan: PlanStep[]; score: number } | null = null;
    for (const f of top) {
      if (performance.now() > deadline && refined) break;
      const replied = plannedReply(f.after, me, deadline);
      let score: number;
      if (replied.winner) score = replied.winner === me ? WIN / 2 : -WIN + Math.max(-5000, Math.min(5000, f.score));
      else {
        const next = EXPERT_TUNING.followUp ? simulateReply(replied, 10, false) : replied;
        score = evaluateState(next, me);
      }
      // Blend with the greedy-reply score so one odd reply cannot dominate.
      score = score * 0.65 + f.score * 0.35;
      if (!refined || score > refined.score) refined = { plan: f.plan, score };
    }
    if (refined) chosen = refined;
  }
  if (!chosen || chosen.plan.length === 0) return pickAiAction(s, 'experienced', { rand: () => 0.5 });
  planCache = chosen.plan.slice(1);
  return chosen.plan[0].action;
}

/** Drop any cached Expert plan (new match / reload). */
export function resetAiPlan() {
  planCache = [];
}

// ── grok.me's original Expert (UCB rollouts) — kept as the sim benchmark ────

type RolloutStash = { hand: Card[]; loyalty: number };

function cloneSnap(s: AiSnapshot): AiSnapshot {
  return {
    side: s.side,
    tiles: s.tiles,
    control: s.control.map((row) => row.slice()),
    board: s.board.map((row) => row.map((u) => (u ? { ...u } : null))),
    hand: s.hand.slice(),
    discard: s.discard?.slice(),
    loyalty: s.loyalty,
    domination: s.domination ? { ...s.domination } : undefined,
    leader: s.leader,
    leaderUsed: s.leaderUsed,
    foeLoyalty: s.foeLoyalty,
    turn: s.turn,
    avoid: s.avoid ? [...s.avoid] : undefined,
  };
}

function findIn(s: AiSnapshot, uid: string): AiUnit | null {
  for (const row of s.board) for (const u of row) if (u?.uid === uid) return u;
  return null;
}

function lift(s: AiSnapshot, u: AiUnit) {
  if (s.board[u.r]?.[u.c]?.uid === u.uid) s.board[u.r][u.c] = null;
}

function stormsAt(s: AiSnapshot, r: number, c: number, side: Side): boolean {
  const t = s.tiles[r]?.[c];
  return !!t && isEnemyStronghold(t, side);
}

/** grok `Ze`: rollout evaluation in [-1, 1]. */
function rolloutValue(s: AiSnapshot, side: Side): number {
  const them = foeOf(side);
  const mine = strongholdOf(s.tiles, side);
  const theirs = strongholdOf(s.tiles, them);
  if (theirs) {
    const u = s.board[theirs.r][theirs.c];
    if (u?.side === side && !noClaim(u)) return 1;
  }
  if (mine) {
    const u = s.board[mine.r][mine.c];
    if (u?.side === them && !noClaim(u)) return -1;
    if (!u && units(s, them).some((f) => manhattan(f.r, f.c, mine.r, mine.c) === 1 && !noClaim(f))) return -0.92;
  }
  let a = 0;
  let b = 0;
  for (const u of units(s)) if (u.side === side) a += unitWorth(u);
  else b += unitWorth(u);
  let ca = 0;
  let cb = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (s.control[r][c] === side) ca += 1;
      else if (s.control[r][c] === them) cb += 1;
    }
  let reach = 0;
  if (theirs) {
    let d = 8;
    for (const u of units(s, side)) d = Math.min(d, manhattan(u.r, u.c, theirs.r, theirs.c));
    reach = (4 - Math.min(4, d)) / 10;
  }
  const v = ((a - b) / 90) * 0.55 + ((ca - cb) / 18) * 0.2 + reach;
  return Math.max(-0.85, Math.min(0.85, v));
}

/** grok `$e`: simplified apply used by the rollouts. */
function rolloutApply(s: AiSnapshot, a: AiAction, root: Side, stash: RolloutStash): Side | null {
  if (a.type === 'end') {
    if (s.side === root) {
      stash.hand = s.hand.slice();
      stash.loyalty = s.loyalty;
    }
    const next = foeOf(s.side);
    for (const u of units(s, next)) {
      u.sick = false;
      u.moved = false;
      u.attacked = false;
    }
    s.side = next;
    if (next === root) {
      s.hand = stash.hand.slice();
      s.loyalty = stash.loyalty;
    } else {
      s.hand = [];
      s.loyalty = 0;
    }
    return null;
  }
  if (a.type === 'move') {
    const u = findIn(s, a.uid);
    const t = s.tiles[a.r]?.[a.c];
    if (!u || u.side !== s.side || !t || t.kind === 'void' || s.board[a.r][a.c]) return null;
    s.board[u.r][u.c] = null;
    u.r = a.r;
    u.c = a.c;
    u.moved = true;
    s.board[a.r][a.c] = u;
    if (stormsAt(s, a.r, a.c, u.side) && !noClaim(u)) return u.side;
    if (isPaintable(t) && !noClaim(u)) s.control[a.r][a.c] = u.side;
    return null;
  }
  if (a.type === 'attack') {
    const atk = findIn(s, a.uid);
    const def = findIn(s, a.targetUid);
    if (!atk || !def || atk.side !== s.side || def.side === atk.side) return null;
    if (!strikable(atk, def)) return null;
    atk.attacked = true;
    const melee = manhattan(atk.r, atk.c, def.r, def.c) <= 1;
    const step = () => {
      s.board[atk.r][atk.c] = null;
      atk.r = def.r;
      atk.c = def.c;
      s.board[def.r][def.c] = atk;
    };
    if (hasKeyword(atk, 'banish') || hasKeyword(atk, 'veiled') || hasKeyword(atk, 'devour')) {
      lift(s, def);
      if (melee && !hasKeyword(atk, 'ranged')) {
        step();
        if (stormsAt(s, def.r, def.c, atk.side) && !noClaim(atk)) return atk.side;
        const t = s.tiles[def.r][def.c];
        if (t && isPaintable(t) && !noClaim(atk)) s.control[def.r][def.c] = atk.side;
      } else {
        const t = s.tiles[def.r][def.c];
        if (t && isPaintable(t)) s.control[def.r][def.c] = atk.side;
      }
      return null;
    }
    if (!melee) {
      const bonus = crown(s, atk.side, atk.r, atk.c);
      def.power -= blowOn(def.power, def.keywords, def.tough, atk.power + bonus);
      if (def.power <= 0) {
        lift(s, def);
        const t = s.tiles[def.r][def.c];
        if (t && isPaintable(t)) s.control[def.r][def.c] = atk.side;
      }
      return null;
    }
    const f = meleePreview(atk, def, s);
    atk.power = f.atkPower;
    def.power = f.defPower;
    if (f.attackerDestroyed) lift(s, atk);
    if (f.defenderDestroyed) {
      lift(s, def);
      if (!f.attackerDestroyed) {
        step();
        if (stormsAt(s, def.r, def.c, atk.side) && !noClaim(atk)) return atk.side;
        const t = s.tiles[def.r][def.c];
        if (t && isPaintable(t) && !noClaim(atk)) s.control[def.r][def.c] = atk.side;
      }
    }
    return null;
  }
  if (a.type === 'deploy') {
    const card = s.hand[a.index];
    if (!card || card.kind !== 'unit' || card.power == null || card.cost > s.loyalty || s.board[a.r][a.c]) return null;
    const slow = card.keywords.includes('delay') || units(s, foeOf(s.side)).some((f) => hasKeyword(f, 'chill'));
    let p = card.power;
    if (card.keywords.includes('warband')) p += units(s, s.side).length;
    s.loyalty -= card.cost;
    s.hand = s.hand.filter((_, i) => i !== a.index);
    s.board[a.r][a.c] = {
      uid: `mc-${a.index}-${a.r}-${a.c}-${p}`,
      side: s.side,
      power: p,
      maxPower: p,
      keywords: card.keywords,
      moved: slow,
      attacked: slow,
      sick: slow,
      r: a.r,
      c: a.c,
      cardId: card.id,
    };
    return null;
  }
  if (a.type === 'cast') {
    const card = s.hand[a.index];
    const eff = card?.effect;
    if (!card || !eff || card.cost > s.loyalty) return null;
    s.loyalty -= card.cost;
    s.hand = s.hand.filter((_, i) => i !== a.index);
    const n = eff.n ?? 0;
    const t = a.targetUid ? findIn(s, a.targetUid) : null;
    if (t && (eff.op === 'smite' || eff.op === 'trepan')) {
      t.power -= blowOn(t.power, t.keywords, t.tough, n);
      if (t.power <= 0) lift(s, t);
    } else if (t && (eff.op === 'destroy' || eff.op === 'bounce' || eff.op === 'destroy_refund')) lift(s, t);
    else if (t && eff.op === 'lock') {
      t.arrest = Math.max(t.arrest ?? 0, 2);
      t.moved = true;
    } else if (t && eff.op === 'empower') {
      t.power += n;
      t.maxPower = (t.maxPower ?? t.power) + n;
    } else if (t && eff.op === 'set_power') {
      t.power = n;
      if (t.power <= 0) lift(s, t);
    }
  }
  return null;
}

/** grok `et`: rollout policy choices. */
function rolloutChoices(s: AiSnapshot): AiAction[] {
  const avoid = new Set(s.avoid ?? []);
  const ranked = scoredCandidates(s)
    .filter((x) => !avoid.has(actionKey(x.action)))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [{ type: 'end' }];
  const out = ranked.slice(0, 3).map((x) => x.action);
  if (ranked[0].score < 14) out.push({ type: 'end' });
  return out;
}

/** grok `tt`: one 8-ply rollout. */
function rollout(s: AiSnapshot, root: Side, stash: RolloutStash, rand: () => number): number {
  for (let i = 0; i < 8; i++) {
    const v = rolloutValue(s, root);
    if (v >= 1 || v <= -0.9) return v;
    const ch = rolloutChoices(s);
    const x = rand();
    const a = ch.length > 1 && x < 0.22 ? ch[1] : ch.length > 2 && x > 0.93 ? ch[2] : ch[0];
    const w = rolloutApply(s, a, root, stash);
    if (w) return w === root ? 1 : -1;
  }
  return rolloutValue(s, root);
}

/** grok `nt`: UCB over the top 7 actions, 40 rollouts. */
function grokUcb(s: AiSnapshot, ranked: Scored[]): AiAction {
  const arms = ranked
    .filter((x) => x.score > -8)
    .slice(0, 7)
    .map((x) => ({ action: x.action, prior: x.score, sum: 0, n: 0 }));
  if (!arms.some((x) => x.action.type === 'end')) arms.push({ action: { type: 'end' }, prior: 0, sum: 0, n: 0 });
  let seed = 17;
  for (const u of units(s)) seed = (seed + u.power * 13 + u.r * 3 + u.c) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stash = { hand: s.hand.slice(), loyalty: s.loyalty };
  for (let i = 0; i < 40; i++) {
    let arm = arms[0];
    let top = -Infinity;
    for (const x of arms) {
      const v = (x.n === 0 ? 2 : x.sum / x.n) + 0.85 * (x.n === 0 ? 2 : Math.sqrt(Math.log(i + 1) / x.n)) + x.prior * 4e-4;
      if (v > top) {
        top = v;
        arm = x;
      }
    }
    const sim = cloneSnap(s);
    const st = { hand: stash.hand.slice(), loyalty: stash.loyalty };
    const w = rolloutApply(sim, arm.action, s.side, st);
    const v = w ? (w === s.side ? 1 : -1) : rollout(sim, s.side, st, rand);
    arm.sum += v;
    arm.n += 1;
  }
  let pick = arms[0];
  let top = -Infinity;
  for (const x of arms) {
    const v = (x.n ? x.sum / x.n : -1) + Math.max(-0.2, Math.min(0.45, x.prior / 220));
    if (v > top) {
      top = v;
      pick = x;
    }
  }
  return pick.action;
}

/**
 * Justin's grok.me Expert exactly as shipped there (heuristics + UCB rollouts).
 * Not offered in the UI any more — the Vercel Expert is built on top of it —
 * but kept so sims can prove the new Expert beats it.
 */
export function pickGrokExpertAction(s: AiSnapshot): AiAction {
  const ranked = rankedFor(s, 'expert');
  if (ranked.length === 0) return { type: 'end' };
  const top = ranked[0];
  if (top.score >= 500 || top.action.type === 'cast' || top.action.type === 'leader' || top.action.type === 'act')
    return top.action;
  return grokUcb(s, ranked);
}
