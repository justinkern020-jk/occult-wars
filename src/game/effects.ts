/**
 * Rite / device / leader effect ops (Cabals dual-Power port of grok Ot / Mt).
 * Pure-ish helpers operate on mutable EffectCtx snapshots used by Battlefield.
 */

import { applyDamage, isDestroyed } from './combat';
import { hasKeyword, manhattan } from './keywords';
import { cardById } from '../data/catalog';
import { LOYALTY_CAP, HAND_CAP, applyBank } from './scoring';
import type { Side, Tile } from './maps';
import type { ActSpec, Card } from './types';

export type EffectUnit = {
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
  /** Slow muster / lock — cannot act this rite. */
  sick?: boolean;
  tough?: boolean;
  fast?: boolean;
  shutter?: boolean;
  silenced?: boolean;
  powder?: boolean;
  /** Once-each-rite activated ability already called. */
  used?: boolean;
  /** Once-in-a-sitting activated ability already called. */
  once?: boolean;
  arrest?: number;
  /** Power earned this rite by effects (shown as a lasting +N on the coin). */
  pendingGain?: number;
  /** Lasting power earned in play (Battlefield coin marker). */
  gained?: number;
  /** Enemy spells and leader powers cannot choose this unit (sitting). */
  warded?: boolean;
  /** Next lethal blow this sitting leaves it at 1 power instead (once). */
  lastStand?: boolean;
  /** May storm / must strike an adjacent enemy stronghold this turn. */
  breach?: boolean;
  /** This activation must attack an adjacent enemy if able. */
  mustStrike?: boolean;
};

/** Floating damage pip (e.g. "-2") emitted by effect damage. */
export type DamagePip = { id: string; uid?: string; r: number; c: number; text: string };

export type EffectCtx = {
  side: Side;
  loyalty: { blue: number; red: number };
  domination: { blue: number; red: number };
  hand: { blue: Card[]; red: Card[] };
  deck: { blue: Card[]; red: Card[] };
  discard: { blue: Card[]; red: Card[] };
  /** Sparse unit map by uid. */
  units: Record<string, EffectUnit>;
  /** 5×5 of uid | null */
  board: (string | null)[][];
  control: (Side | null)[][];
  log: string[];
  /**
   * Lingering field poison: damage applied once at the next rite open.
   * Set by field_poison; consumed by applyPendingFieldPoison.
   */
  fieldPoisonDamage?: number;
  /**
   * Remaining rite-opens that skip Resource banking (2 ≈ one full turn for both chairs).
   * Set by no_bank; decremented when a rite open would bank.
   */
  noBankOpens?: number;
  /** Board tiles (for slide/shove legality and claims). Optional for tests. */
  tiles?: Tile[][];
  /** Damage pips emitted while resolving (for floating -N numbers). */
  pips?: DamagePip[];
  /**
   * Until-end-of-turn auras from leader workings. Each openRite decrements
   * the opens counter (2 ≈ one full turn for both chairs), then clears.
   */
  iconHarvestSide?: Side;
  iconHarvestOpens?: number;
  deathTitheSide?: Side;
  deathTitheOpens?: number;
};

export type AimPos = { r: number; c: number };

function foe(side: Side): Side {
  return side === 'blue' ? 'red' : 'blue';
}

function findPos(ctx: EffectCtx, uid: string): AimPos | null {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (ctx.board[r][c] === uid) return { r, c };
    }
  return null;
}

function neighborsOf(ctx: EffectCtx, r: number, c: number): EffectUnit[] {
  const out: EffectUnit[] = [];
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const id = ctx.board[r + dr]?.[c + dc];
    if (id && ctx.units[id]) out.push(ctx.units[id]);
  }
  return out;
}

function pushLog(ctx: EffectCtx, msg: string) {
  ctx.log.push(msg);
}

function bankLoyalty(ctx: EffectCtx, side: Side, n: number) {
  ctx.loyalty[side] = applyBank(ctx.loyalty[side], n);
}

function drawCards(ctx: EffectCtx, side: Side, n: number) {
  for (let i = 0; i < n; i++) {
    if (ctx.hand[side].length >= HAND_CAP) {
      pushLog(ctx, `${side === 'blue' ? 'Azure' : 'Crimson'}'s hand is sealed.`);
      return;
    }
    const card = ctx.deck[side].shift();
    if (!card) {
      pushLog(ctx, `${side === 'blue' ? 'Azure' : 'Crimson'}'s well is dry.`);
      return;
    }
    ctx.hand[side].push(card);
  }
}

function dealTo(ctx: EffectCtx, unit: EffectUnit, raw: number): number {
  const combatant = {
    id: unit.uid,
    name: unit.name,
    power: unit.power,
    keywords: unit.keywords,
    tough: unit.tough || hasKeyword(unit, 'tough'),
  };
  const dmg = applyDamage(combatant, raw);
  unit.power = Math.max(0, combatant.power);
  if (dmg > 0) {
    const pos = findPos(ctx, unit.uid);
    if (pos) {
      const pips = (ctx.pips ??= []);
      pips.push({ id: `${unit.uid}-${pips.length}-${dmg}`, uid: unit.uid, r: pos.r, c: pos.c, text: `-${dmg}` });
    }
  }
  return dmg;
}

function addGain(unit: EffectUnit, n: number) {
  if (n > 0) unit.pendingGain = (unit.pendingGain ?? 0) + n;
}

/**
 * Unmake a unit: discard it, then resolve death triggers —
 * death burst (card.death) against adjacent units, deathBank, Salvage
 * (allied salvage units bank +1 each), and Mourner (enemy mourners draw 1).
 */
