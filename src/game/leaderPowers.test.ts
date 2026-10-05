/**
 * Redesigned unique leader workings (Oct 2026).
 */
import { describe, expect, it } from 'vitest';
import { cardById, CARDS } from '../data/catalog';
import {
  destroyUnit,
  leaderChoicePending,
  resolveEffect,
  resolveLeaderPower,
  tickLeaderAuras,
  type EffectCtx,
  type EffectUnit,
} from './effects';
import { mapById, type Side } from './maps';
import { HAND_CAP } from './scoring';

const tiles = mapById('leaden-court').tiles;

function ctx0(side: Side = 'blue'): EffectCtx {
  return {
    side,
    loyalty: { blue: 10, red: 10 },
    domination: { blue: 0, red: 0 },
    hand: { blue: [], red: [] },
    deck: { blue: [], red: [] },
    discard: { blue: [], red: [] },
    units: {},
    board: Array.from({ length: 5 }, () => Array(5).fill(null)),
    control: Array.from({ length: 5 }, () => Array(5).fill(null)),
    log: [],
    tiles,
  };
}

function put(
  ctx: EffectCtx,
  id: string,
  uid: string,
  side: Side,
  r: number,
  c: number,
  over: Partial<EffectUnit> = {},
) {
  const card = cardById(id)!;
  const u: EffectUnit = {
    uid,
    cardId: id,
    name: card.name,
    side,
    power: card.power ?? 1,
    maxPower: card.power ?? 1,
    loyalty: card.cost,
    keywords: [...card.keywords],
    ...over,
  };
  ctx.units[uid] = u;
  ctx.board[r][c] = uid;
  return u;
}

const lion = () => CARDS.find((c) => c.faction === 'Sons of the Green Lion' && c.kind === 'unit')!;
const works = () => CARDS.find((c) => c.faction === 'The Mercury Works' && c.kind === 'unit')!;
const thorn = () => CARDS.find((c) => c.faction === 'The Whitethorn Coven' && c.kind === 'unit')!;
const otherUnit = () => CARDS.find((c) => c.faction === 'The Vril Syndicate' && c.kind === 'unit')!;

describe('Green Sovereign green_surge', () => {
  it('gives +1 power to every owned Sons of the Green Lion unit', () => {
    const ctx = ctx0();
    const L = lion();
    const O = otherUnit();
    put(ctx, L.id, 'a', 'blue', 2, 2);
    put(ctx, L.id, 'b', 'blue', 2, 3);
    put(ctx, O.id, 'c', 'blue', 3, 2);
    const before = ctx.units.a.power;
    expect(resolveLeaderPower(ctx, cardById('the_green_sovereign')!)).toBeNull();
    expect(ctx.units.a.power).toBe(before + 1);
    expect(ctx.units.b.power).toBe(before + 1);
    expect(ctx.units.c.power).toBe(O.power);
    expect(ctx.loyalty.blue).toBe(8);
  });
});

describe('Provost of the Azoth copy_kw', () => {
  it('copies keywords from the teacher onto the pupil', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 't', 'blue', 2, 2, { keywords: ['fast', 'tough', 'ranged'] });
    put(ctx, 'devoted_clerk', 'p', 'blue', 2, 3, { keywords: [] });
    expect(resolveLeaderPower(ctx, cardById('provost_of_the_azoth')!, 't', undefined, { secondUid: 'p' })).toBeNull();
    expect(ctx.units.p.keywords).toEqual(expect.arrayContaining(['fast', 'tough', 'ranged']));
    expect(ctx.units.p.tough).toBe(true);
    expect(ctx.units.p.fast).toBe(true);
  });
});

describe('Rector of the Monad scry3', () => {
  it('puts the named card in hand and the rest on the bottom', () => {
    const ctx = ctx0();
    const a = cardById('devoted_clerk')!;
    const b = cardById('the_hydesville_knock')!;
    const c = lion();
    ctx.deck.blue = [{ ...a }, { ...b }, { ...c }, { ...a }];
    expect(resolveLeaderPower(ctx, cardById('rector_of_the_monad')!, undefined, undefined, { pick: 1 })).toBeNull();
    expect(ctx.hand.blue[0].id).toBe(b.id);
    expect(ctx.deck.blue.map((x) => x.id)).toEqual([a.id, a.id, c.id]);
  });
});

