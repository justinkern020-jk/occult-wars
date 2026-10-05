/**
 * Board rules engine for keyword mechanics (ported from occultwar.grok.me,
 * Oct 2026 build). Operates on plain board snapshots and on EffectCtx so
 * Battlefield (player + AI) share one resolver.
 *
 * Covers: Root, Airship (leak + muster beside), Tax, Seep, Poll, Sprout,
 * Blooded, Glory / Bloom, Toll, Deed, Canvass, Graze, Unclaiming / Veiled
 * (no conquest), Banish, Devour, Reap, Arrest, Lamp (crown) strike bonus,
 * straight-line ranged strikes, and kill-then-advance melee.
 */

import { applyDamage, combatantFrom, resolveMelee } from './combat';
import { isPaintable, paintTile } from './control';
import { destroyUnit, type EffectCtx, type EffectUnit } from './effects';
import { canBeStruck, hasKeyword, manhattan } from './keywords';
import { tileLogName, type Side, type Tile } from './maps';
import { applyBank, type ControlGrid } from './scoring';
import { cardById } from '../data/catalog';
import type { Card } from './types';

/**
 * Every card keyword the engine implements, and where:
 * combat (combat.ts / keywords.ts), strike (resolveStrike), deploy
 * (Battlefield deployTo / engine), rite open / end (riteOpenUpkeep,
 * bankFromHoldings, sproutAtRiteEnd, pollBonus), death (effects destroyUnit).
 * The card audit test asserts every printed keyword is listed here.
 */
export const HANDLED_KEYWORDS: ReadonlySet<string> = new Set([
  // combat timing / damage
  'fast', 'slow', 'tough', 'ranged', 'shutter', 'veiled', 'crown',
  // strike outcomes
  'blooded', 'sprout', 'reap', 'devour', 'banish', 'arrest',
  // movement / conquest
  'root', 'unclaiming', 'airship', 'glory', 'bloom', 'toll', 'deed', 'canvass', 'graze',
  // deploy
  'delay', 'chill', 'warband', 'berserk', 'charm', 'scandal', 'relay',
  // rite open / end
  'tithe', 'tithe2', 'hearth', 'tax', 'seep', 'gills', 'poll',
  // death
  'salvage', 'mourner',
  // flavour / presentation (no rule beyond the sighting & siren)
  'cryptid', 'gas', 'token',
]);

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Minimal board-unit shape the engine needs (matches Battlefield BoardUnit). */
export type RulesUnit = {
  uid: string;
  cardId: string;
  name: string;
  side: Side;
  power: number;
  maxPower: number;
  loyalty: number;
  keywords: string[];
  moved?: boolean;
  attacked?: boolean;
  sick?: boolean;
  tough?: boolean;
  fast?: boolean;
  shutter?: boolean;
  silenced?: boolean;
  powder?: boolean;
  used?: boolean;
  once?: boolean;
  arrest?: number;
  /** Lasting power earned in play (coin marker). */
  gained?: number;
  pendingGain?: number;
};

export type RulesBoard<U extends RulesUnit = RulesUnit> = (U | null)[][];

function foeOf(side: Side): Side {
  return side === 'blue' ? 'red' : 'blue';
}

/** Unclaiming or Veiled: crosses ground without conquering it. */
export function leavesUnclaimed(u: { keywords: string[] }): boolean {
  return hasKeyword(u, 'unclaiming') || hasKeyword(u, 'veiled');
}

/** Root: an adjacent enemy Root unit pins this square (no move, no strike). */
export function isRootedOnBoard(
  board: RulesBoard,
  side: Side,
  r: number,
  c: number,
): boolean {
  for (const [dr, dc] of ORTHO) {
    const u = board[r + dr]?.[c + dc];
    if (u && u.side !== side && hasKeyword(u, 'root')) return true;
  }
  return false;
}

/** True if `side` has an Airship adjacent to (r, c) — muster beside it. */
export function airshipBeside(
  board: RulesBoard,
  side: Side,
  r: number,
  c: number,
): boolean {
  for (const [dr, dc] of ORTHO) {
    const u = board[r + dr]?.[c + dc];
    if (u && u.side === side && hasKeyword(u, 'airship')) return true;
  }
  return false;
}

/** Hoarfrost-style Chill: enemy units muster exhausted while a chill unit stands. */
export function chillActive(board: RulesBoard, musteringSide: Side): boolean {
  return board.some((row) =>
    row.some((u) => !!u && u.side !== musteringSide && hasKeyword(u, 'chill')),
  );
}