export function destroyUnit(ctx: EffectCtx, uid: string, seen?: Set<string>) {
  const visited = seen ?? new Set<string>();
  if (visited.has(uid)) return;
  const u = ctx.units[uid];
  if (!u) return;
  // Mad Starets: the next time it would be slain this sitting, it survives at 1.
  if (u.lastStand) {
    u.lastStand = false;
    u.power = Math.max(1, u.power);
    if (u.power < 1) u.power = 1;
    u.power = 1;
    pushLog(ctx, `${u.name} refuses the grave and stands at 1 power.`);
    return;
  }
  visited.add(uid);
  const pos = findPos(ctx, uid);
  const deadSide = u.side;
  const def = cardById(u.cardId);
  // A silenced unit (Lion's Mask / False Vintage) has lost its abilities.
  const burst = u.silenced ? 0 : (def?.death ?? 0);
  const deathBank = u.silenced
    ? 0
    : ((def as { deathBank?: number } | undefined)?.deathBank ?? 0);
  const burstTargets: string[] = [];
  if (pos && burst > 0) {
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const id = ctx.board[pos.r + dr]?.[pos.c + dc];
      if (id && id !== uid) burstTargets.push(id);
    }
  }
  let salvage = 0;
  const mourners: EffectUnit[] = [];
  for (const other of Object.values(ctx.units)) {
    if (other.uid === uid) continue;
    if (other.side === u.side && hasKeyword(other, 'salvage')) salvage += 1;
    if (other.side !== u.side && hasKeyword(other, 'mourner')) mourners.push(other);
  }
  if (pos) ctx.board[pos.r][pos.c] = null;
  ctx.discard[u.side].push(
    def
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
        },
  );
  delete ctx.units[uid];
  pushLog(ctx, `${u.name} is unmade.`);
  // Father of the Last Icon: enemy deaths bank 2 for the icon's chair.
  if (ctx.iconHarvestSide && deadSide !== ctx.iconHarvestSide && (ctx.iconHarvestOpens ?? 0) > 0) {
    bankLoyalty(ctx, ctx.iconHarvestSide, 2);
    pushLog(ctx, `The last icon banks 2 from the fall.`);
  }
  // Widowed Saint: your deaths draw 1 and bank 1.
  if (ctx.deathTitheSide === deadSide && (ctx.deathTitheOpens ?? 0) > 0) {
    drawCards(ctx, deadSide, 1);
    bankLoyalty(ctx, deadSide, 1);
    pushLog(ctx, `The widow's tithe: draw 1 and bank 1.`);
  }
  if (deathBank > 0) {
    bankLoyalty(ctx, u.side, deathBank);
    pushLog(ctx, `${u.name} leaves ${deathBank} resources.`);
  }
  if (salvage > 0) {
    bankLoyalty(ctx, u.side, salvage);
    pushLog(ctx, `Salvage banks ${salvage}.`);
  }
  for (const m of mourners) {
    if (!ctx.units[m.uid]) continue;
    drawCards(ctx, m.side, 1);
    pushLog(ctx, `${m.name} draws as ${u.name} falls.`);
  }
  for (const id of burstTargets) {
    const t = ctx.units[id];
    if (!t) continue;
    const dmg = dealTo(ctx, t, burst);
    pushLog(ctx, `${u.name} bursts for ${dmg} against ${t.name}.`);
    if (t.power <= 0) destroyUnit(ctx, id, visited);
  }
}

/**
 * "It cannot move or attack on its next rite."
 * powder keeps the unit exhausted through its owner's next rite open
 * (refreshForRite). A foe is also exhausted at once; your own unit keeps
 * the rest of this rite and sits out the next one.
 */
function lockUnit(ctx: EffectCtx, unit: EffectUnit, casterSide: Side, reason: string) {
  unit.powder = true;
  if (unit.side !== casterSide) {
    unit.moved = true;
    unit.attacked = true;
    unit.sick = true;
  }
  pushLog(ctx, `${unit.name} ${reason}`);
}

/** Strip a unit's abilities ("loses its abilities"). */
export function silenceUnit(unit: EffectUnit) {
  unit.silenced = true;
  unit.keywords = [];
  unit.tough = false;
  unit.fast = false;
  unit.shutter = false;
}

/** Return a unit to its owner's hand as its real catalog card. */
function bounceToHand(ctx: EffectCtx, unit: EffectUnit) {
  const owner = unit.side;
  const pos = findPos(ctx, unit.uid);
  if (pos) ctx.board[pos.r][pos.c] = null;
  delete ctx.units[unit.uid];
  const def = cardById(unit.cardId);
  const bounced: Card = def
    ? { ...def }
    : {
        id: unit.cardId,
        name: unit.name,
        faction: '',
        kind: 'unit',
        rarity: 'common',
        cost: unit.loyalty,
        oath: 0,
        power: unit.maxPower,
        keywords: [...unit.keywords],
        text: '',
      };
  if (ctx.hand[owner].length < HAND_CAP) ctx.hand[owner].push(bounced);
  else ctx.discard[owner].push(bounced);
}

function snuffGuns(ctx: EffectCtx, side: Side, sourceName: string) {
  for (const uid of Object.keys(ctx.units)) {
    const u = ctx.units[uid];
    if (!u || u.side === side || !hasKeyword(u, 'ranged')) continue;
    const dmg = dealTo(ctx, u, 2);
    pushLog(ctx, `${sourceName} snuffs ${u.name} for ${dmg}.`);
    if (isDestroyed({ ...u, id: u.uid, power: u.power, keywords: u.keywords })) {
      destroyUnit(ctx, uid);
    }
  }
}

function tide(ctx: EffectCtx, side: Side, sourceName: string) {
  for (const uid of Object.keys(ctx.units)) {
    const u = ctx.units[uid];
    if (!u || u.side === side || hasKeyword(u, 'gills')) continue;
    const dmg = dealTo(ctx, u, 1);
    pushLog(ctx, `${sourceName} rises ${dmg} against ${u.name}.`);
    if (u.power <= 0) destroyUnit(ctx, uid);
  }
  for (const u of Object.values(ctx.units)) {
    if (u.side !== side || !hasKeyword(u, 'gills')) continue;
    if (u.power >= u.maxPower) continue;
    u.power += 1;
    pushLog(ctx, `${u.name} draws a breath.`);
  }
}

export type EffectSpec = { op: string; n?: number };

export type CardExtras = {
  /** Catalog card id when resolving a cast rite/device (for synergies). */
  id?: string;
  alsoDraw?: number;
  alsoBank?: number;
  alsoHealth?: number;
  alsoTough?: boolean;
  alsoSilence?: boolean;
  alsoDiscard?: boolean;
  /** Empower also locks the target (Carve the Seal). */
  alsoLock?: boolean;
  name: string;
  aim?: boolean;
};

/** True when an allied high_john (Papa John) unit is on the board for `side`. */
function hasAlliedPapaJohn(ctx: EffectCtx, side: Side): boolean {
  return Object.values(ctx.units).some(
    (u) => u.side === side && u.cardId === 'high_john' && !u.silenced,
  );
}

