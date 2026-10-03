/**
 * Headless Occult Wars engine.
 *
 * Mirrors Battlefield's deploy / move / strike / cast / leader / act / end
 * flow on a plain EffectCtx so the AI can look ahead and tests can play full
 * matches without React. Rules come from the same modules Battlefield uses
 * (rules.ts, effects.ts, control.ts, scoring.ts), so behaviour stays in step.
 */

import type { Side, Tile } from './maps';
import type { Card } from './types';
import type { EffectCtx, EffectUnit } from './effects';
import {
  castFromHand,
  resolveActivatedAbility,
  resolveLeaderPower,
  applyPendingFieldPoison,
} from './effects';
import {
  airshipBeside,
  chillActive,
  cleanupDead,
  conquestTriggers,
  grazeAfterMove,
  isRootedOnBoard,
  leavesUnclaimed,
  musterPower,
  pollBonus,
  refreshForRite,
  resolveStrike,
  riteOpenUpkeep,
  sproutAtRiteEnd,
  type RulesBoard,
} from './rules';
import { canDeployOn, initialControl, isEnemyStronghold, isPaintable, paintTile } from './control';
import {
  DOMINATION_WIN,
  applyBank,
  bankFromHoldings,
  countHoldings,
  type VictoryKind,
} from './scoring';
import { canBeStruck, hasKeyword, manhattan } from './keywords';
import { drawFromDeck } from './deck';

export type EngineAction =
  | { type: 'deploy'; index: number; r: number; c: number }
  | { type: 'move'; uid: string; r: number; c: number }
  | { type: 'attack'; uid: string; targetUid: string }
  | { type: 'cast'; index: number; targetUid?: string; r?: number; c?: number }
  | { type: 'leader'; targetUid?: string; r?: number; c?: number }
  | { type: 'act'; uid: string; targetUid?: string }
  | { type: 'end' };

export type EngineState = {
  tiles: Tile[][];
  ctx: EffectCtx;
  /** Side whose rite it is (mirrors ctx.side). */
  side: Side;
  turn: number;
  leaders: { blue?: Card; red?: Card };
  leaderUsed: { blue: boolean; red: boolean };
  winner: Side | null;
  winKind: VictoryKind | null;
  uidSeq: number;
  rand: () => number;
};

export function foeOf(side: Side): Side {
  return side === 'blue' ? 'red' : 'blue';
}

/** Deterministic LCG for reproducible sims. */
export function seededRand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function emptyGrid<T>(fill: T): T[][] {
  return Array.from({ length: 5 }, () => Array<T>(5).fill(fill));
}

/** Board of unit objects (rules.ts helpers take this shape). */
export function unitBoard(ctx: EffectCtx): RulesBoard<EffectUnit> {
  return ctx.board.map((row) => row.map((id) => (id ? (ctx.units[id] ?? null) : null)));
}

export function unitPos(ctx: EffectCtx, uid: string): { r: number; c: number } | null {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) if (ctx.board[r][c] === uid) return { r, c };
  return null;
}

export function listPlaced(ctx: EffectCtx, side?: Side): (EffectUnit & { r: number; c: number })[] {
  const out: (EffectUnit & { r: number; c: number })[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const id = ctx.board[r][c];
      const u = id ? ctx.units[id] : undefined;
      if (u && (!side || u.side === side)) out.push({ ...u, r, c });
    }
  return out;
}

export function cloneState(s: EngineState): EngineState {
  const units: Record<string, EffectUnit> = {};
  for (const [k, u] of Object.entries(s.ctx.units)) units[k] = { ...u, keywords: [...u.keywords] };
  const ctx: EffectCtx = {
    side: s.ctx.side,
    loyalty: { ...s.ctx.loyalty },
    domination: { ...s.ctx.domination },
    hand: { blue: [...s.ctx.hand.blue], red: [...s.ctx.hand.red] },
    deck: { blue: [...s.ctx.deck.blue], red: [...s.ctx.deck.red] },
    discard: { blue: [...s.ctx.discard.blue], red: [...s.ctx.discard.red] },
    units,
    board: s.ctx.board.map((row) => [...row]),
    control: s.ctx.control.map((row) => [...row]),
    log: [],
    fieldPoisonDamage: s.ctx.fieldPoisonDamage,
    noBankOpens: s.ctx.noBankOpens,
    tiles: s.tiles,
  };
  return { ...s, ctx, leaderUsed: { ...s.leaderUsed }, leaders: { ...s.leaders } };
}

