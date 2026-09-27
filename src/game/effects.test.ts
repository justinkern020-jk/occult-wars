import { describe, expect, it } from 'vitest';
import {
  actNeedsAim,
  resolveActivatedAbility,
  resolveEffect,
  type EffectCtx,
  type EffectUnit,
} from './effects';
import { cardById } from '../data/catalog';
import type { Side } from './maps';

function emptyBoard(): (string | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
}

function unit(
  partial: Partial<EffectUnit> & {
    uid: string;
    cardId: string;
    name: string;
    side: Side;
    power: number;
  },
): EffectUnit {
  return {
    maxPower: partial.power,
    loyalty: partial.loyalty ?? 2,
    keywords: [],
    ...partial,
  };
}

function baseCtx(side: Side = 'blue'): EffectCtx {
  return {
    side,
    loyalty: { blue: 6, red: 6 },
    domination: { blue: 0, red: 0 },
    hand: { blue: [], red: [] },
    deck: { blue: [], red: [] },
    discard: { blue: [], red: [] },
    units: {},
    board: emptyBoard(),
    control: Array.from({ length: 5 }, () => Array(5).fill(null)),
    log: [],
  };
}

function place(ctx: EffectCtx, u: EffectUnit, r: number, c: number) {
  ctx.units[u.uid] = u;
  ctx.board[r][c] = u.uid;
}

describe('actNeedsAim', () => {
  it('flags aim acts and sacrifice-hit / jab', () => {
    expect(actNeedsAim({ op: 'sacrifice-bank', n: 3 })).toBe(false);
    expect(actNeedsAim({ op: 'sacrifice-hit', n: 3, aim: true })).toBe(true);
    expect(actNeedsAim({ op: 'jab', pay: 1, aim: true })).toBe(true);
    expect(actNeedsAim({ op: 'tap-draw' })).toBe(false);
    expect(actNeedsAim({ op: 'self-power', pay: 2 })).toBe(false);
  });
});