/** Adjacent allied Lamp (crown) units add +1 strike Power each. */
export function crownBonusOnBoard(
  board: RulesBoard,
  side: Side,
  r: number,
  c: number,
): number {
  let n = 0;
  for (const [dr, dc] of ORTHO) {
    const u = board[r + dr]?.[c + dc];
    if (u && u.side === side && hasKeyword(u, 'crown')) n += 1;
  }
  return n;
}

/**
 * Rite open refresh for one unit. Units of the opening side clear their
 * exhaustion — except a unit locked by a foe (powder), which stays exhausted
 * for this rite and clears next time.
 */
export function refreshForRite<U extends RulesUnit>(u: U, opening: Side): U {
  if (u.side !== opening) return u;
  if (u.powder) {
    return { ...u, sick: true, moved: true, attacked: true, powder: false, used: false };
  }
  return { ...u, sick: false, moved: false, attacked: false, powder: false, used: false };
}

/** Sprout: at the end of its own rite, a standing sprout unit gains +1 power. */
export function sproutAtRiteEnd<U extends RulesUnit>(
  board: RulesBoard<U>,
  side: Side,
): { board: RulesBoard<U>; notes: string[] } {
  const notes: string[] = [];
  let changed = false;
  const next = board.map((row) =>
    row.map((u) => {
      if (!u || u.side !== side || !hasKeyword(u, 'sprout')) return u;
      changed = true;
      const grown = {
        ...u,
        power: u.power + 1,
        maxPower: u.maxPower + 1,
        gained: (u.gained ?? 0) + 1,
      };
      notes.push(`${grown.name} survives the rite and gains +1 power. Power is now ${grown.power}.`);
      return grown;
    }),
  );
  return { board: changed ? next : board, notes };
}

export type RiteHurt = { uid: string; r: number; c: number; damage: number };

/**
 * Start-of-rite upkeep for `side`: Airships leak 1, Tax units take 2
 * resources or sit unpaid, Seep units deal 1 to each adjacent enemy
 * (Undine refuse it). Units at 0 are cleaned up by the caller.
 */
export function riteOpenUpkeep<U extends RulesUnit>(
  board: RulesBoard<U>,
  side: Side,
  bank: number,
): { board: RulesBoard<U>; loyalty: number; notes: string[]; hurts: RiteHurt[] } {
  const notes: string[] = [];
  const hurts: RiteHurt[] = [];
  const b = board.map((row) => row.map((u) => (u ? { ...u } : null)));
  let loyalty = bank;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = b[r][c];
      if (!u || u.side !== side || !hasKeyword(u, 'airship')) continue;
      const soak = hasKeyword(u, 'tough') || u.tough ? 1 : 0;
      const dmg = Math.max(0, 1 - soak);
      u.power -= dmg;
      if (dmg > 0) hurts.push({ uid: u.uid, r, c, damage: dmg });
      notes.push(`${u.name} leaks ${dmg} from the envelope.`);
    }
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = b[r][c];
      if (!u || u.side !== side || !hasKeyword(u, 'tax')) continue;
      if (loyalty >= 2) {
        loyalty -= 2;
        notes.push(`${u.name} takes 2 resources to stay in the rite.`);
      } else {
        u.sick = true;
        u.moved = true;
        u.attacked = true;
        notes.push(`${u.name} is unpaid and cannot act.`);
      }
    }
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = b[r][c];
      if (!u || u.side !== side || !hasKeyword(u, 'seep')) continue;
      for (const [dr, dc] of ORTHO) {
        const t = b[r + dr]?.[c + dc];
        if (!t || t.side === side || hasKeyword(t, 'gills')) continue;
        const soak = hasKeyword(t, 'tough') || t.tough ? 1 : 0;
        const dmg = Math.max(0, 1 - soak);
        t.power -= dmg;
        if (dmg > 0) hurts.push({ uid: t.uid, r: r + dr, c: c + dc, damage: dmg });
        notes.push(`${u.name} seeps ${dmg} into ${t.name}.`);
      }
    }
  return { board: b as RulesBoard<U>, loyalty, notes, hurts };
}