function checkDomination(s: EngineState, side: Side) {
  if (!s.winner && s.ctx.domination[side] >= DOMINATION_WIN) {
    s.winner = side;
    s.winKind = 'dominance';
  }
}

/** Remove any ctx.units entries that are no longer on the board. */
function pruneUnits(ctx: EffectCtx) {
  const on = new Set<string>();
  for (const row of ctx.board) for (const id of row) if (id) on.add(id);
  for (const id of Object.keys(ctx.units)) if (!on.has(id)) delete ctx.units[id];
}

export type NewMatchOpts = {
  tiles: Tile[][];
  blueDeck: Card[];
  redDeck: Card[];
  blueLeader?: Card;
  redLeader?: Card;
  rand?: () => number;
};

/** Fresh match: both draw 5, Azure (blue) banks and opens. */
export function newMatch(o: NewMatchOpts): EngineState {
  const bd = drawFromDeck(o.blueDeck, [], 5);
  const rd = drawFromDeck(o.redDeck, [], 5);
  const control = initialControl(o.tiles);
  const ctx: EffectCtx = {
    side: 'blue',
    loyalty: { blue: 0, red: 0 },
    domination: { blue: 0, red: 0 },
    hand: { blue: bd.hand, red: rd.hand },
    deck: { blue: bd.deck, red: rd.deck },
    discard: { blue: [], red: [] },
    units: {},
    board: emptyGrid<string | null>(null),
    control,
    log: [],
    fieldPoisonDamage: 0,
    noBankOpens: 0,
    tiles: o.tiles,
  };
  ctx.loyalty.blue = applyBank(0, bankFromHoldings(o.tiles, control, 'blue', []));
  return {
    tiles: o.tiles,
    ctx,
    side: 'blue',
    turn: 1,
    leaders: { blue: o.blueLeader, red: o.redLeader },
    leaderUsed: { blue: false, red: false },
    winner: null,
    winKind: null,
    uidSeq: 1,
    rand: o.rand ?? Math.random,
  };
}

/** Apply one action for the side to act. Mutates `s`; returns an error or null. */
export function applyAction(s: EngineState, a: EngineAction): string | null {
  if (s.winner) return 'The hour is over.';
  const ctx = s.ctx;
  const acting = s.side;
  ctx.side = acting;
  switch (a.type) {
    case 'deploy':
      return deploy(s, a.index, a.r, a.c);
    case 'move':
      return move(s, a.uid, a.r, a.c);
    case 'attack': {
      const atk = ctx.units[a.uid];
      const from = unitPos(ctx, a.uid);
      const to = unitPos(ctx, a.targetUid);
      const def = ctx.units[a.targetUid];
      if (!atk || !from || !to || !def) return 'Nothing there to strike.';
      if (atk.side !== acting || def.side === acting) return 'That unit will not heed you.';
      if (atk.sick || atk.moved || atk.attacked) return `${atk.name} cannot act.`;
      if (!canBeStruck(atk, def, manhattan(from.r, from.c, to.r, to.c), from, to)) {
        return 'That foe cannot be struck.';
      }
      const out = resolveStrike(ctx, s.tiles, a.uid, to.r, to.c);
      if (out.error) return out.error;
      pruneUnits(ctx);
      if (out.stronghold) {
        s.winner = acting;
        s.winKind = 'stronghold';
        return null;
      }
      checkDomination(s, acting);
      return null;
    }
    case 'cast': {
      const aim = a.r != null && a.c != null ? { r: a.r, c: a.c } : undefined;
      const err = castFromHand(ctx, acting, a.index, a.targetUid, aim, s.rand);
      if (err) return err;
      pruneUnits(ctx);
      checkDomination(s, acting);
      return null;
    }
    case 'leader': {
      const hero = s.leaders[acting];
      if (!hero) return 'No leader sworn for this chair.';
      if (s.leaderUsed[acting]) return 'The leader has already spoken.';
      const aim = a.r != null && a.c != null ? { r: a.r, c: a.c } : undefined;
      const err = resolveLeaderPower(ctx, hero, a.targetUid, aim);
      if (err) return err;
      s.leaderUsed[acting] = true;
      pruneUnits(ctx);
      checkDomination(s, acting);
      return null;
    }
    case 'act': {
      const src = ctx.units[a.uid];
      if (!src || src.side !== acting) return 'That unit will not heed you.';
      const err = resolveActivatedAbility(ctx, a.uid, a.targetUid);
      if (err) return err;
      pruneUnits(ctx);
      checkDomination(s, acting);
      return null;
    }
    case 'end':
      endRite(s);
      return null;
  }
}

