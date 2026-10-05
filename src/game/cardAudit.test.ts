/**
 * Whole-catalogue mechanics audit: every card's printed effect / power /
 * leader working / keyword must be handled by the engine (no unknown ops,
 * no silent no-ops), and keyword words in the text must match the keyword
 * list the engine reads.
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/catalog';
import {
  castFromHand,
  resolveActivatedAbility,
  resolveLeaderPower,
  type EffectCtx,
  type EffectUnit,
} from './effects';
import { KEYWORDS } from './keywords';
import { mapById, type Side } from './maps';
import { HANDLED_KEYWORDS } from './rules';
import type { Card } from './types';

const tiles = mapById('leaden-court').tiles;

function mk(uid: string, side: Side, power: number, extra: Partial<EffectUnit> = {}): EffectUnit {
  return {
    uid,
    cardId: 'devoted_clerk',
    name: uid,
    side,
    power,
    maxPower: power,
    loyalty: 3,
    keywords: [],
    ...extra,
  };
}

/** A busy board: allies and foes around the middle, decks/hands stocked. */
function busyCtx(): EffectCtx {
  const filler = CARDS.find((c) => c.id === 'devoted_clerk')!;
  const rite = CARDS.find((c) => c.id === 'the_hydesville_knock')!;
  const ctx: EffectCtx = {
    side: 'blue',
    loyalty: { blue: 10, red: 8 },
    domination: { blue: 0, red: 0 },
    hand: { blue: [filler, filler], red: [filler, filler] },
    deck: { blue: Array(10).fill(filler), red: Array(10).fill(filler) },
    discard: { blue: [rite, filler], red: [filler] },
    units: {},
    board: Array.from({ length: 5 }, () => Array(5).fill(null)),
    control: Array.from({ length: 5 }, () => Array(5).fill(null)),
    log: [],
    tiles,
  };
  const put = (u: EffectUnit, r: number, c: number) => {
    ctx.units[u.uid] = u;
    ctx.board[r][c] = u.uid;
  };
  // Ally A (exhausted, so shove/slide may name it), ally B fresh.
  put(mk('allyA', 'blue', 4, { moved: true, attacked: true, keywords: ['gills'] }), 2, 2);
  put(mk('allyB', 'blue', 3, { sick: true, moved: true, attacked: true }), 3, 1);
  // Foes adjacent to ally A, one ranged.
  put(mk('foeA', 'red', 4, { keywords: ['ranged'] }), 1, 2);
  put(mk('foeB', 'red', 2, { moved: true, attacked: true }), 2, 3);
  // Faction-tagged allies for green_surge / ready_works audits.
  const lion = CARDS.find((c) => c.faction === 'Sons of the Green Lion' && c.kind === 'unit')!;
  const works = CARDS.find((c) => c.faction === 'The Mercury Works' && c.kind === 'unit')!;
  const thorn = CARDS.find((c) => c.faction === 'The Whitethorn Coven' && c.kind === 'unit')!;
  put({ ...mk('lionA', 'blue', 2), cardId: lion.id, name: lion.name, keywords: [...lion.keywords] }, 4, 0);
  put({ ...mk('worksA', 'blue', 2, { sick: true, moved: true, attacked: true }), cardId: works.id, name: works.name, keywords: [...works.keywords] }, 4, 1);
  ctx.discard.blue.push(thorn);
  ctx.control[2][0] = 'blue';
  // Deck with a rite so seek/scry3 always find something.
  const riteCard = CARDS.find((c) => c.kind === 'rite')!;
  ctx.deck.blue = [filler, riteCard, filler, filler, filler, filler, filler, filler, filler, filler];
  return ctx;
}

function stateKey(ctx: EffectCtx): string {
  const { log: _log, pips: _pips, ...rest } = ctx;
  void _log;
  void _pips;
  return JSON.stringify(rest);
}

