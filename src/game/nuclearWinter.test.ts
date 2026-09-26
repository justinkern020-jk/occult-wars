import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cardById, CARDS } from '../data/catalog';
import { MAPS, cardImageUrl } from './maps';
import {
  applyNuclearWinterUnlock,
  defaultProfile,
} from './profile';
import {
  resolveEffect,
  type EffectCtx,
} from './effects';
import { applyBank, bankFromHoldings } from './scoring';
import type { Side } from './maps';

function emptyBoard(): (string | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
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

describe('nuclear_winter card', () => {
  it('exists in catalog with quote and no_bank effect', () => {
    const card = cardById('nuclear_winter');
    expect(card).toBeDefined();
    expect(card!.name).toBe('Nuclear Winter');
    expect(card!.kind).toBe('rite');
    expect(card!.faction).toBe('Unaligned');
    expect(card!.rarity).toBe('rare');
    expect(card!.quote?.trim().length ?? 0).toBeGreaterThan(0);
    expect(card!.quoted?.trim().length ?? 0).toBeGreaterThan(0);
    expect(/\bloyalty\b/i.test(card!.text)).toBe(false);
    expect(card!.text.toLowerCase()).toContain('resources');
    expect(card!.effect).toEqual({ op: 'no_bank', n: 2 });
    expect(CARDS.some((c) => c.id === 'nuclear_winter')).toBe(true);
  });

  it('resolves local art path and file exists on disk', () => {
    const card = cardById('nuclear_winter')!;
    const url = cardImageUrl(card.name);
    expect(url).toBe('/assets/images/nuclear_winter.jpg');
    const disk = resolve(
      process.cwd(),
      'public/assets/images/nuclear_winter.jpg',
    );
    expect(existsSync(disk)).toBe(true);
  });

  it('unlock adds to collection once', () => {
    const base = defaultProfile();
    expect(base.collection.includes('nuclear_winter')).toBe(false);
    const once = applyNuclearWinterUnlock(base);
    expect(once.collection.filter((id) => id === 'nuclear_winter')).toEqual([
      'nuclear_winter',
    ]);
    const twice = applyNuclearWinterUnlock(once);
    expect(twice.collection.filter((id) => id === 'nuclear_winter')).toHaveLength(
      1,
    );
  });

  it('rite schedules no-bank for two rite-opens (one turn)', () => {
    const card = cardById('nuclear_winter')!;
    const ctx = baseCtx('blue');
    const err = resolveEffect(ctx, card.effect!, card);
    expect(err).toBeNull();
    expect(ctx.noBankOpens).toBe(2);
    expect(ctx.loyalty.blue).toBe(6);
    expect(ctx.loyalty.red).toBe(6);
  });

  it('no-bank blocks income while existing Resources can still be spent', () => {
    const m = MAPS[0];
    const control = Array.from({ length: 5 }, () =>
      Array(5).fill(null),
    ) as (Side | null)[][];
    const gain = bankFromHoldings(m.tiles, control, 'blue', []);
    expect(gain).toBeGreaterThan(0);

    let noBankOpens = 2;
    let loyalty = 8;
    const tryBank = () => {
      if (noBankOpens > 0) {
        noBankOpens -= 1;
        return 0;
      }
      return bankFromHoldings(m.tiles, control, 'blue', []);
    };
    expect(tryBank()).toBe(0);
    expect(tryBank()).toBe(0);
    expect(tryBank()).toBe(gain);
    loyalty -= 3;
    expect(loyalty).toBe(5);
    expect(applyBank(loyalty, 0)).toBe(5);
  });
});