describe('Leaden Stare ward', () => {
  it('blocks enemy spells from naming the unit', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'a', 'blue', 2, 2);
    expect(resolveLeaderPower(ctx, cardById('the_leaden_stare')!, 'a')).toBeNull();
    expect(ctx.units.a.warded).toBe(true);
    ctx.side = 'red';
    ctx.hand.red.push(cardById('the_hydesville_knock')!);
    // smite-like: use resolveEffect with smite
    const err = resolveEffect(ctx, { op: 'smite', n: 2 }, { name: 'Test' }, 'a');
    expect(err).toMatch(/warded/);
  });
});

describe('Mad Starets last_stand', () => {
  it('grants Toughness and survives the next lethal blow at 1', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'a', 'blue', 2, 2, { power: 2, maxPower: 2 });
    expect(resolveLeaderPower(ctx, cardById('the_mad_starets')!, 'a')).toBeNull();
    expect(ctx.units.a.tough).toBe(true);
    expect(ctx.units.a.lastStand).toBe(true);
    destroyUnit(ctx, 'a');
    expect(ctx.units.a).toBeDefined();
    expect(ctx.units.a.power).toBe(1);
    expect(ctx.units.a.lastStand).toBe(false);
    destroyUnit(ctx, 'a');
    expect(ctx.units.a).toBeUndefined();
  });
});

describe('Father of the Last Icon icon_harvest', () => {
  it('banks 2 when an enemy dies this turn', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'e', 'red', 1, 2);
    expect(resolveLeaderPower(ctx, cardById('father_of_the_last_icon')!)).toBeNull();
    const before = ctx.loyalty.blue;
    destroyUnit(ctx, 'e');
    expect(ctx.loyalty.blue).toBe(before + 2);
  });
});

describe('May Queen charge', () => {
  it('grants Fast Attack, readies, and mustStrike', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'a', 'blue', 2, 2, { sick: true, moved: true, attacked: true });
    expect(resolveLeaderPower(ctx, cardById('the_may_queen')!, 'a')).toBeNull();
    expect(ctx.units.a.keywords).toContain('fast');
    expect(ctx.units.a.mustStrike).toBe(true);
    expect(ctx.units.a.sick || ctx.units.a.moved || ctx.units.a.attacked).toBe(false);
  });
});

describe('Director Voss ready_works', () => {
  it('readies every Mercury Works unit you own', () => {
    const ctx = ctx0();
    const W = works();
    const O = otherUnit();
    put(ctx, W.id, 'a', 'blue', 2, 2, { sick: true, moved: true, attacked: true });
    put(ctx, O.id, 'b', 'blue', 2, 3, { sick: true, moved: true, attacked: true });
    expect(resolveLeaderPower(ctx, cardById('director_voss')!)).toBeNull();
    expect(ctx.units.a.sick || ctx.units.a.moved || ctx.units.a.attacked).toBe(false);
    expect(ctx.units.b.sick && ctx.units.b.moved && ctx.units.b.attacked).toBe(true);
  });
});

describe('Iron Saint breach', () => {
  it('readies the unit and marks breach', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'a', 'blue', 2, 2, { sick: true, moved: true, attacked: true });
    expect(resolveLeaderPower(ctx, cardById('the_iron_saint')!, 'a')).toBeNull();
    expect(ctx.units.a.breach).toBe(true);
    expect(ctx.units.a.sick || ctx.units.a.moved || ctx.units.a.attacked).toBe(false);
  });
});