const SILENT_NOOP = /obscure rite|works \(|does not answer/;

/** Best target for an aimed rite / leader / act. */
function targetsFor(op: string): { target?: string; aimPos?: { r: number; c: number } } {
  switch (op) {
    case 'empower':
    case 'sacrifice_splash':
    case 'sacrifice_bank':
    case 'mend':
    case 'haste':
    case 'bulwark':
    case 'empower_draw':
    case 'ward':
    case 'last_stand':
    case 'charge':
    case 'breach':
    case 'martyr':
    case 'snuff':
    case 'recall':
    case 'bolster':
    case 'once-power':
    case 'once-tough':
    case 'tap-mend':
      return { target: 'allyA' };
    case 'sacrifice-fast':
      return { target: 'allyB' };
    case 'shove':
    case 'slide':
      return { target: 'allyA', aimPos: { r: 2, c: 1 } };
    case 'claim':
      return { aimPos: { r: 3, c: 3 } };
    case 'revive_coven':
      return { aimPos: { r: 2, c: 0 } };
    case 'copy_kw':
      return { target: 'allyA' };
    case 'transmute':
      return { target: 'foeA' };
    case 'jab':
    case 'sacrifice-hit':
    case 'once-sting':
    case 'once-nick':
    case 'copy':
    default:
      return { target: 'foeA' };
  }
}

describe('card audit: every effect op is handled (no unknown / no-op)', () => {
  const rites = CARDS.filter((c) => (c.kind === 'rite' || c.kind === 'device') && c.effect);
  it.each(rites.map((c) => [c.id, c] as [string, Card]))('%s resolves and changes the board', (_id, card) => {
    const ctx = busyCtx();
    ctx.hand.blue.push(card);
    const { target, aimPos } = targetsFor(card.effect!.op);
    // Baseline = only the cost paid and the card spent (a silent no-op).
    const base = structuredClone(ctx);
    base.loyalty.blue -= card.cost;
    base.hand.blue.pop();
    base.discard.blue.push(card);
    const before = stateKey(base);
    const err = castFromHand(ctx, 'blue', ctx.hand.blue.length - 1, target, aimPos);
    expect(err).toBeNull();
    expect(ctx.log.join(' | ')).not.toMatch(SILENT_NOOP);
    expect(stateKey(ctx)).not.toBe(before);
    // The card itself is spent to discard.
    expect(ctx.discard.blue).toContain(card);
  });
});

describe('card audit: every leader working is handled', () => {
  const heroes = CARDS.filter((c) => c.kind === 'hero' && c.leaderPower);
  it.each(heroes.map((c) => [c.id, c] as [string, Card]))('%s', (_id, hero) => {
    const ctx = busyCtx();
    const op = hero.leaderPower!.op;
    const { target, aimPos } = targetsFor(op);
    const opts =
      op === 'copy_kw'
        ? { secondUid: 'allyB' }
        : op === 'scry3'
          ? { pick: 0 }
          : op === 'seek'
            ? { seek: 'unit' as const }
            : op === 'revive_coven'
              ? { discardIndex: ctx.discard.blue.findIndex((c) => c.faction === 'The Whitethorn Coven') }
              : {};
    const base = structuredClone(ctx);
    base.loyalty.blue -= hero.cost;
    const before = stateKey(base);
    const err = resolveLeaderPower(ctx, hero, target, aimPos, opts);
    expect(err).toBeNull();
    expect(ctx.log.join(' | ')).not.toMatch(SILENT_NOOP);
    expect(stateKey(ctx)).not.toBe(before);
  });
});

describe('card audit: every activated power is handled', () => {
  const actors = CARDS.filter((c) => c.kind === 'unit' && c.act && c.act.op !== 'gadget');
  it.each(actors.map((c) => [c.id, c] as [string, Card]))('%s', (_id, card) => {
    const ctx = busyCtx();
    // Put the actor beside foeA (at 1,1 is a resource; use 0,... no — 1,3).
    const src: EffectUnit = {
      ...mk('src', 'blue', card.power ?? 2),
      cardId: card.id,
      name: card.name,
      keywords: [...card.keywords],
    };
    ctx.units.src = src;
    ctx.board[1][3] = 'src'; // adjacent to foeA (1,2) and foeB (2,3)
    const op = card.act!.op;
    let { target } = targetsFor(op);
    if (op === 'copy' && !card.act!.foe) target = 'foeA';
    const base = structuredClone(ctx);
    base.loyalty.blue -= card.act!.pay ?? 0;
    const before = stateKey(base);
    const err = resolveActivatedAbility(ctx, 'src', target);
    expect(err).toBeNull();
    expect(ctx.log.join(' | ')).not.toMatch(SILENT_NOOP);
    expect(stateKey(ctx)).not.toBe(before);
  });

  it('justin_kern gadget unmakes every unit', () => {
    const ctx = busyCtx();
    const jk = CARDS.find((c) => c.id === 'justin_kern')!;
    ctx.units.jk = { ...mk('jk', 'blue', 4), cardId: jk.id, name: jk.name };
    ctx.board[4][0] = 'jk';
    expect(resolveActivatedAbility(ctx, 'jk')).toBeNull();
    expect(Object.keys(ctx.units)).toHaveLength(0);
  });
});

describe('card audit: keywords', () => {
  const used = [...new Set(CARDS.flatMap((c) => c.keywords))].sort();

  it.each(used.map((k) => [k]))('keyword %s has an engine handler', (k) => {
    expect(HANDLED_KEYWORDS.has(k)).toBe(true);
  });

  /** Printed keyword words → keyword ids the engine reads. */
  const PHRASES: Array<[RegExp, string]> = [
    [/\bFast Attack\b/, 'fast'],
    [/\bToughness\b/, 'tough'],
    [/\bRanged Strike\b/, 'ranged'],
    [/\bShutter\b/, 'shutter'],
    [/^Lamp\b|\. Lamp\b/, 'crown'],
    [/\bUndine\b/, 'gills'],
    // "Seep cannot wound it" (Undine) is not the Seep keyword itself.
    [/(?:^|\. )Seep\./, 'seep'],
    [/^Relay\b|\. Relay\b/, 'relay'],
    [/\bSlow muster\b/, 'delay'],
    [/\bCryptid\b/, 'cryptid'],
    [/\bCanvass\b/, 'canvass'],
    [/^Poll\b|\. Poll\b/, 'poll'],
    [/\bArrest\b/, 'arrest'],
    [/^Airship\b/, 'airship'],
    [/\bUntargetable\b/, 'veiled'],
  ];

  it.each(CARDS.filter((c) => c.kind === 'unit').map((c) => [c.id, c] as [string, Card]))(
    '%s text and keywords agree',
    (_id, card) => {
      // Ignore keywords the card grants or refers to ("gains Toughness",
      // "even those with Fast Attack") — only printed keywords count.
      const printed = card.text.replace(/\b(gains|with) (Fast Attack|Toughness|Shutter)/g, '');
      for (const [re, k] of PHRASES) {
        if (re.test(printed)) expect(card.keywords, `${card.id} prints ${k}`).toContain(k);
      }
      // Core combat keywords on a unit must be named in its text.
      const named: Record<string, RegExp> = {
        fast: /Fast Attack/,
        tough: /Toughness/,
        ranged: /Ranged Strike/,
        shutter: /Shutter/,
        veiled: /Untargetable/,
        delay: /Slow muster/,
      };
      for (const k of card.keywords) {
        if (named[k]) expect(card.text, `${card.id} has ${k}`).toMatch(named[k]);
      }
    },
  );

  it('every keyword used on a card has a glossary entry or engine rule', () => {
    for (const k of used) {
      expect(!!KEYWORDS[k] || HANDLED_KEYWORDS.has(k)).toBe(true);
    }
  });
});

describe('card audit: player-facing text says Resources, never Loyalty', () => {
  it('no card text mentions loyalty or health', () => {
    for (const c of CARDS) {
      expect(c.text, c.id).not.toMatch(/loyalty/i);
      expect(c.text, c.id).not.toMatch(/\bhealth\b/i);
    }
  });
});