/** Poll: +1 domination per poll unit standing on a circle its side holds. */
export function pollBonus(board: RulesBoard, control: ControlGrid, side: Side): number {
  let n = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = board[r][c];
      if (u && u.side === side && hasKeyword(u, 'poll') && control[r]?.[c] === side) n += 1;
    }
  return n;
}

export type ConquestResult = {
  control: ControlGrid;
  power: number;
  maxPower: number;
  bank: number;
  domination: number;
  notes: string[];
};

/**
 * Conquest triggers when `unit` takes a new circle at (r, c):
 * Glory / Bloom (+1 power), Toll (bank 1), Deed (+1 domination),
 * Canvass (a street: also claim one adjacent neutral street).
 */
export function conquestTriggers(
  unit: RulesUnit,
  tiles: Tile[][],
  control: ControlGrid,
  r: number,
  c: number,
): ConquestResult {
  const notes: string[] = [];
  let power = unit.power;
  let maxPower = unit.maxPower;
  let bank = 0;
  let domination = 0;
  const ctrl = control.map((row) => [...row]);
  const tile = tiles[r]?.[c];
  if (hasKeyword(unit, 'glory') || hasKeyword(unit, 'bloom')) {
    power += 1;
    maxPower += 1;
    notes.push(`${unit.name} conquers and gains +1 power.`);
  }
  if (hasKeyword(unit, 'toll')) {
    bank += 1;
    notes.push(`${unit.name} conquers and banks 1.`);
  }
  if (hasKeyword(unit, 'deed')) {
    domination += 1;
    notes.push(`${unit.name} writes the deed.`);
  }
  if (tile?.kind === 'street' && hasKeyword(unit, 'canvass')) {
    for (const [dr, dc] of ORTHO) {
      const rr = r + dr;
      const cc = c + dc;
      const t = tiles[rr]?.[cc];
      if (t && t.kind === 'street' && !ctrl[rr]?.[cc]) {
        ctrl[rr][cc] = unit.side;
        notes.push(`${unit.name} canvasses the next street.`);
        break;
      }
    }
  }
  return { control: ctrl, power, maxPower, bank, domination, notes };
}

/** Graze: after it moves, adjacent enemy-held circles become neutral (strongholds spared). */
export function grazeAfterMove(
  unit: RulesUnit,
  tiles: Tile[][],
  control: ControlGrid,
  r: number,
  c: number,
): { control: ControlGrid; notes: string[] } {
  if (!hasKeyword(unit, 'graze')) return { control, notes: [] };
  const ctrl = control.map((row) => [...row]);
  const notes: string[] = [];
  const enemy = foeOf(unit.side);
  for (const [dr, dc] of ORTHO) {
    const rr = r + dr;
    const cc = c + dc;
    const t = tiles[rr]?.[cc];
    if (t && t.kind !== 'void' && t.kind !== 'stronghold' && ctrl[rr]?.[cc] === enemy) {
      ctrl[rr][cc] = null;
      notes.push(`${unit.name} eats the claim beside it.`);
    }
  }
  return { control: ctrl, notes };
}

// ─── EffectCtx-level strike resolver ──────────────────────────────────────

function findPos(ctx: EffectCtx, uid: string): { r: number; c: number } | null {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) if (ctx.board[r][c] === uid) return { r, c };
  return null;
}

function log(ctx: EffectCtx, msg: string) {
  ctx.log.push(msg);
}

function pip(ctx: EffectCtx, uid: string, dmg: number) {
  if (dmg <= 0) return;
  const pos = findPos(ctx, uid);
  if (!pos) return;
  const pips = (ctx.pips ??= []);
  pips.push({ id: `${uid}-${pips.length}-${dmg}`, uid, r: pos.r, c: pos.c, text: `-${dmg}` });
}

function ctxRooted(ctx: EffectCtx, side: Side, r: number, c: number): boolean {
  for (const [dr, dc] of ORTHO) {
    const id = ctx.board[r + dr]?.[c + dc];
    const u = id ? ctx.units[id] : undefined;
    if (u && u.side !== side && hasKeyword(u, 'root')) return true;
  }
  return false;
}

function ctxCrown(ctx: EffectCtx, side: Side, r: number, c: number): number {
  let n = 0;
  for (const [dr, dc] of ORTHO) {
    const id = ctx.board[r + dr]?.[c + dc];
    const u = id ? ctx.units[id] : undefined;
    if (u && u.side === side && hasKeyword(u, 'crown')) n += 1;
  }
  return n;
}