/** Resolve a rite/device effect. Mutates ctx. Target optional when aim. */
export function resolveEffect(
  ctx: EffectCtx,
  effect: EffectSpec,
  card: CardExtras,
  targetUid?: string | null,
  aimPos?: AimPos | null,
): string | null {
  const side = ctx.side;
  const n = effect.n ?? 0;
  const target = targetUid ? ctx.units[targetUid] : undefined;

  const needTarget = () => {
    if (!target) return 'Name a unit on the field.';
    if (hasKeyword(target, 'veiled')) return 'That unit cannot be named.';
    if (target.warded && target.side !== side) return 'That unit is warded against your workings.';
    return null;
  };

  switch (effect.op) {
    case 'smite_all': {
      for (const uid of Object.keys(ctx.units)) {
        const u = ctx.units[uid];
        if (!u) continue;
        const dmg = dealTo(ctx, u, n);
        pushLog(ctx, `${card.name} deals ${dmg} to ${u.name}.`);
        if (u.power <= 0) destroyUnit(ctx, uid);
      }
      break;
    }
    case 'snuff_guns':
      snuffGuns(ctx, side, card.name);
      break;
    case 'tide':
      tide(ctx, side, card.name);
      break;
    case 'empower_all': {
      for (const u of Object.values(ctx.units)) {
        if (u.side === side) {
          u.power += n;
          u.maxPower += n;
          addGain(u, n);
        }
      }
      pushLog(ctx, `${card.name} lifts your units by ${n}.`);
      break;
    }
    case 'draw':
      drawCards(ctx, side, n);
      pushLog(ctx, `${card.name} draws ${n}.`);
      break;
    case 'bank':
      bankLoyalty(ctx, side, n);
      pushLog(ctx, `${card.name} banks ${n}.`);
      break;
    case 'bank_draw':
      bankLoyalty(ctx, side, 1);
      drawCards(ctx, side, 1);
      pushLog(ctx, `${card.name} banks 1 and draws.`);
      break;
    case 'leech': {
      const other = foe(side);
      const take = Math.min(5, ctx.loyalty[other]);
      ctx.loyalty[other] -= take;
      bankLoyalty(ctx, side, take);
      pushLog(ctx, `${card.name} takes ${take} resources.`);
      break;
    }
    case 'empty':
      ctx.loyalty.blue = 0;
      ctx.loyalty.red = 0;
      pushLog(ctx, `${card.name} empties both banks.`);
      break;
    case 'smite': {
      const err = needTarget();
      if (err) return err;
      let smiteN = n;
      if (card.id === 'goofer_dust' && hasAlliedPapaJohn(ctx, side)) {
        smiteN = n + 1;
        pushLog(ctx, `Papa John's root strengthens the dust.`);
      }
      const dmg = dealTo(ctx, target!, smiteN);
      pushLog(ctx, `${card.name} deals ${dmg} to ${target!.name}.`);
      if (target!.power <= 0) destroyUnit(ctx, target!.uid);
      break;
    }
    case 'empower': {
      const err = needTarget();
      if (err) return err;
      if (n > 0) {
        target!.power += n;
        target!.maxPower += n;
        addGain(target!, n);
        pushLog(ctx, `${target!.name} gains +${n} power.`);
      }
      if ((card.alsoHealth ?? 0) > 0) {
        target!.power += card.alsoHealth!;
        target!.maxPower += card.alsoHealth!;
        addGain(target!, card.alsoHealth!);
        pushLog(ctx, `${target!.name} gains +${card.alsoHealth} power.`);
      }
      if (card.alsoTough) target!.tough = true;
      if (card.alsoLock && ctx.units[target!.uid]) {
        lockUnit(ctx, target!, side, 'cannot move or attack on its next rite.');
      }
      break;
    }
    case 'lock': {
      const err = needTarget();
      if (err) return err;
      lockUnit(ctx, target!, side, 'cannot move or attack on its next rite.');
      if (card.id === 'hot_foot_powder' && hasAlliedPapaJohn(ctx, side)) {
        pushLog(ctx, `Papa John's root burns through the powder.`);
        const dmg = dealTo(ctx, target!, 1);
        pushLog(ctx, `${card.name} deals ${dmg} to ${target!.name}.`);
        if (target!.power <= 0) destroyUnit(ctx, target!.uid);
      }
      break;
    }
    case 'set_power': {
      const err = needTarget();
      if (err) return err;
      addGain(target!, Math.max(0, n - target!.maxPower));
      target!.power = n;
      target!.maxPower = n;
      // Card text: "It is healed to full, loses its abilities, and its power becomes N."
      silenceUnit(target!);
      pushLog(ctx, `${target!.name} is remade at power ${n} and loses its abilities.`);
      break;
    }
    case 'destroy': {
      const err = needTarget();
      if (err) return err;
      destroyUnit(ctx, target!.uid);
      break;
    }
    case 'sacrifice_splash': {
      const err = needTarget();
      if (err) return err;
      if (target!.side !== side) return 'Sacrifice a unit you own.';
      const pos = findPos(ctx, target!.uid);
      const name = target!.name;
      const adj = pos ? neighborsOf(ctx, pos.r, pos.c).map((u) => u.uid) : [];
      destroyUnit(ctx, target!.uid);
      for (const uid of adj) {
        const u = ctx.units[uid];
        if (!u) continue;
        const dmg = dealTo(ctx, u, n);
        pushLog(ctx, `${name} bursts for ${dmg} against ${u.name}.`);
        if (u.power <= 0) destroyUnit(ctx, uid);
      }
      break;
    }
    case 'sacrifice_bank': {
      const err = needTarget();
      if (err) return err;
      if (target!.side !== side) return 'Sacrifice a unit you own.';
      const gain = target!.loyalty * 2;
      const name = target!.name;
      destroyUnit(ctx, target!.uid);
      bankLoyalty(ctx, side, gain);
      pushLog(ctx, `${name} is spent. ${gain} resources are banked.`);
      break;
    }
    case 'shove': {
      const err = needTarget();
      if (err) return err;
      if (!aimPos) return 'Name an empty adjacent circle.';
      const pos = findPos(ctx, target!.uid);
      if (!pos) return 'That unit is not on the field.';
      if (manhattan(pos.r, pos.c, aimPos.r, aimPos.c) !== 1) return 'Slide onto an adjacent circle.';
      if (!target!.sick && !target!.moved && !target!.attacked) {
        return 'Only an exhausted unit will slide.';
      }
      const dest = ctx.tiles?.[aimPos.r]?.[aimPos.c];
      if (dest && (dest.kind === 'void' || dest.kind === 'stronghold')) {
        return 'That circle cannot take the slide.';
      }
      if (ctx.board[aimPos.r][aimPos.c]) return 'That circle is occupied.';
      ctx.board[pos.r][pos.c] = null;
      ctx.board[aimPos.r][aimPos.c] = target!.uid;
      const noClaim = hasKeyword(target!, 'unclaiming') || hasKeyword(target!, 'veiled');
      if (!noClaim && dest && dest.kind !== 'void' && dest.kind !== 'stronghold') {
        ctx.control[aimPos.r][aimPos.c] = target!.side;
      }
      pushLog(
        ctx,
        noClaim
          ? `${target!.name} slides across and leaves the circle unclaimed.`
          : `${target!.name} slides onto the circle.`,
      );
      break;
    }
    case 'destroy_refund': {
      const err = needTarget();
      if (err) return err;
      const owner = target!.side;
      const refund = target!.loyalty;
      const name = target!.name;
      destroyUnit(ctx, target!.uid);
      bankLoyalty(ctx, owner, refund);
      pushLog(ctx, `${name} returns ${refund} resources.`);
      break;
    }
    case 'trepan': {
      const err = needTarget();
      if (err) return err;
      const dmg = dealTo(ctx, target!, 1);
      pushLog(ctx, `${card.name} deals ${dmg} to ${target!.name}.`);
      if (target!.power <= 0) destroyUnit(ctx, target!.uid);
      else {
        target!.power += 2;
        target!.maxPower += 2;
        addGain(target!, 2);
        pushLog(ctx, `${target!.name} survives and gains +2 power.`);
      }
      break;
    }
    case 'bounce': {
      const err = needTarget();
      if (err) return err;
      const name = target!.name;
      bounceToHand(ctx, target!);
      pushLog(ctx, `${name} is returned to hand.`);
      break;
    }
    case 'field_poison': {
      const dmg = n > 0 ? n : 3;
      ctx.fieldPoisonDamage = Math.max(ctx.fieldPoisonDamage ?? 0, dmg);
      pushLog(
        ctx,
        `${card.name} blankets the field in lingering poison (${dmg} at the next rite open).`,
      );
      break;
    }
    case 'no_bank': {
      const opens = n > 0 ? n : 2;
      ctx.noBankOpens = Math.max(ctx.noBankOpens ?? 0, opens);
      pushLog(
        ctx,
        `${card.name} freezes Resource banking for the next turn.`,
      );
      break;
    }
    default:
      pushLog(ctx, `${card.name} works an obscure rite (${effect.op}).`);
      break;
  }

  if ((card.alsoDraw ?? 0) > 0) drawCards(ctx, side, card.alsoDraw!);
  if ((card.alsoBank ?? 0) > 0) {
    bankLoyalty(ctx, side, card.alsoBank!);
    pushLog(ctx, `${card.name} also banks ${card.alsoBank}.`);
  }
  return null;
}