describe('resolveActivatedAbility', () => {
  it('sacrifice-bank destroys self and banks resources', () => {
    const coil = cardById('faustian_coilwright');
    expect(coil?.act?.op).toBe('sacrifice-bank');
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'c1',
        cardId: 'faustian_coilwright',
        name: 'Faustian Coilwright',
        side: 'blue',
        power: 2,
        loyalty: 2,
      }),
      2,
      2,
    );
    const before = ctx.loyalty.blue;
    const err = resolveActivatedAbility(ctx, 'c1');
    expect(err).toBeNull();
    expect(ctx.units['c1']).toBeUndefined();
    expect(ctx.board[2][2]).toBeNull();
    expect(ctx.loyalty.blue).toBe(before + 3);
    expect(ctx.log.some((l) => /sacrificed/i.test(l))).toBe(true);
  });

  it('sacrifice-hit requires an adjacent target and destroys self', () => {
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'pit',
        cardId: 'pit_mechanic',
        name: 'Pit Mechanic',
        side: 'blue',
        power: 2,
      }),
      2,
      2,
    );
    place(
      ctx,
      unit({
        uid: 'foe',
        cardId: 'lamp_bearer',
        name: 'Foe',
        side: 'red',
        power: 4,
      }),
      2,
      3,
    );
    expect(resolveActivatedAbility(ctx, 'pit')).toMatch(/Name a unit/);
    const err = resolveActivatedAbility(ctx, 'pit', 'foe');
    expect(err).toBeNull();
    expect(ctx.units['pit']).toBeUndefined();
    expect(ctx.units['foe']?.power).toBe(1); // 4 - 3
  });

  it('rejects non-adjacent jab / sacrifice-hit', () => {
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'pit',
        cardId: 'pit_mechanic',
        name: 'Pit Mechanic',
        side: 'blue',
        power: 2,
      }),
      0,
      0,
    );
    place(
      ctx,
      unit({
        uid: 'foe',
        cardId: 'x',
        name: 'Far',
        side: 'red',
        power: 3,
      }),
      4,
      4,
    );
    expect(resolveActivatedAbility(ctx, 'pit', 'foe')).toMatch(/adjacent/);
    expect(ctx.units['pit']).toBeDefined();
  });

  it('once-per-rite used blocks a second jab', () => {
    const ctx = baseCtx('blue');
    ctx.loyalty.blue = 4;
    place(
      ctx,
      unit({
        uid: 'hex',
        cardId: 'hex_banner',
        name: 'Hex Banner',
        side: 'blue',
        power: 2,
      }),
      2,
      2,
    );
    place(
      ctx,
      unit({
        uid: 'foe',
        cardId: 'x',
        name: 'Foe',
        side: 'red',
        power: 3,
      }),
      2,
      3,
    );
    expect(resolveActivatedAbility(ctx, 'hex', 'foe')).toBeNull();
    expect(ctx.units['hex']?.used).toBe(true);
    expect(ctx.loyalty.blue).toBe(3);
    expect(resolveActivatedAbility(ctx, 'hex', 'foe')).toMatch(/already/);
  });

  it('once-in-a-sitting sets once and blocks reuse', () => {
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'pol',
        cardId: 'pollen_orator',
        name: 'Pollen Orator',
        side: 'blue',
        power: 2,
      }),
      1,
      1,
    );
    place(
      ctx,
      unit({
        uid: 'ally',
        cardId: 'y',
        name: 'Ally',
        side: 'blue',
        power: 2,
      }),
      1,
      2,
    );
    expect(resolveActivatedAbility(ctx, 'pol', 'ally')).toBeNull();
    expect(ctx.units['ally']?.power).toBe(3);
    expect(ctx.units['pol']?.once).toBe(true);
    expect(resolveActivatedAbility(ctx, 'pol', 'ally')).toMatch(/already/);
  });

  it('tap-draw exhausts and draws; tap-crown scores domination', () => {
    const ctx = baseCtx('blue');
    ctx.deck.blue = [
      {
        id: 'd1',
        name: 'Drawn',
        faction: '',
        kind: 'unit',
        rarity: 'common',
        cost: 1,
        oath: 0,
        keywords: [],
        text: '',
      },
    ];
    place(
      ctx,
      unit({
        uid: 'adept',
        cardId: 'athanor_adept',
        name: 'Athanor Adept',
        side: 'blue',
        power: 3,
      }),
      0,
      0,
    );
    expect(resolveActivatedAbility(ctx, 'adept')).toBeNull();
    expect(ctx.hand.blue).toHaveLength(1);
    expect(ctx.units['adept']?.moved).toBe(true);
    expect(ctx.units['adept']?.attacked).toBe(true);

    const ctx2 = baseCtx('blue');
    place(
      ctx2,
      unit({
        uid: 'info',
        cardId: 'cellar_informant',
        name: 'Cellar Informant',
        side: 'blue',
        power: 2,
      }),
      3,
      3,
    );
    expect(resolveActivatedAbility(ctx2, 'info')).toBeNull();
    expect(ctx2.domination.blue).toBe(1);
    expect(ctx2.units['info']?.moved).toBe(true);
  });

  it('requires resources for paid acts', () => {
    const ctx = baseCtx('blue');
    ctx.loyalty.blue = 0;
    place(
      ctx,
      unit({
        uid: 'init',
        cardId: 'initiate_of_the_coil',
        name: 'Initiate of the Coil',
        side: 'blue',
        power: 3,
      }),
      2,
      2,
    );
    expect(resolveActivatedAbility(ctx, 'init')).toMatch(/resources/i);
  });

  it('self-power bumps dual Power; sick units cannot call', () => {
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'init',
        cardId: 'initiate_of_the_coil',
        name: 'Initiate of the Coil',
        side: 'blue',
        power: 3,
        sick: true,
      }),
      2,
      2,
    );
    expect(resolveActivatedAbility(ctx, 'init')).toMatch(/cannot call/);
    ctx.units['init'].sick = false;
    expect(resolveActivatedAbility(ctx, 'init')).toBeNull();
    expect(ctx.units['init'].power).toBe(4);
    expect(ctx.units['init'].maxPower).toBe(4);
    expect(ctx.loyalty.blue).toBe(4);
  });

  it('wail empties adjacent circles', () => {
    const ctx = baseCtx('blue');
    ctx.loyalty.blue = 4;
    place(
      ctx,
      unit({
        uid: 'wail',
        cardId: 'green_wail',
        name: 'Green Wail',
        side: 'blue',
        power: 2,
      }),
      2,
      2,
    );
    place(
      ctx,
      unit({
        uid: 'a',
        cardId: 'a',
        name: 'A',
        side: 'red',
        power: 5,
      }),
      2,
      3,
    );
    place(
      ctx,
      unit({
        uid: 'b',
        cardId: 'b',
        name: 'B',
        side: 'blue',
        power: 2,
      }),
      1,
      2,
    );
    expect(resolveActivatedAbility(ctx, 'wail')).toBeNull();
    expect(ctx.units['a']).toBeUndefined();
    expect(ctx.units['b']).toBeUndefined();
    expect(ctx.units['wail']).toBeDefined();
    expect(ctx.loyalty.blue).toBe(0);
  });
});