/** Discard a random card from `side`'s hand (Devour). */
function discardRandom(ctx: EffectCtx, side: Side): Card | null {
  const h = ctx.hand[side];
  if (h.length === 0) return null;
  const i = Math.floor(Math.random() * h.length);
  const [card] = h.splice(i, 1);
  if (card) ctx.discard[side].push(card);
  return card ?? null;
}

/** Banish: return a unit to its owner's hand (discard if the hand is full). */
function returnToHand(ctx: EffectCtx, uid: string) {
  const u = ctx.units[uid];
  if (!u) return;
  const pos = findPos(ctx, uid);
  if (pos) ctx.board[pos.r][pos.c] = null;
  const def = cardById(u.cardId);
  const card: Card = def
    ? { ...def }
    : {
        id: u.cardId,
        name: u.name,
        faction: '',
        kind: 'unit',
        rarity: 'common',
        cost: u.loyalty,
        oath: 0,
        power: u.maxPower,
        keywords: [...u.keywords],
        text: '',
      };
  delete ctx.units[uid];
  if (ctx.hand[u.side].length < 7) ctx.hand[u.side].push(card);
  else ctx.discard[u.side].push(card);
}

/** Reap: when its strike destroys a unit, score 2 domination. */
function reapIfKilled(ctx: EffectCtx, killer: EffectUnit | undefined, victimUid: string) {
  if (killer && ctx.units[killer.uid] && !ctx.units[victimUid] && hasKeyword(killer, 'reap')) {
    ctx.domination[killer.side] += 2;
    log(ctx, `${killer.name} reaps 2 domination.`);
  }
}

function addPending(u: EffectUnit, n: number) {
  if (n > 0) u.pendingGain = (u.pendingGain ?? 0) + n;
}

/**
 * Cards whose Blooded is the measured form: every time it strikes and
 * survives, power is what it has left after damage +1 (max power +1), with
 * no cap. Every other Blooded card keeps the classic form (pre-fight +2).
 */
export const MEASURED_BLOODED: ReadonlySet<string> = new Set(['sleepy_hollow_rider']);

/**
 * Power / max power after Blooded fires on a unit that struck and survived.
 * `u.power` is its power left after the fight; `powerBefore` is pre-fight.
 */
export function bloodedResult(
  u: { cardId?: string; power: number; maxPower?: number },
  powerBefore: number,
): { power: number; maxPower: number } {
  if (!u.cardId || !MEASURED_BLOODED.has(u.cardId)) {
    return { power: powerBefore + 2, maxPower: powerBefore + 2 };
  }
  const maxBefore = u.maxPower ?? powerBefore;
  const power = u.power + 1;
  return { power, maxPower: Math.max(maxBefore + 1, power) };
}

/**
 * After a fight: Blooded (struck and survived → pre-fight power +2, or for
 * measured Blooded, remaining power +1) and Sprout (survived a battle → +1).
 */
function afterBattleGrowth(
  ctx: EffectCtx,
  u: EffectUnit | undefined,
  powerBefore: number,
  struck: boolean,
) {
  if (!u || !ctx.units[u.uid]) return;
  let gain = 0;
  if (struck && hasKeyword(u, 'blooded')) {
    const measured = MEASURED_BLOODED.has(u.cardId);
    const prevMax = u.maxPower;
    const next = bloodedResult(u, powerBefore);
    u.power = next.power;
    u.maxPower = next.maxPower;
    gain += measured ? Math.max(0, next.maxPower - prevMax) : 2;
    log(
      ctx,
      `${u.name} is still standing and gains +${measured ? 1 : 2} power. Power is now ${next.power}.`,
    );
  }
  if (hasKeyword(u, 'sprout')) {
    u.power += 1;
    u.maxPower += 1;
    gain += 1;
    log(ctx, `${u.name} survives the battle and gains +1 power.`);
  }
  addPending(u, gain);
}

export type AdvanceResult = { stronghold: boolean; conquered: boolean };

/** Graze after a step, applied on ctx. */
function grazeCtx(ctx: EffectCtx, tiles: Tile[][], u: EffectUnit, r: number, c: number) {
  const g = grazeAfterMove(u, tiles, ctx.control, r, c);
  ctx.control = g.control;
  g.notes.forEach((n) => log(ctx, n));
}

