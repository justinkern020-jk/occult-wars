/** Targeted tests for cards whose text and behaviour disagreed (Oct 2026 audit). */
import { describe, expect, it } from 'vitest';
import { cardById } from '../data/catalog';
import {
  castFromHand,
  resolveActivatedAbility,
  resolveLeaderPower,
  type EffectCtx,
  type EffectUnit,
} from './effects';
import { mapById, type Side } from './maps';
import { refreshForRite, resolveStrike } from './rules';

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

function put(ctx: EffectCtx, id: string, uid: string, side: Side, r: number, c: number, over: Partial<EffectUnit> = {}) {
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

function cast(ctx: EffectCtx, id: string, target?: string, aimPos?: { r: number; c: number }) {
  ctx.hand[ctx.side].push(cardById(id)!);
  return castFromHand(ctx, ctx.side, ctx.hand[ctx.side].length - 1, target, aimPos, () => 0);
}

describe('Lung of the River', () => {
  it('gives +2 power as printed', () => {
    const ctx = ctx0();
    put(ctx, 'tenement_saint', 'a', 'blue', 2, 2);
    expect(cast(ctx, 'lung_of_the_river', 'a')).toBeNull();
    expect(ctx.units.a.power).toBe(6);
    expect(cardById('lung_of_the_river')!.text).toMatch(/\+2 power/);
  });
});

describe('bounce rites return the real card (redeployable)', () => {
  for (const id of ['crosstalk', 'sealed_return', 'the_thirteenth_chair']) {
    it(id, () => {
      const ctx = ctx0();
      put(ctx, 'sleepy_hollow_rider', 'x', 'red', 1, 2);
      expect(cast(ctx, id, 'x')).toBeNull();
      const back = ctx.hand.red[0];
      expect(back.id).toBe('sleepy_hollow_rider');
      expect(back.power).toBe(4);
      expect(back.cost).toBe(4);
      expect(back.keywords).toContain('blooded');
    });
  }
  it('leader bounce (Edgar Allan Poe) too', () => {
    const ctx = ctx0();
    put(ctx, 'sleepy_hollow_rider', 'x', 'red', 1, 2);
    expect(resolveLeaderPower(ctx, cardById('edgar_allan_poe')!, 'x')).toBeNull();
    expect(ctx.hand.red[0].power).toBe(4);
  });
});

describe("Lion's Mask / False Vintage: power becomes N and abilities are lost", () => {
  it("Lion's Mask strips keywords and the activated power", () => {
    const ctx = ctx0();
    put(ctx, 'roof_warden', 'g', 'red', 1, 2, { power: 1 });
    expect(cast(ctx, 'lion_s_mask', 'g')).toBeNull();
    expect(ctx.units.g.power).toBe(4);
    expect(ctx.units.g.keywords).toEqual([]);
    expect(ctx.units.g.silenced).toBe(true);
  });
  it('a silenced unit cannot call its power and leaves no death burst', () => {
    const ctx = ctx0();
    put(ctx, 'hex_banner', 'h', 'blue', 2, 2);
    put(ctx, 'tenement_saint', 'foe', 'red', 1, 2);
    ctx.side = 'red';
    expect(cast(ctx, 'false_vintage', 'h')).toBeNull();
    ctx.side = 'blue';
    expect(resolveActivatedAbility(ctx, 'h', 'foe')).toMatch(/lost its abilities/);
  });
});

describe('Carve the Seal: +2 power and cannot move or attack on its next rite', () => {
  it('own unit keeps this rite, sits out the next', () => {
    const ctx = ctx0();
    put(ctx, 'tenement_saint', 'a', 'blue', 2, 2);
    expect(cast(ctx, 'carve_the_seal', 'a')).toBeNull();
    expect(ctx.units.a.power).toBe(6);
    expect(ctx.units.a.moved).toBeFalsy();
    const next = refreshForRite(ctx.units.a, 'blue');
    expect(next.sick && next.moved && next.attacked).toBe(true);
    const after = refreshForRite(next, 'blue');
    expect(after.moved).toBe(false);
  });
});

describe('Waking the Sleeper: unmake, then discard a card', () => {
  it('discards a card from the caster hand', () => {
    const ctx = ctx0();
    put(ctx, 'tenement_saint', 'x', 'red', 1, 2);
    ctx.hand.blue.push(cardById('ash_lice')!);
    expect(cast(ctx, 'waking_the_sleeper', 'x')).toBeNull();
    expect(ctx.units.x).toBeUndefined();
    expect(ctx.hand.blue).toHaveLength(0);
    expect(ctx.discard.blue.map((c) => c.id).sort()).toEqual(['ash_lice', 'waking_the_sleeper']);
  });
});

describe('claim leaders: an empty circle that is not a stronghold', () => {
  it('rejects a stronghold', () => {
    const ctx = ctx0();
    const err = resolveLeaderPower(ctx, cardById('the_ward_boss')!, undefined, { r: 0, c: 2 });
    expect(err).toMatch(/not a stronghold/);
    expect(ctx.loyalty.blue).toBe(10);
  });
  it('claims a street', () => {
    const ctx = ctx0();
    expect(resolveLeaderPower(ctx, cardById('queen_of_the_hedgerow')!, undefined, { r: 2, c: 2 })).toBeNull();
    expect(ctx.control[2][2]).toBe('blue');
  });
});

describe('The Iron Saint haste: may act at once', () => {
  it('frees a slow-muster unit to act this rite', () => {
    const ctx = ctx0();
    put(ctx, 'lead_golem', 'g', 'blue', 3, 2, { sick: true, moved: true, attacked: true });
    expect(resolveLeaderPower(ctx, cardById('the_iron_saint')!, 'g')).toBeNull();
    expect(ctx.units.g.sick || ctx.units.g.moved || ctx.units.g.attacked).toBe(false);
    expect(ctx.units.g.keywords).toContain('fast');
  });
});

describe('Arrest (Seth Kern): cannot move, may still strike', () => {
  it('an arrested unit strikes but holds its ground after a kill', () => {
    const ctx = ctx0();
    put(ctx, 'tenement_saint', 'a', 'blue', 2, 2, { arrest: 1 });
    put(ctx, 'alley_inquiry', 'x', 'red', 1, 2);
    const out = resolveStrike(ctx, tiles, 'a', 1, 2);
    expect(out.error).toBeNull();
    expect(ctx.units.x).toBeUndefined();
    expect(ctx.board[2][2]).toBe('a');
    expect(ctx.board[1][2]).toBeNull();
  });
  it('Seth Kern arrests a unit he wounds', () => {
    const ctx = ctx0();
    put(ctx, 'seth_kern', 's', 'blue', 3, 2);
    put(ctx, 'the_lead_bear', 'b', 'red', 1, 2);
    resolveStrike(ctx, tiles, 's', 1, 2);
    expect(ctx.units.b.arrest).toBe(2);
  });
});

describe('The Open Retort (devour) only unmakes what meets it in combat', () => {
  it('a ranged shot is not answered by devour', () => {
    const ctx = ctx0();
    put(ctx, 'wire_saint', 'gun', 'blue', 3, 2);
    put(ctx, 'the_open_retort', 'ret', 'red', 1, 2);
    resolveStrike(ctx, tiles, 'gun', 1, 2);
    expect(ctx.units.gun).toBeDefined();
    expect(ctx.units.ret.power).toBe(1);
  });
  it('melee into it is unmade', () => {
    const ctx = ctx0();
    put(ctx, 'tenement_saint', 'a', 'blue', 2, 2);
    put(ctx, 'the_open_retort', 'ret', 'red', 1, 2);
    resolveStrike(ctx, tiles, 'a', 1, 2);
    expect(ctx.units.a).toBeUndefined();
  });
});

describe('flavour text no longer contradicts dual Power', () => {
  it('Poughkeepsie Seer / Tenement Saint / Birch King', () => {
    expect(cardById('poughkeepsie_seer')!.text).not.toMatch(/hits for 2/);
    expect(cardById('tenement_saint')!.text).toMatch(/Four blows, four wounds/);
    expect(cardById('the_birch_king')!.text).toMatch(/Five wounds, five blows/);
  });
});