/** CardExtras for a catalog rite/device card. */
export function castExtras(card: Card): CardExtras {
  return {
    id: card.id,
    name: card.name,
    alsoDraw: card.alsoDraw,
    alsoBank: card.alsoBank,
    alsoHealth: card.alsoHealth,
    alsoTough: card.alsoTough,
    alsoLock: card.alsoLock,
    alsoDiscard: card.alsoDiscard,
    aim: card.aim,
  };
}

/**
 * Cast the rite/device at `handIndex` for `acting`: pay its cost, resolve the
 * effect, move the card to discard, then apply "Then discard a card"
 * (random, from the remaining hand). Mutates ctx; returns an error or null.
 * Shared by Battlefield (player + AI) and the headless engine.
 */
export function castFromHand(
  ctx: EffectCtx,
  acting: Side,
  handIndex: number,
  targetUid?: string | null,
  aimPos?: AimPos | null,
  rand: () => number = Math.random,
): string | null {
  const card = ctx.hand[acting][handIndex];
  if (!card || (card.kind !== 'rite' && card.kind !== 'device')) return 'That is not a rite.';
  if (!card.effect) return `${card.name} has no working.`;
  if (ctx.loyalty[acting] < card.cost) return `Not enough resources (need ${card.cost}).`;
  const prevSide = ctx.side;
  ctx.side = acting;
  ctx.loyalty[acting] -= card.cost;
  const err = resolveEffect(ctx, card.effect, castExtras(card), targetUid, aimPos);
  ctx.side = prevSide;
  if (err) {
    ctx.loyalty[acting] += card.cost;
    return err;
  }
  const at = ctx.hand[acting].indexOf(card);
  if (at >= 0) ctx.hand[acting].splice(at, 1);
  ctx.discard[acting].push(card);
  if (card.alsoDiscard) {
    const h = ctx.hand[acting];
    if (h.length > 0) {
      const [lost] = h.splice(Math.floor(rand() * h.length), 1);
      ctx.discard[acting].push(lost);
      pushLog(ctx, `${card.name}: ${lost.name} is discarded.`);
    } else {
      pushLog(ctx, `${card.name}: the hand is already empty.`);
    }
  }
  return null;
}

const LEADER_AIMED = new Set([
  'smite',
  'empower',
  'lock',
  'set_power',
  'destroy',
  'bounce',
  'martyr',
  'mend',
  'haste',
  'bulwark',
  'empower_draw',
  'snuff',
  'slide',
  'trepan',
  'ward',
  'last_stand',
  'charge',
  'breach',
  'copy_kw',
  'revive_coven',
  'transmute',
]);

/** Extra choices for multi-step leader workings. */
export type LeaderOpts = {
  /** Provost: the pupil that receives the teacher's keywords. */
  secondUid?: string | null;
  /** Rector: which of the top 3 (0..2) goes to hand. */
  pick?: number;
  /** Rector: order of the other two on the bottom (indices into the remaining). */
  bottom?: number[];
  /** Cayce: search for a unit or a spell (rite/device). */
  seek?: 'unit' | 'rite';
  /** Whitethorn Queen / Cayce recall: index into your discard. */
  discardIndex?: number;
};

/** Cards Cayce (and similar) may lift from the discard: units and spells. */
export function isRecallableFromDiscard(card: Card): boolean {
  return card.kind === 'unit' || card.kind === 'rite' || card.kind === 'device';
}



function applyCopiedKeywords(u: EffectUnit, kws: string[]) {
  const next = [...u.keywords];
  for (const k of kws) {
    if (!next.includes(k)) next.push(k);
    if (k === 'tough') u.tough = true;
    if (k === 'fast') u.fast = true;
    if (k === 'shutter') u.shutter = true;
  }
  u.keywords = next;
}

function readyUnit(u: EffectUnit) {
  u.sick = false;
  if (!u.powder) {
    u.moved = false;
    u.attacked = false;
  }
}

function unitFaction(u: EffectUnit): string {
  return cardById(u.cardId)?.faction ?? '';
}

/** Tick until-end-of-turn leader auras (call from each openRite). */
export function tickLeaderAuras(ctx: EffectCtx) {
  if ((ctx.iconHarvestOpens ?? 0) > 0) {
    ctx.iconHarvestOpens = (ctx.iconHarvestOpens ?? 0) - 1;
    if (ctx.iconHarvestOpens <= 0) {
      ctx.iconHarvestOpens = 0;
      ctx.iconHarvestSide = undefined;
    }
  }
  if ((ctx.deathTitheOpens ?? 0) > 0) {
    ctx.deathTitheOpens = (ctx.deathTitheOpens ?? 0) - 1;
    if (ctx.deathTitheOpens <= 0) {
      ctx.deathTitheOpens = 0;
      ctx.deathTitheSide = undefined;
    }
  }
  // Breach / mustStrike last one rite for the unit's chair.
  for (const u of Object.values(ctx.units)) {
    if (u.breach || u.mustStrike) {
      // Cleared when the side that does not own them becomes active? Cleared on
      // every openRite for units whose side is not the opening side (their turn ended).
      if (u.side !== ctx.side) {
        u.breach = false;
        u.mustStrike = false;
      }
    }
  }
}