/** Attacker steps into the emptied circle after a melee kill. */
function advanceInto(
  ctx: EffectCtx,
  tiles: Tile[][],
  u: EffectUnit,
  from: { r: number; c: number },
  r: number,
  c: number,
): AdvanceResult {
  if (!ctx.units[u.uid]) return { stronghold: false, conquered: false };
  if ((u.arrest ?? 0) > 0) {
    u.moved = true;
    u.attacked = true;
    log(ctx, `${u.name} is arrested and holds its ground.`);
    return { stronghold: false, conquered: false };
  }
  ctx.board[from.r][from.c] = null;
  if (ctx.board[r][c]) return { stronghold: false, conquered: false };
  ctx.board[r][c] = u.uid;
  u.moved = true;
  u.attacked = true;
  const tile = tiles[r]?.[c];
  if (!tile) return { stronghold: false, conquered: false };
  if (tile.kind === 'stronghold' && tile.home && tile.home !== u.side) {
    if (leavesUnclaimed(u)) {
      log(ctx, `${u.name} crosses the stronghold and leaves it unclaimed.`);
      grazeCtx(ctx, tiles, u, r, c);
      return { stronghold: false, conquered: false };
    }
    ctx.control[r][c] = u.side;
    log(ctx, `${u.name} seizes the enemy stronghold. The hour is over.`);
    return { stronghold: true, conquered: true };
  }
  if (leavesUnclaimed(u)) {
    log(ctx, `${u.name} crosses the ${tileLogName(tile)} and leaves it unclaimed.`);
    grazeCtx(ctx, tiles, u, r, c);
    return { stronghold: false, conquered: false };
  }
  const prev = ctx.control[r][c];
  let conquered = false;
  if (isPaintable(tile)) {
    ctx.control = paintTile(ctx.control, tiles, r, c, u.side);
    conquered = prev !== u.side;
    if (conquered) {
      const t = conquestTriggers(u, tiles, ctx.control, r, c);
      ctx.control = t.control;
      const grew = Math.max(0, t.maxPower - u.maxPower);
      u.power = t.power;
      u.maxPower = t.maxPower;
      addPending(u, grew);
      if (t.bank > 0) ctx.loyalty[u.side] = applyBank(ctx.loyalty[u.side], t.bank);
      if (t.domination > 0) ctx.domination[u.side] += t.domination;
      log(ctx, `${u.name} conquers the ${tileLogName(tile)}.`);
      t.notes.forEach((n) => log(ctx, n));
    } else {
      log(ctx, `${u.name} takes the ${tileLogName(tile)}.`);
    }
  } else {
    log(ctx, `${u.name} advances.`);
  }
  grazeCtx(ctx, tiles, u, r, c);
  return { stronghold: false, conquered };
}

/** A ranged kill claims the emptied circle from a distance (shooter stays put). */
function claimFromRange(
  ctx: EffectCtx,
  tiles: Tile[][],
  u: EffectUnit,
  r: number,
  c: number,
): boolean {
  if (!ctx.units[u.uid] || leavesUnclaimed(u) || ctx.board[r]?.[c]) return false;
  const tile = tiles[r]?.[c];
  if (!tile || tile.kind === 'void' || tile.kind === 'stronghold' || !isPaintable(tile)) return false;
  const prev = ctx.control[r][c];
  ctx.control = paintTile(ctx.control, tiles, r, c, u.side);
  if (prev === u.side) return false;
  const t = conquestTriggers(u, tiles, ctx.control, r, c);
  ctx.control = t.control;
  u.power = t.power;
  u.maxPower = t.maxPower;
  if (t.bank > 0) ctx.loyalty[u.side] = applyBank(ctx.loyalty[u.side], t.bank);
  if (t.domination > 0) ctx.domination[u.side] += t.domination;
  log(ctx, `${u.name} conquers the ${tileLogName(tile)}.`);
  t.notes.forEach((n) => log(ctx, n));
  return true;
}

export type StrikeSlide = {
  unit: EffectUnit;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
};

export type StrikeOutcome = {
  error: string | null;
  stronghold: boolean;
  ranged: boolean;
  conquered: { r: number; c: number } | null;
  slide: StrikeSlide | null;
};

function outcome(error: string | null, extra?: Partial<StrikeOutcome>): StrikeOutcome {
  return { error, stronghold: false, ranged: false, conquered: null, slide: null, ...extra };
}

