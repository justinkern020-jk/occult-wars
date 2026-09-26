import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cardById, CARDS } from '../data/catalog';
import { cardImageUrl } from './maps';
import {
  applyRadiationPoisoningUnlock,
  defaultProfile,
} from './profile';
import {
  resolveEffect,
  type EffectCtx,
  type EffectUnit,
} from './effects';
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

describe('radiation_poisoning card', () => {
  it('exists in catalog with quote, Gas, and smite_all 2', () => {
    const card = cardById('radiation_poisoning');
    expect(card).toBeDefined();
    expect(card!.name).toBe('Radiation Poisoning');
    expect(card!.kind).toBe('rite');
    expect(card!.faction).toBe('Unaligned');
    expect(card!.rarity).toBe('rare');
    expect(card!.quote?.trim().length ?? 0).toBeGreaterThan(0);
    expect(card!.quoted?.trim().length ?? 0).toBeGreaterThan(0);
    expect(/\bloyalty\b/i.test(card!.text)).toBe(false);
    expect(card!.keywords).toContain('gas');
    expect(card!.effect).toEqual({ op: 'smite_all', n: 2 });
    expect(CARDS.some((c) => c.id === 'radiation_poisoning')).toBe(true);
  });

  it('resolves local art path and file exists on disk', () => {
    const card = cardById('radiation_poisoning')!;
    const url = cardImageUrl(card.name);
    expect(url).toBe('/assets/images/radiation_poisoning.jpg');
    const disk = resolve(
      process.cwd(),
      'public/assets/images/radiation_poisoning.jpg',
    );
    expect(existsSync(disk)).toBe(true);
  });

  it('unlock adds to collection once', () => {
    const base = defaultProfile();
    expect(base.collection.includes('radiation_poisoning')).toBe(false);
    const once = applyRadiationPoisoningUnlock(base);
    expect(once.collection.filter((id) => id === 'radiation_poisoning')).toEqual([
      'radiation_poisoning',
    ]);
    const twice = applyRadiationPoisoningUnlock(once);
    expect(
      twice.collection.filter((id) => id === 'radiation_poisoning'),
    ).toHaveLength(1);
  });

  it('rite smites every unit for 2', () => {
    const card = cardById('radiation_poisoning')!;
    expect(card.effect).toBeDefined();
    const ctx = baseCtx('blue');
    ctx.units.a = unit({
      uid: 'a',
      cardId: 'lamp_bearer',
      name: 'Ally',
      side: 'blue',
      power: 4,
    });
    ctx.units.b = unit({
      uid: 'b',
      cardId: 'lamp_bearer',
      name: 'Foe',
      side: 'red',
      power: 3,
    });
    ctx.board[1][1] = 'a';
    ctx.board[2][2] = 'b';
    const err = resolveEffect(ctx, card.effect!, card);
    expect(err).toBeNull();
    expect(ctx.units.a?.power).toBe(2);
    expect(ctx.units.b?.power).toBe(1);
  });
});