/** Once-per-sitting leader power. Returns error string or null on success. */
export function resolveLeaderPower(
  ctx: EffectCtx,
  leader: Card,
  targetUid?: string | null,
  aimPos?: AimPos | null,
  opts: LeaderOpts = {},
): string | null {
  const power = leader.leaderPower;
  if (!power) return 'This leader has no working.';
  const side = ctx.side;
  const cost = leader.cost ?? 0;
  if (ctx.loyalty[side] < cost) return `Not enough resources (need ${cost}).`;

  const target = targetUid ? ctx.units[targetUid] : undefined;
  const op = power.op;
  const n = power.n ?? 0;

  const pay = () => {
    ctx.loyalty[side] -= cost;
  };
  const guardTarget = (u: EffectUnit | undefined, needOwn?: boolean, needFoe?: boolean): string | null => {
    if (!u) return 'Name a unit on the field.';
    if (hasKeyword(u, 'veiled')) return 'That unit cannot be named.';
    if (u.warded && u.side !== side) return 'That unit is warded against your workings.';
    if (needOwn && u.side !== side) return 'Name a unit you own.';
    if (needFoe && u.side === side) return 'Name an enemy unit.';
    return null;
  };

  if (op === 'draw') {
    pay();
    drawCards(ctx, side, n);
    pushLog(ctx, `${leader.name} draws ${n}.`);
    return null;
  }
  if (op === 'master') {
    pay();
    drawCards(ctx, side, 2);
    bankLoyalty(ctx, side, 2);
    pushLog(ctx, `${leader.name} draws 2 and banks 2.`);
    return null;
  }
  if (op === 'tide') {
    pay();
    tide(ctx, side, leader.name);
    return null;
  }
  if (op === 'playback') {
    pay();
    const disc = ctx.discard[side];
    for (let i = disc.length - 1; i >= 0; i--) {
      const c = disc[i];
      if (c.kind !== 'rite' && c.kind !== 'device') continue;
      disc.splice(i, 1);
      if (ctx.hand[side].length < HAND_CAP) ctx.hand[side].push(c);
      else disc.push(c);
      pushLog(ctx, `${leader.name} plays back ${c.name}.`);
      return null;
    }
    drawCards(ctx, side, 1);
    pushLog(ctx, `${leader.name} finds no rite to replay, and draws.`);
    return null;
  }
  if (op === 'grave') {
    pay();
    const c = ctx.discard[side].pop();
    if (c) {
      if (ctx.hand[side].length < HAND_CAP) ctx.hand[side].push(c);
      else ctx.discard[side].push(c);
      pushLog(ctx, `${leader.name} lifts ${c.name} from the grave.`);
    }
    drawCards(ctx, side, 1);
    return null;
  }
  if (op === 'claim') {
    if (!aimPos) return 'Name an empty circle.';
    const { r, c } = aimPos;
    if (ctx.board[r][c]) return 'That circle is occupied.';
    const tile = ctx.tiles?.[r]?.[c];
    if (tile && (tile.kind === 'void' || tile.kind === 'stronghold')) {
      return 'Claim an empty circle that is not a stronghold.';
    }
    pay();
    ctx.control[r][c] = side;
    pushLog(ctx, `${leader.name} claims the circle.`);
    return null;
  }
  if (op === 'snuff') {
    const err = guardTarget(target);
    if (err) return err;
    pay();
    target!.shutter = true;
    target!.tough = true;
    if (!target!.keywords.includes('shutter')) target!.keywords = [...target!.keywords, 'shutter'];
    if (!target!.keywords.includes('tough')) target!.keywords = [...target!.keywords, 'tough'];
    pushLog(ctx, `${target!.name} gains Shutter and Toughness.`);
    return null;
  }

  // ── Redesigned unique workings ──────────────────────────────────────────
  if (op === 'green_surge') {
    pay();
    let nHit = 0;
    for (const u of Object.values(ctx.units)) {
      if (u.side !== side) continue;
      if (unitFaction(u) !== 'Sons of the Green Lion') continue;
      u.power += 1;
      u.maxPower += 1;
      addGain(u, 1);
      nHit += 1;
    }
    pushLog(ctx, nHit ? `${leader.name} surges ${nHit} Sons of the Green Lion (+1 power).` : `${leader.name} finds no Sons of the Green Lion on the field.`);
    return null;
  }
  if (op === 'ready_works') {
    pay();
    let nHit = 0;
    for (const u of Object.values(ctx.units)) {
      if (u.side !== side) continue;
      if (unitFaction(u) !== 'The Mercury Works') continue;
      readyUnit(u);
      nHit += 1;
    }
    pushLog(ctx, nHit ? `${leader.name} readies ${nHit} Mercury Works units.` : `${leader.name} finds no Mercury Works units on the field.`);
    return null;
  }
  if (op === 'steal_res') {
    pay();
    const other = foe(side);
    const take = Math.min(2, ctx.loyalty[other]);
    ctx.loyalty[other] -= take;
    bankLoyalty(ctx, side, 2);
    pushLog(
      ctx,
      take >= 2
        ? `${leader.name} steals 2 Resources.`
        : `${leader.name} banks 2 Resources (the foe had only ${take}).`,
    );
    return null;
  }
  if (op === 'icon_harvest') {
    pay();
    ctx.iconHarvestSide = side;
    ctx.iconHarvestOpens = 2;
    pushLog(ctx, `${leader.name} opens the last icon: enemy deaths bank 2 this turn.`);
    return null;
  }
  if (op === 'death_tithe') {
    pay();
    ctx.deathTitheSide = side;
    ctx.deathTitheOpens = 2;
    pushLog(ctx, `${leader.name} walks the wakes: your deaths draw 1 and bank 1 this turn.`);
    return null;
  }
  if (op === 'scry3') {
    // Pick must be explicit (0 is a valid choice) — never default the first card.
    if (opts.pick == null) return 'Name which of the top cards to take.';
    const deck = ctx.deck[side];
    if (deck.length === 0) return 'Your well is dry.';
    pay();
    const top = deck.splice(0, Math.min(3, deck.length));
    const pick = Math.max(0, Math.min(opts.pick, top.length - 1));
    const chosen = top[pick]!;
    const rest = top.filter((_, i) => i !== pick);
    // Optional reorder of the bottom cards.
    if (opts.bottom && opts.bottom.length === rest.length) {
      const ordered = opts.bottom.map((i) => rest[i]).filter(Boolean) as Card[];
      if (ordered.length === rest.length) rest.splice(0, rest.length, ...ordered);
    }
    if (ctx.hand[side].length < HAND_CAP) ctx.hand[side].push(chosen);
    else ctx.discard[side].push(chosen);
    deck.push(...rest);
    pushLog(ctx, `${leader.name} takes ${chosen.name} from the top of the well${rest.length ? `; ${rest.map((c) => c.name).join(' and ')} sink to the bottom` : ''}.`);
    return null;
  }
  if (op === 'recall') {
    // Explicit discard pick — never silent first-match.
    if (opts.discardIndex == null) return 'Name a unit or spell in your discard.';
    const disc = ctx.discard[side];
    const idx = opts.discardIndex;
    if (idx < 0 || idx >= disc.length) return 'Name a unit or spell in your discard.';
    const card = disc[idx]!;
    if (!isRecallableFromDiscard(card)) return 'Name a unit or spell in your discard.';
    if (ctx.hand[side].length >= HAND_CAP) return "Your hand is sealed.";
    pay();
    disc.splice(idx, 1);
    ctx.hand[side].push(card);
    pushLog(ctx, `${leader.name} recalls ${card.name} from the discard.`);
    return null;
  }
  if (op === 'seek') {
    // Kind must be an explicit player (or AI) choice — never default to unit.
    if (opts.seek !== 'unit' && opts.seek !== 'rite') return 'Name unit or spell.';
    const kind = opts.seek;
    const deck = ctx.deck[side];
    if (deck.length === 0) return 'Your well is dry.';
    const match = (c: Card) => (kind === 'unit' ? c.kind === 'unit' : c.kind === 'rite' || c.kind === 'device');
    const label = kind === 'unit' ? 'unit' : 'spell';
    if (!deck.some(match)) return `No ${label} remains in your well.`;
    pay();
    const revealed: Card[] = [];
    let hit: Card | null = null;
    while (deck.length) {
      const c = deck.shift()!;
      if (!hit && match(c)) {
        hit = c;
        break;
      }
      revealed.push(c);
    }
    // Shuffle revealed (misses) back into the remaining deck.
    const rest = [...revealed, ...deck];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rest[i]!;
      rest[i] = rest[j]!;
      rest[j] = t;
    }
    ctx.deck[side] = rest;
    if (hit) {
      if (ctx.hand[side].length < HAND_CAP) ctx.hand[side].push(hit);
      else ctx.discard[side].push(hit);
      pushLog(ctx, `${leader.name} names a ${label} and finds ${hit.name}.`);
    } else {
      // Should be unreachable after the pre-check; restore safely if it ever is.
      pushLog(ctx, `${leader.name} names a ${label} and finds none.`);
    }
    return null;
  }
  if (op === 'copy_kw') {
    const err = guardTarget(target, true);
    if (err) return err;
    const pupil = opts.secondUid ? ctx.units[opts.secondUid] : undefined;
    const err2 = guardTarget(pupil, true);
    if (err2) return 'Name a second unit you own.';
    if (pupil!.uid === target!.uid) return 'Name two different units.';
    pay();
    applyCopiedKeywords(pupil!, [...target!.keywords]);
    pushLog(ctx, `${leader.name} copies ${target!.name}'s keywords onto ${pupil!.name}.`);
    return null;
  }
  if (op === 'ward') {
    const err = guardTarget(target, true);
    if (err) return err;
    pay();
    target!.warded = true;
    pushLog(ctx, `${target!.name} is warded against enemy spells and leader powers.`);
    return null;
  }
  if (op === 'last_stand') {
    const err = guardTarget(target, true);
    if (err) return err;
    pay();
    target!.tough = true;
    if (!target!.keywords.includes('tough')) target!.keywords = [...target!.keywords, 'tough'];
    target!.lastStand = true;
    pushLog(ctx, `${target!.name} gains Toughness and a last stand.`);
    return null;
  }
  if (op === 'charge') {
    const err = guardTarget(target, true);
    if (err) return err;
    pay();
    if (target!.sick && !target!.powder) {
      target!.moved = false;
      target!.attacked = false;
    }
    target!.sick = false;
    target!.fast = true;
    if (!target!.keywords.includes('fast')) target!.keywords = [...target!.keywords, 'fast'];
    target!.mustStrike = true;
    pushLog(ctx, `${target!.name} gains Fast Attack, may act at once, and must attack if able.`);
    return null;
  }
  if (op === 'breach') {
    const err = guardTarget(target, true);
    if (err) return err;
    pay();
    readyUnit(target!);
    target!.breach = true;
    pushLog(ctx, `${target!.name} ignores stronghold walls and must strike an enemy stronghold if able.`);
    return null;
  }
  if (op === 'revive_coven') {
    if (!aimPos) return 'Name an empty circle you control.';
    const { r, c } = aimPos;
    if (ctx.board[r][c]) return 'That circle is occupied.';
    if (ctx.control[r]?.[c] !== side) return 'Claim a circle you control.';
    const tile = ctx.tiles?.[r]?.[c];
    if (tile && (tile.kind === 'void' || tile.kind === 'stronghold')) {
      return 'Return them to an empty circle that is not a stronghold.';
    }
    const disc = ctx.discard[side];
    if (opts.discardIndex == null) return 'Name a Whitethorn Coven unit in your discard.';
    const idx = opts.discardIndex;
    if (idx < 0 || idx >= disc.length) return 'Name a Whitethorn Coven unit in your discard.';
    const card = disc[idx]!;
    if (card.kind !== 'unit' || card.faction !== 'The Whitethorn Coven') {
      return 'Name a Whitethorn Coven unit in your discard.';
    }
    pay();
    disc.splice(idx, 1);
    const uid = `rev_${Math.random().toString(36).slice(2, 9)}`;
    ctx.units[uid] = {
      uid,
      cardId: card.id,
      name: card.name,
      side,
      power: 1,
      maxPower: 1,
      loyalty: card.cost,
      keywords: [...card.keywords],
      sick: true,
      moved: true,
      attacked: true,
      tough: card.keywords.includes('tough'),
      fast: card.keywords.includes('fast'),
      shutter: card.keywords.includes('shutter'),
    };
    ctx.board[r][c] = uid;
    pushLog(ctx, `${leader.name} returns ${card.name} to the hedge at 1 power, exhausted.`);
    return null;
  }
  if (op === 'transmute') {
    const err = guardTarget(target, false, true);
    if (err) return err;
    pay();
    const name = target!.name;
    target!.cardId = 'homunculus_token';
    target!.name = 'Homunculus';
    target!.power = 1;
    target!.maxPower = 1;
    target!.loyalty = 0;
    target!.keywords = ['token'];
    target!.tough = false;
    target!.fast = false;
    target!.shutter = false;
    target!.silenced = true;
    target!.warded = false;
    target!.lastStand = false;
    target!.breach = false;
    target!.mustStrike = false;
    target!.sick = true;
    target!.moved = true;
    target!.attacked = true;
    pushLog(ctx, `${leader.name} transforms ${name} into a Homunculus.`);
    return null;
  }

  // ── Legacy aimed workings (kept for any leftover plates) ────────────────
  if (!LEADER_AIMED.has(op) && op !== 'bounce') {
    pushLog(ctx, `${leader.name} works (${op}).`);
    pay();
    return null;
  }

  {
    const err = guardTarget(target);
    if (err) return err;
  }

  if (op === 'martyr') {
    if (target!.side !== side) return 'Unmake a unit you own.';
    const pos = findPos(ctx, target!.uid);
    const adj = pos ? neighborsOf(ctx, pos.r, pos.c).map((u) => u.uid) : [];
    pay();
    const name = target!.name;
    destroyUnit(ctx, target!.uid);
    for (const uid of adj) {
      const u = ctx.units[uid];
      if (!u) continue;
      const dmg = dealTo(ctx, u, 2);
      pushLog(ctx, `${leader.name} deals ${dmg} to ${u.name}.`);
      if (u.power <= 0) destroyUnit(ctx, uid);
    }
    pushLog(ctx, `${leader.name} martyrs ${name}.`);
    return null;
  }
  if (['mend', 'haste', 'bulwark', 'empower_draw'].includes(op) && target!.side !== side) {
    return 'Name a unit you own.';
  }
  if (op === 'slide' && !target!.sick && !target!.moved && !target!.attacked) {
    return 'Only an exhausted unit will slide.';
  }
  pay();
  if (op === 'haste') {
    if (target!.sick && !target!.powder) {
      target!.moved = false;
      target!.attacked = false;
    }
    target!.sick = false;
    target!.fast = true;
    if (!target!.keywords.includes('fast')) target!.keywords = [...target!.keywords, 'fast'];
    pushLog(ctx, `${target!.name} gains Fast Attack and may act at once.`);
    return null;
  }
  if (op === 'bulwark') {
    target!.maxPower += 3;
    target!.power += 3;
    addGain(target!, 3);
    pushLog(ctx, `${target!.name} gains +3 power.`);
    return null;
  }
  if (op === 'empower_draw') {
    target!.power += n;
    target!.maxPower += n;
    drawCards(ctx, side, 1);
    pushLog(ctx, `${target!.name} gains +${n} power. You draw.`);
    return null;
  }
  if (op === 'mend') {
    target!.power = target!.maxPower;
    target!.power += 1;
    target!.maxPower += 1;
    target!.sick = false;
    pushLog(ctx, `${target!.name} stands back up.`);
    return null;
  }
  if (op === 'bounce') {
    return resolveEffect(ctx, { op: 'bounce' }, { name: leader.name }, target!.uid);
  }
  if (op === 'slide') {
    if (!aimPos) return 'Name an empty adjacent circle.';
    return resolveEffect(ctx, { op: 'shove' }, { name: leader.name }, target!.uid, aimPos);
  }

  pushLog(ctx, `${leader.name} works (${op}).`);
  return null;
}