/** Remove every unit at 0 power (after upkeep / poison). */
export function cleanupDead(ctx: EffectCtx) {
  const dead = Object.values(ctx.units)
    .filter((u) => u.power <= 0)
    .map((u) => u.uid);
  for (const id of dead) destroyUnit(ctx, id);
}

/**
 * Resolve a strike by `atkUid` on the unit at (r, c). Mutates ctx.
 * Melee: simultaneous / Fast / Slow trade; a surviving attacker that kills
 * steps into the circle (and may conquer or storm). Ranged (straight line,
 * 2 circles): unanswered; a kill claims the circle from range.
 */
export function resolveStrike(
  ctx: EffectCtx,
  tiles: Tile[][],
  atkUid: string,
  r: number,
  c: number,
): StrikeOutcome {
  const atk = ctx.units[atkUid];
  const defId = ctx.board[r]?.[c];
  const def = defId ? ctx.units[defId] : undefined;
  const from = findPos(ctx, atkUid);
  if (!atk || !def || !from) return outcome('Nothing there to strike.');
  if (atk.sick || atk.moved || atk.attacked) return outcome(`${atk.name} cannot act.`);
  // Arrest (card text): "cannot move for its next two turns" — an arrested
  // unit may still strike, but it does not step forward after a kill.
  if (ctxRooted(ctx, atk.side, from.r, from.c)) {
    return outcome(`${atk.name} is rooted and cannot move or strike.`);
  }
  if (def.side === atk.side) return outcome('That foe cannot be struck (out of reach, behind Shutter, or Untargetable).');
  const dist = manhattan(from.r, from.c, r, c);
  if (dist > 1 && from.r !== r && from.c !== c) {
    return outcome('Ranged strikes do not shoot on a diagonal.');
  }
  if (!canBeStruck(atk, def, dist, from, { r, c })) {
    return outcome('That foe cannot be struck (out of reach, behind Shutter, or Untargetable).');
  }
  const ranged = dist > 1 && hasKeyword(atk, 'ranged');
  const slideOf = (): StrikeSlide | null => {
    const u = ctx.units[atk.uid];
    if (!u) return null;
    const now = findPos(ctx, atk.uid);
    if (!now || (now.r === from.r && now.c === from.c)) return null;
    return { unit: { ...u }, fromR: from.r, fromC: from.c, toR: now.r, toC: now.c };
  };

  // Banish (or a Veiled striker): the defender returns to its owner's hand.
  if (hasKeyword(atk, 'banish') || hasKeyword(atk, 'veiled')) {
    const name = def.name;
    returnToHand(ctx, def.uid);
    atk.moved = true;
    atk.attacked = true;
    log(ctx, `${atk.name} returns ${name} to its owner's hand.`);
    if (ranged) {
      return outcome(null, {
        ranged: true,
        conquered: claimFromRange(ctx, tiles, atk, r, c) ? { r, c } : null,
      });
    }
    const adv = advanceInto(ctx, tiles, atk, from, r, c);
    return outcome(null, {
      stronghold: adv.stronghold,
      conquered: adv.conquered ? { r, c } : null,
      slide: slideOf(),
    });
  }

  // Devour: whatever meets it in combat is unmade; that owner discards.
  // A ranged shot never meets it (unanswered), so it resolves as a shot.
  if (hasKeyword(atk, 'devour') || (hasKeyword(def, 'devour') && !ranged)) {
    atk.moved = true;
    atk.attacked = true;
    if (hasKeyword(atk, 'devour')) {
      const owner = def.side;
      destroyUnit(ctx, def.uid);
      reapIfKilled(ctx, ctx.units[atk.uid], def.uid);
      const lost = discardRandom(ctx, owner);
      log(
        ctx,
        lost
          ? `${atk.name} unmakes what it touches. ${lost.name} is discarded.`
          : `${atk.name} unmakes what it touches. The hand was empty.`,
      );
    }
    if (hasKeyword(def, 'devour') && ctx.units[atk.uid]) {
      const lost = discardRandom(ctx, atk.side);
      destroyUnit(ctx, atk.uid);
      log(
        ctx,
        lost
          ? `${def.name} unmakes what stepped into it. ${lost.name} is discarded.`
          : `${def.name} unmakes what stepped into it.`,
      );
    }
    if (ctx.units[atk.uid] && !ctx.units[def.uid]) {
      const adv = advanceInto(ctx, tiles, atk, from, r, c);
      return outcome(null, {
        stronghold: adv.stronghold,
        conquered: adv.conquered ? { r, c } : null,
        slide: slideOf(),
      });
    }
    return outcome(null);
  }

  const atkBefore = atk.power;
  const defBefore = def.power;
  const atkBonus = ctxCrown(ctx, atk.side, from.r, from.c);
  const defBonus = ctxCrown(ctx, def.side, r, c);

  if (ranged) {
    const target = combatantFrom({
      id: def.uid,
      name: def.name,
      power: def.power,
      keywords: def.keywords,
      tough: def.tough,
    });
    const dmg = applyDamage(target, atk.power + atkBonus);
    def.power = Math.max(0, target.power);
    pip(ctx, def.uid, dmg);
    atk.moved = true;
    atk.attacked = true;
    log(ctx, `Ranged: ${atk.name} strikes ${def.name} for ${dmg} from ${dist} away.`);
    if (def.power > 0 && def.power < defBefore && hasKeyword(atk, 'arrest')) {
      def.arrest = 2;
      log(ctx, `${def.name} is arrested and cannot move for two turns.`);
    }
    const killed = def.power <= 0;
    if (killed) destroyUnit(ctx, def.uid);
    reapIfKilled(ctx, ctx.units[atk.uid], def.uid);
    afterBattleGrowth(ctx, ctx.units[atk.uid], atkBefore, true);
    afterBattleGrowth(ctx, ctx.units[def.uid], defBefore, false);
    let conquered = false;
    if (killed && ctx.units[atk.uid]) {
      conquered = claimFromRange(ctx, tiles, ctx.units[atk.uid], r, c);
    } else if (!killed && ctx.units[def.uid]) {
      const t = tiles[r]?.[c];
      if (t) log(ctx, `${def.name} holds the ${tileLogName(t)}.`);
    }
    return outcome(null, { ranged: true, conquered: conquered ? { r, c } : null });
  }

  const fight = resolveMelee(
    combatantFrom({
      id: atk.uid,
      name: atk.name,
      power: atk.power,
      keywords: atk.keywords,
      tough: atk.tough,
      fast: atk.fast,
      strikeBonus: atkBonus,
    }),
    combatantFrom({
      id: def.uid,
      name: def.name,
      power: def.power,
      keywords: def.keywords,
      tough: def.tough,
      fast: def.fast,
      strikeBonus: defBonus,
    }),
  );
  atk.power = Math.max(0, fight.attacker.power);
  def.power = Math.max(0, fight.defender.power);
  pip(ctx, def.uid, fight.dmgToDef);
  pip(ctx, atk.uid, fight.dmgToAtk);
  fight.log.forEach((l) => log(ctx, l));
  if (def.power > 0 && def.power < defBefore && hasKeyword(atk, 'arrest') && ctx.units[atk.uid]) {
    def.arrest = 2;
    log(ctx, `${def.name} is arrested and cannot move for two turns.`);
  }
  const defDead = def.power <= 0;
  const atkDead = atk.power <= 0;
  if (defDead) destroyUnit(ctx, def.uid);
  if (atkDead && ctx.units[atk.uid]) destroyUnit(ctx, atk.uid);
  reapIfKilled(ctx, ctx.units[atk.uid], def.uid);
  const a = ctx.units[atk.uid];
  const d = ctx.units[def.uid];
  if (a && !d) {
    const adv = advanceInto(ctx, tiles, a, from, r, c);
    afterBattleGrowth(ctx, ctx.units[atk.uid], atkBefore, true);
    return outcome(null, {
      stronghold: adv.stronghold,
      conquered: adv.conquered ? { r, c } : null,
      slide: slideOf(),
    });
  }
  if (a) {
    a.attacked = true;
    a.moved = true;
  }
  afterBattleGrowth(ctx, ctx.units[atk.uid], atkBefore, true);
  afterBattleGrowth(ctx, d, defBefore, true);
  if (d) {
    const t = tiles[r]?.[c];
    if (t) log(ctx, `${d.name} holds the ${tileLogName(t)}.`);
  }
  return outcome(null);
}

/** Muster-time triggers flags for a unit card entering play. */
export function musterPower(card: Card, board: RulesBoard, side: Side): number {
  let p = card.power ?? 0;
  if (hasKeyword(card, 'warband')) {
    p += board.reduce((n, row) => n + row.filter((u) => !!u && u.side === side).length, 0);
  }
  return p;
}