describe('Papa John powder synergy', () => {
  it('Goofer Dust deals 3 without Papa John and 5 with allied Papa John', () => {
    const dust = cardById('goofer_dust');
    expect(dust?.effect?.op).toBe('smite');
    expect(dust?.effect?.n).toBe(3);

    const alone = baseCtx('blue');
    place(
      alone,
      unit({
        uid: 'foe',
        cardId: 'fodder',
        name: 'Fodder',
        side: 'red',
        power: 10,
      }),
      2,
      2,
    );
    expect(
      resolveEffect(alone, dust!.effect!, { id: dust!.id, name: dust!.name }, 'foe'),
    ).toBeNull();
    expect(alone.units['foe'].power).toBe(7);

    const withJohn = baseCtx('blue');
    place(
      withJohn,
      unit({
        uid: 'john',
        cardId: 'high_john',
        name: 'Papa John',
        side: 'blue',
        power: 2,
      }),
      0,
      0,
    );
    place(
      withJohn,
      unit({
        uid: 'foe',
        cardId: 'fodder',
        name: 'Fodder',
        side: 'red',
        power: 10,
      }),
      2,
      2,
    );
    expect(
      resolveEffect(withJohn, dust!.effect!, { id: dust!.id, name: dust!.name }, 'foe'),
    ).toBeNull();
    expect(withJohn.units['foe'].power).toBe(5);
  });

  it('Hot-Foot Powder locks only without Papa John; with him also deals 2', () => {
    const powder = cardById('hot_foot_powder');
    expect(powder?.effect?.op).toBe('lock');

    const alone = baseCtx('blue');
    place(
      alone,
      unit({
        uid: 'foe',
        cardId: 'fodder',
        name: 'Fodder',
        side: 'red',
        power: 6,
      }),
      2,
      2,
    );
    expect(
      resolveEffect(alone, powder!.effect!, { id: powder!.id, name: powder!.name }, 'foe'),
    ).toBeNull();
    expect(alone.units['foe'].sick).toBe(true);
    expect(alone.units['foe'].powder).toBe(true);
    expect(alone.units['foe'].power).toBe(6);

    const withJohn = baseCtx('blue');
    place(
      withJohn,
      unit({
        uid: 'john',
        cardId: 'high_john',
        name: 'Papa John',
        side: 'blue',
        power: 2,
      }),
      0,
      0,
    );
    place(
      withJohn,
      unit({
        uid: 'foe',
        cardId: 'fodder',
        name: 'Fodder',
        side: 'red',
        power: 6,
      }),
      2,
      2,
    );
    expect(
      resolveEffect(withJohn, powder!.effect!, { id: powder!.id, name: powder!.name }, 'foe'),
    ).toBeNull();
    expect(withJohn.units['foe'].sick).toBe(true);
    expect(withJohn.units['foe'].power).toBe(4);
  });

  it('enemy Papa John does not buff your powders', () => {
    const dust = cardById('goofer_dust')!;
    const ctx = baseCtx('blue');
    place(
      ctx,
      unit({
        uid: 'john',
        cardId: 'high_john',
        name: 'Papa John',
        side: 'red',
        power: 2,
      }),
      0,
      0,
    );
    place(
      ctx,
      unit({
        uid: 'foe',
        cardId: 'fodder',
        name: 'Fodder',
        side: 'red',
        power: 10,
      }),
      2,
      2,
    );
    expect(resolveEffect(ctx, dust.effect!, { id: dust.id, name: dust.name }, 'foe')).toBeNull();
    expect(ctx.units['foe'].power).toBe(7);
  });
});