describe('Whitethorn Queen revive_coven', () => {
  it('returns a coven unit from discard at 1 power, exhausted', () => {
    const ctx = ctx0();
    const T = thorn();
    ctx.discard.blue.push({ ...T });
    ctx.control[2][0] = 'blue';
    expect(
      resolveLeaderPower(ctx, cardById('the_whitethorn_queen')!, undefined, { r: 2, c: 0 }, { discardIndex: 0 }),
    ).toBeNull();
    const uid = ctx.board[2][0]!;
    const u = ctx.units[uid];
    expect(u.cardId).toBe(T.id);
    expect(u.power).toBe(1);
    expect(u.sick && u.moved && u.attacked).toBe(true);
    expect(ctx.discard.blue).toHaveLength(0);
  });
});

describe('Widowed Saint death_tithe', () => {
  it('draws 1 and banks 1 when your unit dies this turn', () => {
    const ctx = ctx0();
    ctx.deck.blue.push(cardById('devoted_clerk')!);
    put(ctx, 'devoted_clerk', 'a', 'blue', 2, 2);
    expect(resolveLeaderPower(ctx, cardById('the_widowed_saint')!)).toBeNull();
    const bank = ctx.loyalty.blue;
    destroyUnit(ctx, 'a');
    expect(ctx.hand.blue).toHaveLength(1);
    expect(ctx.loyalty.blue).toBe(bank + 1);
  });
});

describe('Gold Fraud steal_res', () => {
  it('steals 2 when the foe has them', () => {
    const ctx = ctx0();
    ctx.loyalty.red = 5;
    expect(resolveLeaderPower(ctx, cardById('the_gold_fraud')!)).toBeNull();
    expect(ctx.loyalty.red).toBe(3);
    expect(ctx.loyalty.blue).toBe(10); // paid 2, banked 2
  });
  it('banks 2 when the foe has fewer', () => {
    const ctx = ctx0();
    ctx.loyalty.red = 1;
    expect(resolveLeaderPower(ctx, cardById('the_gold_fraud')!)).toBeNull();
    expect(ctx.loyalty.red).toBe(0);
    expect(ctx.loyalty.blue).toBe(10);
  });
});

describe('Edgar Cayce recall (discard pick)', () => {
  it('refuses to fire without an explicit discardIndex (no silent first-match)', () => {
    const ctx = ctx0();
    const unit = cardById('devoted_clerk')!;
    ctx.discard.blue = [{ ...unit }, { ...cardById('the_hydesville_knock')! }];
    const before = ctx.loyalty.blue;
    const err = resolveLeaderPower(ctx, cardById('edgar_cayce')!);
    expect(err).toMatch(/discard/i);
    expect(ctx.loyalty.blue).toBe(before);
    expect(ctx.hand.blue).toHaveLength(0);
    expect(ctx.discard.blue).toHaveLength(2);
    expect(leaderChoicePending(cardById('edgar_cayce')!)).toBe(true);
    expect(leaderChoicePending(cardById('edgar_cayce')!, { discardIndex: 1 })).toBe(false);
  });

  it('aborts with a clear message (no pay) when discard has nothing eligible', () => {
    const ctx = ctx0();
    // Heroes are not recallable.
    ctx.discard.blue = [{ ...cardById('edgar_cayce')! }];
    const before = ctx.loyalty.blue;
    const err = resolveLeaderPower(ctx, cardById('edgar_cayce')!, undefined, undefined, { discardIndex: 0 });
    expect(err).toMatch(/unit or spell/i);
    expect(ctx.loyalty.blue).toBe(before);
    expect(ctx.discard.blue).toHaveLength(1);
  });

  it('puts the named discard card into hand', () => {
    const ctx = ctx0();
    const unit = cardById('devoted_clerk')!;
    const rite = cardById('the_hydesville_knock')!;
    ctx.discard.blue = [{ ...unit }, { ...rite }];
    expect(resolveLeaderPower(ctx, cardById('edgar_cayce')!, undefined, undefined, { discardIndex: 1 })).toBeNull();
    expect(ctx.hand.blue[0].id).toBe(rite.id);
    expect(ctx.discard.blue.map((c) => c.id)).toEqual([unit.id]);
    expect(ctx.loyalty.blue).toBe(8);
  });

  it('refuses when the hand is sealed (no pay)', () => {
    const ctx = ctx0();
    const unit = cardById('devoted_clerk')!;
    ctx.discard.blue = [{ ...unit }];
    ctx.hand.blue = Array.from({ length: HAND_CAP }, () => ({ ...unit }));
    const before = ctx.loyalty.blue;
    expect(resolveLeaderPower(ctx, cardById('edgar_cayce')!, undefined, undefined, { discardIndex: 0 })).toMatch(
      /hand is sealed/i,
    );
    expect(ctx.loyalty.blue).toBe(before);
    expect(ctx.discard.blue).toHaveLength(1);
  });
});