function deploy(s: EngineState, index: number, r: number, c: number): string | null {
  const ctx = s.ctx;
  const acting = s.side;
  const card = ctx.hand[acting][index];
  if (!card || card.kind !== 'unit' || card.power == null) return 'Not a unit.';
  if (ctx.board[r]?.[c]) return 'That circle is occupied.';
  const tile = s.tiles[r]?.[c];
  if (!tile) return 'Off the field.';
  const board = unitBoard(ctx);
  const fromAirship =
    airshipBeside(board, acting, r, c) && tile.kind !== 'void' && !isEnemyStronghold(tile, acting);
  if (!canDeployOn(tile, ctx.control, r, c, acting) && !fromAirship) return 'Cannot deploy there.';
  if (ctx.loyalty[acting] < card.cost) return `Not enough resources (need ${card.cost}).`;
  const delayed = hasKeyword(card, 'delay') || chillActive(board, acting);
  const p = musterPower(card, board, acting);
  const uid = `e${s.uidSeq++}`;
  const relays = listPlaced(ctx, acting).filter((u) => hasKeyword(u, 'relay')).length;
  ctx.units[uid] = {
    uid,
    cardId: card.id,
    name: card.name,
    side: acting,
    power: p,
    maxPower: p,
    loyalty: card.cost,
    keywords: [...card.keywords],
    moved: delayed,
    attacked: delayed,
    sick: delayed,
  };
  ctx.board[r][c] = uid;
  ctx.loyalty[acting] -= card.cost;
  ctx.hand[acting] = ctx.hand[acting].filter((_, i) => i !== index);
  const discardSide: Side | null = hasKeyword(card, 'berserk')
    ? acting
    : hasKeyword(card, 'charm')
      ? foeOf(acting)
      : null;
  if (discardSide) {
    const pool = ctx.hand[discardSide];
    if (pool.length > 0) {
      const i = Math.floor(s.rand() * pool.length);
      const [lost] = pool.splice(i, 1);
      ctx.discard[discardSide].push(lost);
    }
  }
  if (hasKeyword(card, 'scandal')) {
    const other = foeOf(acting);
    ctx.loyalty[other] = Math.max(0, ctx.loyalty[other] - 2);
  }
  if (relays > 0) {
    const d = drawFromDeck(ctx.deck[acting], ctx.hand[acting], relays);
    ctx.deck[acting] = d.deck;
    ctx.hand[acting] = d.hand;
  }
  return null;
}

function move(s: EngineState, uid: string, r: number, c: number): string | null {
  const ctx = s.ctx;
  const u = ctx.units[uid];
  const from = unitPos(ctx, uid);
  if (!u || !from || u.side !== s.side) return 'That unit will not heed you.';
  if (u.sick || u.moved || u.attacked) return `${u.name} cannot act.`;
  if ((u.arrest ?? 0) > 0) return `${u.name} is arrested.`;
  const board = unitBoard(ctx);
  if (isRootedOnBoard(board, u.side, from.r, from.c)) return `${u.name} is rooted.`;
  const tile = s.tiles[r]?.[c];
  if (!tile || tile.kind === 'void') return 'Off the field.';
  if (ctx.board[r][c]) return 'That circle is occupied.';
  if (manhattan(from.r, from.c, r, c) !== 1) return 'Move only to an adjacent circle.';
  ctx.board[from.r][from.c] = null;
  ctx.board[r][c] = uid;
  if (isEnemyStronghold(tile, u.side) && !leavesUnclaimed(u)) {
    u.moved = true;
    ctx.control[r][c] = u.side;
    s.winner = u.side;
    s.winKind = 'stronghold';
    return null;
  }
  const unclaimed = leavesUnclaimed(u);
  const conquers = !unclaimed && isPaintable(tile) && ctx.control[r][c] !== u.side;
  let ctrl = ctx.control;
  if (!unclaimed && isPaintable(tile)) {
    ctrl = paintTile(ctrl, s.tiles, r, c, u.side);
    if (conquers) {
      const won = conquestTriggers({ ...u }, s.tiles, ctrl, r, c);
      ctrl = won.control;
      u.power = won.power;
      u.maxPower = won.maxPower;
      if (won.bank > 0) ctx.loyalty[u.side] = applyBank(ctx.loyalty[u.side], won.bank);
      if (won.domination > 0) ctx.domination[u.side] += won.domination;
    }
  }
  ctrl = grazeAfterMove(u, s.tiles, ctrl, r, c).control;
  ctx.control = ctrl;
  u.moved = true;
  checkDomination(s, u.side);
  return null;
}