/**
 * Apply pending lingering field poison at rite open.
 * Deals `damage` to every unit via the normal combat damage path (Toughness applies).
 * Returns the number of units struck.
 */
export function applyPendingFieldPoison(ctx: EffectCtx, damage: number): number {
  if (damage <= 0) return 0;
  let struck = 0;
  for (const uid of Object.keys(ctx.units)) {
    const u = ctx.units[uid];
    if (!u) continue;
    const dmg = dealTo(ctx, u, damage);
    pushLog(ctx, `Lingering poison deals ${dmg} to ${u.name}.`);
    struck += 1;
    if (u.power <= 0) destroyUnit(ctx, uid);
  }
  return struck;
}
export function effectNeedsAim(effect?: EffectSpec | null, aim?: boolean): boolean {
  if (!effect) return false;
  if (aim) return true;
  return [
    'smite',
    'empower',
    'lock',
    'set_power',
    'destroy',
    'bounce',
    'sacrifice_splash',
    'sacrifice_bank',
    'shove',
    'destroy_refund',
    'trepan',
  ].includes(effect.op);
}


/** True if this act needs the player to name a unit (or tile) target. */
export function actNeedsAim(act?: ActSpec | null): boolean {
  if (!act) return false;
  if (act.aim) return true;
  return [
    'jab',
    'once-nick',
    'once-sting',
    'sacrifice-hit',
    'bolster',
    'once-power',
    'tap-mend',
    'once-tough',
    'sacrifice-fast',
    'recall',
    'copy',
  ].includes(act.op);
}