describe('Whitethorn revive requires an explicit discard pick', () => {
  it('refuses without discardIndex (no silent first Whitethorn)', () => {
    const ctx = ctx0();
    const T = thorn();
    ctx.discard.blue.push({ ...T });
    ctx.control[2][0] = 'blue';
    const before = ctx.loyalty.blue;
    const err = resolveLeaderPower(ctx, cardById('the_whitethorn_queen')!, undefined, { r: 2, c: 0 });
    expect(err).toMatch(/whitethorn/i);
    expect(ctx.loyalty.blue).toBe(before);
    expect(ctx.board[2][0]).toBeNull();
  });
});

describe('Rector scry3 choice is required', () => {
  it('refuses to fire without an explicit pick (no silent first-card default)', () => {
    const ctx = ctx0();
    const a = cardById('devoted_clerk')!;
    ctx.deck.blue = [{ ...a }, { ...a }, { ...a }];
    const before = ctx.loyalty.blue;
    expect(resolveLeaderPower(ctx, cardById('rector_of_the_monad')!)).toMatch(/name which/i);
    expect(ctx.loyalty.blue).toBe(before);
    expect(leaderChoicePending(cardById('rector_of_the_monad')!)).toBe(true);
    expect(leaderChoicePending(cardById('rector_of_the_monad')!, { pick: 0 })).toBe(false);
  });
});

describe('Whitethorn revive and Provost copy still need their picks', () => {
  it('revive stays pending until a discard index is named', () => {
    expect(leaderChoicePending(cardById('the_whitethorn_queen')!)).toBe(true);
    expect(leaderChoicePending(cardById('the_whitethorn_queen')!, { discardIndex: 0 })).toBe(false);
  });
  it('copy_kw stays pending until a pupil is named', () => {
    expect(leaderChoicePending(cardById('provost_of_the_azoth')!)).toBe(true);
    expect(leaderChoicePending(cardById('provost_of_the_azoth')!, { secondUid: 'p' })).toBe(false);
  });
});

describe('Mute Alchemist transmute', () => {
  it('turns an enemy into a 1-power exhausted Homunculus', () => {
    const ctx = ctx0();
    put(ctx, 'devoted_clerk', 'e', 'red', 1, 2, { power: 4, maxPower: 4, keywords: ['fast', 'ranged'] });
    expect(resolveLeaderPower(ctx, cardById('the_mute_alchemist')!, 'e')).toBeNull();
    expect(ctx.loyalty.blue).toBe(7);
    const u = ctx.units.e;
    expect(u.name).toBe('Homunculus');
    expect(u.cardId).toBe('homunculus_token');
    expect(u.power).toBe(1);
    expect(u.sick && u.moved && u.attacked).toBe(true);
    expect(u.keywords).toContain('token');
  });
});

describe('tickLeaderAuras', () => {
  it('clears turn auras after two rite opens', () => {
    const ctx = ctx0();
    ctx.iconHarvestSide = 'blue';
    ctx.iconHarvestOpens = 2;
    ctx.deathTitheSide = 'blue';
    ctx.deathTitheOpens = 2;
    put(ctx, 'devoted_clerk', 'a', 'red', 1, 1, { breach: true, mustStrike: true });
    ctx.side = 'blue';
    tickLeaderAuras(ctx);
    expect(ctx.iconHarvestOpens).toBe(1);
    expect(ctx.units.a.breach).toBe(false);
    tickLeaderAuras(ctx);
    expect(ctx.iconHarvestSide).toBeUndefined();
    expect(ctx.deathTitheSide).toBeUndefined();
  });
});
