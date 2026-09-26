import { describe, expect, it } from 'vitest';
import {
  FIRST_HOUR_ALLIES,
  allyOf,
  isLegalForOrder,
  isFirstHourOrder,
} from './orders';
import { validateDeck, buildOrderAllyWorkingIds } from './deck';
import { heroForFaction } from './deck';
import { breakSeal, defaultProfile, swearAllegiance, isLegalDeck } from './profile';
import { pickEnding } from './campaign';
import { canBeStruck, manhattan, rangedReach } from './keywords';
import { resolveEffect, type EffectCtx } from './effects';

describe('orders & allies', () => {
  it('pairs the six first-hour jewels', () => {
    expect(allyOf('The Vril Syndicate')).toBe('The Hermetic Circle');
    expect(allyOf('The Hermetic Circle')).toBe('The Vril Syndicate');
    expect(allyOf('Order of the Lead Dawn')).toBe('The Midnight Assembly');
    expect(Object.keys(FIRST_HOUR_ALLIES)).toHaveLength(6);
  });

  it('legal cards are order or ally only', () => {
    expect(isLegalForOrder('The Vril Syndicate', 'The Hermetic Circle')).toBe(
      true,
    );
    expect(isLegalForOrder('The Vril Syndicate', 'The Columbia Lodge')).toBe(
      false,
    );
    expect(isFirstHourOrder('The Vril Syndicate')).toBe(true);
  });
});

describe('deck legality', () => {
  it('builds 30 and validates order+ally working', () => {
    const ids = buildOrderAllyWorkingIds('The Vril Syndicate', 30);
    expect(ids.length).toBe(30);
    const hero = heroForFaction('The Vril Syndicate');
    expect(hero).toBeTruthy();
    const v = validateDeck(hero!.id, ids);
    expect(v.ok).toBe(true);
  });
});

describe('profile pack', () => {
  it('swears and breaks a seal', () => {
    let p = defaultProfile();
    p = swearAllegiance(p, 'The Columbia Lodge');
    expect(p.allegiance).toBe('The Columbia Lodge');
    expect(p.customDecks[0]?.cards.length).toBeGreaterThanOrEqual(30);
    expect(isLegalDeck(p.customDecks[0])).toBe(true);
    p = { ...p, alchemicalShards: 500 };
    const result = breakSeal(p, () => 0.1);
    expect('pulls' in result).toBe(true);
    if ('pulls' in result) {
      expect(result.pulls).toHaveLength(5);
      expect(result.profile.alchemicalShards).toBe(350);
    }
  });
});

describe('campaign endings', () => {
  it('picks leaden crown on all storms', () => {
    expect(pickEnding(['storm', 'storm', 'storm', 'storm', 'storm', 'storm'])).toBe(
      'leaden-crown',
    );
    expect(pickEnding(['lost', 'lost', 'lost', 'hold', 'hold', 'hold'])).toBe(
      'broken-circle',
    );
  });
});

describe('keywords ranged', () => {
  it('manhattan 2 for ranged', () => {
    expect(manhattan(0, 0, 2, 0)).toBe(2);
    expect(rangedReach({ keywords: ['ranged'] })).toBe(2);
    expect(rangedReach({ keywords: [] })).toBe(1);
  });
});

describe('effects', () => {
  function emptyCtx(side: 'blue' | 'red' = 'blue'): EffectCtx {
    return {
      side,
      loyalty: { blue: 5, red: 5 },
      domination: { blue: 0, red: 0 },
      hand: { blue: [], red: [] },
      deck: {
        blue: [
          {
            id: 'a',
            name: 'A',
            faction: 'x',
            kind: 'unit',
            rarity: 'common',
            cost: 1,
            oath: 0,
            keywords: [],
            text: '',
          },
        ],
        red: [],
      },
      discard: { blue: [], red: [] },
      units: {
        u1: {
          uid: 'u1',
          cardId: 'foe',
          name: 'Foe',
          side: 'red',
          power: 3,
          maxPower: 3,
          loyalty: 2,
          keywords: [],
        },
      },
      board: [
        [null, null, null, null, null],
        [null, 'u1', null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
      ],
      control: Array.from({ length: 5 }, () => Array(5).fill(null)),
      log: [],
    };
  }

  it('smite reduces dual Power', () => {
    const ctx = emptyCtx();
    const err = resolveEffect(
      ctx,
      { op: 'smite', n: 2 },
      { name: 'Bolt' },
      'u1',
    );
    expect(err).toBeNull();
    expect(ctx.units.u1.power).toBe(1);
  });

  it('draw pulls from deck', () => {
    const ctx = emptyCtx();
    resolveEffect(ctx, { op: 'draw', n: 1 }, { name: 'Vision' });
    expect(ctx.hand.blue).toHaveLength(1);
  });
});

describe('veiled and shutter strike rules', () => {
  it('veiled cannot be struck at any range', () => {
    const atk = { keywords: ['ranged'] };
    const def = { keywords: ['veiled'] };
    expect(canBeStruck(atk, def, 1)).toBe(false);
    expect(canBeStruck(atk, def, 2)).toBe(false);
  });
  it('shutter blocks ranged but not adjacent melee', () => {
    const atk = { keywords: ['ranged'] };
    const def = { keywords: ['shutter'] };
    expect(canBeStruck(atk, def, 1)).toBe(true);
    expect(canBeStruck(atk, def, 2)).toBe(false);
  });
});