/**
 * Resolve an on-board unit activated ability (Sacrifice / Exhaust / Once…).
 * Mutates ctx. Returns error string or null on success.
 * Port of grok `It()`, adapted to Cabals dual-Power.
 */
export function resolveActivatedAbility(
  ctx: EffectCtx,
  sourceUid: string,
  targetUid?: string | null,
): string | null {
  const source = ctx.units[sourceUid];
  if (!source) return 'That unit is not on the field.';
  const card = cardById(source.cardId);
  const act = card?.act;
  if (!card || !act) return 'That unit has no power to call.';
  if (source.side !== ctx.side) return 'That unit will not heed you.';
  if (source.sick) return 'That unit cannot call a power.';
  if (source.silenced) return 'That unit has lost its abilities.';
  if (act.once ? source.once : source.used) {
    return 'That power has already been called.';
  }
  const pay = act.pay ?? 0;
  if (pay > ctx.loyalty[ctx.side]) {
    return `Not enough resources (need ${pay}).`;
  }
  const target = targetUid ? ctx.units[targetUid] : undefined;
  if (actNeedsAim(act) && !target) return 'Name a unit.';
  if (target && hasKeyword(target, 'veiled') && target.uid !== source.uid) {
    return 'That unit cannot be named.';
  }
  const srcPos = findPos(ctx, source.uid);
  if (!srcPos) return 'The unit is not on the field.';

  if ((act.op === 'jab' || act.op === 'sacrifice-hit') && target) {
    const tPos = findPos(ctx, target.uid);
    if (!tPos || manhattan(srcPos.r, srcPos.c, tPos.r, tPos.c) !== 1) {
      return 'Name an adjacent unit.';
    }
  }
  if (act.op === 'once-sting' && target && target.power < 2) {
    return 'Name a unit with power 2 or greater.';
  }
  if (act.op === 'recall' && target && target.side !== source.side) {
    return 'Name a unit you own.';
  }
  if (
    act.op === 'sacrifice-fast' &&
    (!target || target.side !== source.side || target.uid === source.uid)
  ) {
    return 'Name another unit you own.';
  }
  if (act.op === 'copy' && act.foe && target && target.side === source.side) {
    return 'Name an enemy unit.';
  }
  if (act.op === 'copy' && !act.foe && target?.uid === source.uid) {
    return 'Name another unit.';
  }

  ctx.loyalty[ctx.side] -= pay;

  const markUsed = () => {
    const u = ctx.units[source.uid];
    if (!u) return;
    if (act.once) u.once = true;
    else u.used = true;
  };

  if (act.op === 'wail') {
    const adj = neighborsOf(ctx, srcPos.r, srcPos.c).map((u) => u.uid);
    for (const uid of adj) {
      if (ctx.units[uid]) destroyUnit(ctx, uid);
    }
    pushLog(ctx, `${card.name} screams. The adjacent circles are emptied.`);
    markUsed();
    return null;
  }

  if (act.op === 'gadget') {
    const victims = Object.keys(ctx.units);
    for (const uid of victims) {
      if (ctx.units[uid]) destroyUnit(ctx, uid);
    }
    pushLog(ctx, 'The gadget answers — the field is ash.');
    markUsed();
    return null;
  }

  if (
    act.op === 'jab' ||
    act.op === 'once-nick' ||
    act.op === 'once-sting' ||
    act.op === 'sacrifice-hit'
  ) {
    if (!target) return 'Name a unit.';
    const raw = act.op === 'sacrifice-hit' ? (act.n ?? 3) : 1;
    const dmg = dealTo(ctx, target, raw);
    pushLog(ctx, `${card.name} deals ${dmg} to ${target.name}.`);
    if (target.power <= 0) destroyUnit(ctx, target.uid);
    if (act.op === 'once-sting') {
      source.moved = true;
      source.attacked = true;
    }
    if (act.op === 'sacrifice-hit') destroyUnit(ctx, source.uid);
    markUsed();
    return null;
  }

  if (act.op === 'bolster' || act.op === 'once-power' || act.op === 'self-power') {
    const who = act.op === 'self-power' ? source : target;
    if (!who) return 'Name a unit.';
    const gain = act.n ?? 1;
    who.power += gain;
    who.maxPower += gain;
    pushLog(ctx, `${who.name} gains +${gain} power.`);
    markUsed();
    return null;
  }

  if (act.op === 'tap-bank') {
    source.moved = true;
    source.attacked = true;
    const n = act.n ?? 1;
    bankLoyalty(ctx, source.side, n);
    pushLog(ctx, `${card.name} exhausts and banks ${n}.`);
    markUsed();
    return null;
  }

  if (act.op === 'tap-crown') {
    source.moved = true;
    source.attacked = true;
    ctx.domination[source.side] += 1;
    pushLog(
      ctx,
      `${card.name} exhausts. Domination ${ctx.domination[source.side]}.`,
    );
    markUsed();
    return null;
  }

  if (act.op === 'tap-mend') {
    if (!target) return 'Name a unit.';
    source.moved = true;
    source.attacked = true;
    target.power += 1;
    target.maxPower += 1;
    addGain(target, 1);
    pushLog(ctx, `${target.name} gains +1 power.`);
    markUsed();
    return null;
  }

  if (act.op === 'tap-draw') {
    source.moved = true;
    source.attacked = true;
    drawCards(ctx, source.side, 1);
    pushLog(ctx, `${card.name} exhausts and draws.`);
    markUsed();
    return null;
  }

  if (act.op === 'once-tough') {
    if (!target) return 'Name a unit.';
    target.tough = true;
    if (!target.keywords.includes('tough')) {
      target.keywords = [...target.keywords, 'tough'];
    }
    pushLog(ctx, `${target.name} gains Toughness.`);
    markUsed();
    return null;
  }

  if (act.op === 'sacrifice-bank') {
    const n = act.n ?? 3;
    const name = source.name;
    destroyUnit(ctx, source.uid);
    bankLoyalty(ctx, ctx.side, n);
    pushLog(ctx, `${name} is sacrificed. ${n} resources are banked.`);
    return null;
  }

  if (act.op === 'sacrifice-fast') {
    if (!target) return 'Name a unit.';
    target.fast = true;
    if (!target.keywords.includes('fast')) {
      target.keywords = [...target.keywords, 'fast'];
    }
    destroyUnit(ctx, source.uid);
    pushLog(ctx, `${target.name} gains Fast Attack.`);
    return null;
  }

  if (act.op === 'recall') {
    if (!target) return 'Name a unit.';
    const owner = target.side;
    const name = target.name;
    const def = cardById(target.cardId);
    const pos = findPos(ctx, target.uid);
    if (pos) ctx.board[pos.r][pos.c] = null;
    delete ctx.units[target.uid];
    const bounced: Card = def
      ? { ...def }
      : {
          id: target.cardId,
          name,
          faction: '',
          kind: 'unit',
          rarity: 'common',
          cost: 0,
          oath: 0,
          keywords: [],
          text: '',
        };
    if (ctx.hand[owner].length < HAND_CAP) ctx.hand[owner].push(bounced);
    else ctx.discard[owner].push(bounced);
    pushLog(ctx, `${name} is returned to hand.`);
    markUsed();
    return null;
  }

  if (act.op === 'copy') {
    if (!target) return 'Name a unit.';
    source.power = target.power;
    source.maxPower = target.power;
    pushLog(ctx, `${card.name} takes on the power of ${target.name}.`);
    markUsed();
    return null;
  }

  return 'That power does not answer.';
}