/** End the acting side's rite: score, sprout, then open the foe's rite. */
export function endRite(s: EngineState) {
  const ctx = s.ctx;
  const acting = s.side;
  const board = unitBoard(ctx);
  const scored =
    ctx.domination[acting] + countHoldings(s.tiles, ctx.control, acting) + pollBonus(board, ctx.control, acting);
  ctx.domination[acting] = scored;
  if (scored >= DOMINATION_WIN) {
    s.winner = acting;
    s.winKind = 'dominance';
    return;
  }
  const sprouted = sproutAtRiteEnd(board, acting);
  applyBoardUnits(ctx, sprouted.board);
  const next = foeOf(acting);
  s.side = next;
  s.turn += 1;
  ctx.side = next;
  openRite(s);
}

function applyBoardUnits(ctx: EffectCtx, b: RulesBoard<EffectUnit>) {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = b[r][c];
      if (u) ctx.units[u.uid] = u;
    }
}

function openRite(s: EngineState) {
  const ctx = s.ctx;
  const next = s.side;
  const prev = foeOf(next);
  for (const id of Object.keys(ctx.units)) {
    const u = ctx.units[id];
    let arrest = u.arrest ?? 0;
    if (u.side === prev && arrest > 0) arrest -= 1;
    ctx.units[id] = refreshForRite({ ...u, arrest }, next);
  }
  const upkeep = riteOpenUpkeep(unitBoard(ctx), next, ctx.loyalty[next]);
  applyBoardUnits(ctx, upkeep.board);
  ctx.loyalty[next] = upkeep.loyalty;
  if ((ctx.fieldPoisonDamage ?? 0) > 0) {
    applyPendingFieldPoison(ctx, ctx.fieldPoisonDamage ?? 0);
    ctx.fieldPoisonDamage = 0;
  }
  cleanupDead(ctx);
  pruneUnits(ctx);
  const d = drawFromDeck(ctx.deck[next], ctx.hand[next], 1);
  ctx.deck[next] = d.deck;
  ctx.hand[next] = d.hand;
  let gain = bankFromHoldings(s.tiles, ctx.control, next, listPlaced(ctx));
  if (next === 'red' && s.turn === 2) gain += 1;
  if ((ctx.noBankOpens ?? 0) > 0) {
    ctx.noBankOpens = (ctx.noBankOpens ?? 0) - 1;
    gain = 0;
  }
  ctx.loyalty[next] = applyBank(ctx.loyalty[next], gain);
  checkDomination(s, next);
}

export type Policy = (s: EngineState, avoid: string[]) => EngineAction;

export type MatchResult = { winner: Side | null; winKind: VictoryKind | null; turns: number };

/**
 * Play a full match between two policies. An illegal pick is fed back through
 * `avoid` (like Battlefield's AI loop) and the policy asked again.
 */
export function playMatch(
  start: EngineState,
  policies: { blue: Policy; red: Policy },
  opts: { maxTurns?: number; maxActionsPerTurn?: number } = {},
): MatchResult {
  const s = start;
  const maxTurns = opts.maxTurns ?? 120;
  const perTurn = opts.maxActionsPerTurn ?? 24;
  while (!s.winner && s.turn <= maxTurns) {
    let n = 0;
    const turn = s.turn;
    const avoid: string[] = [];
    while (!s.winner && s.turn === turn) {
      n += 1;
      const a = n > perTurn ? ({ type: 'end' } as EngineAction) : policies[s.side](s, avoid);
      const err = applyAction(s, a);
      if (err) {
        avoid.push(JSON.stringify(a));
        if (a.type === 'end') break;
      }
    }
  }
  return { winner: s.winner, winKind: s.winKind, turns: s.turn };
}