/** True when a choice-plate op still needs the player's pick before it may fire. */
export function leaderChoicePending(
  leader: Card,
  opts: LeaderOpts = {},
  aim?: { unitUid?: string; secondUid?: string; discardIndex?: number } | null,
): boolean {
  const op = leader.leaderPower?.op;
  if (op === 'seek') return opts.seek !== 'unit' && opts.seek !== 'rite';
  if (op === 'recall') return opts.discardIndex == null;
  if (op === 'scry3') return opts.pick == null;
  if (op === 'revive_coven') {
    const disc = opts.discardIndex ?? aim?.discardIndex;
    return disc == null;
  }
  if (op === 'copy_kw') return !opts.secondUid && !aim?.secondUid;
  return false;
}

export function leaderNeedsAim(leader: Card): boolean {
  const op = leader.leaderPower?.op;
  if (!op) return false;
  if (op === 'scry3' || op === 'seek' || op === 'recall') return false; // modal choice, not a board aim
  return LEADER_AIMED.has(op) || op === 'claim' || op === 'slide';
}

/** Leader workings that open a choice plate before (or instead of) board aim. */
export function leaderNeedsChoice(leader: Card): 'scry3' | 'seek' | 'recall' | 'revive' | 'copy_kw' | null {
  const op = leader.leaderPower?.op;
  if (op === 'scry3') return 'scry3';
  if (op === 'seek') return 'seek';
  if (op === 'recall') return 'recall';
  if (op === 'revive_coven') return 'revive';
  if (op === 'copy_kw') return 'copy_kw';
  return null;
}

export { LOYALTY_CAP, foe as foeSide };
