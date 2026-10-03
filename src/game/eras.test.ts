import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/catalog';
import { MAPS, cardImageUrl, mapsForEra } from './maps';
import {
  RETIRED_SECOND_HOUR_SOCIETIES,
  SEALED_CENTURY_ORDERS,
  SEALED_CENTURY_RIVALS,
  SECOND_HOUR_RIVALS,
  SECOND_HOUR_SOCIETIES,
  allyOf,
  isLegalForOrder,
} from './orders';
import { buildOrderAllyWorkingIds, validateDeck } from './deck';
import {
  breakSeal,
  buyPlate,
  defaultProfile,
  heroesForOrder,
  isShopPlate,
  shopStock,
  type Profile,
} from './profile';

describe('Second Hour and Sealed Century orders (grok.me import)', () => {
  it('ships 17 plates per new order and none from the retired societies', () => {
    for (const f of [...SECOND_HOUR_SOCIETIES, ...SEALED_CENTURY_ORDERS]) {
      expect(CARDS.filter((c) => c.faction === f), f).toHaveLength(17);
      expect(heroesForOrder(f).length, f).toBeGreaterThan(0);
    }
    for (const f of RETIRED_SECOND_HOUR_SOCIETIES) {
      expect(CARDS.some((c) => c.faction === f)).toBe(false);
    }
  });

  it('ally jewels pair inside each era and rivals are never the ally', () => {
    for (const f of SECOND_HOUR_SOCIETIES) {
      expect(SECOND_HOUR_SOCIETIES as readonly string[]).toContain(allyOf(f));
      expect(SECOND_HOUR_RIVALS[f]).not.toBe(allyOf(f));
      expect(SECOND_HOUR_RIVALS[f]).not.toBe(f);
    }
    for (const f of SEALED_CENTURY_ORDERS) {
      expect(SEALED_CENTURY_ORDERS as readonly string[]).toContain(allyOf(f));
      expect(SEALED_CENTURY_RIVALS[f]).not.toBe(allyOf(f));
      expect(SEALED_CENTURY_RIVALS[f]).not.toBe(f);
    }
  });

  it('auto workings are legal 30-plate decks for every new order', () => {
    for (const f of [...SECOND_HOUR_SOCIETIES, ...SEALED_CENTURY_ORDERS]) {
      const hero = heroesForOrder(f)[0]!;
      const ids = buildOrderAllyWorkingIds(f, 30);
      expect(ids).toHaveLength(30);
      expect(validateDeck(hero.id, ids)).toEqual({ ok: true });
    }
  });

  it('First Hour leaders cannot seat new-era plates (Vercel deck rules)', () => {
    const coven = CARDS.find((c) => c.faction === 'The Whitethorn Coven' && c.kind === 'unit')!;
    expect(isLegalForOrder('The Vril Syndicate', coven.faction)).toBe(false);
  });

  it('every new plate carries a flavour quote and attribution', () => {
    for (const c of CARDS.filter(
      (x) =>
        (SECOND_HOUR_SOCIETIES as readonly string[]).includes(x.faction) ||
        (SEALED_CENTURY_ORDERS as readonly string[]).includes(x.faction),
    )) {
      expect(c.quote?.trim(), c.id).toBeTruthy();
      expect(c.quoted?.trim(), c.id).toBeTruthy();
    }
  });

  it('every new plate and every field has local art', () => {
    for (const c of CARDS.filter(
      (x) =>
        (SECOND_HOUR_SOCIETIES as readonly string[]).includes(x.faction) ||
        (SEALED_CENTURY_ORDERS as readonly string[]).includes(x.faction),
    )) {
      expect(existsSync(resolve(process.cwd(), 'public' + cardImageUrl(c.name))), c.id).toBe(true);
    }
    for (const m of MAPS) {
      expect(existsSync(resolve(process.cwd(), `public/assets/maps/${m.id}.jpg`)), m.id).toBe(true);
    }
  });

  it('Sealed Century has seven grounds; Second Hour keeps its two yards', () => {
    expect(mapsForEra('old')).toHaveLength(7);
    expect(mapsForEra('second').map((m) => m.id)).toEqual(['blackout-yard', 'culvert-court']);
    expect(mapsForEra('old').filter((m) => m.mood === 'bright')).toHaveLength(3);
  });
});

describe('the night counter', () => {
  it('stocks only Second Hour plates (no cryptids)', () => {
    const stock = shopStock();
    expect(stock.length).toBeGreaterThan(40);
    for (const c of stock) {
      expect(SECOND_HOUR_SOCIETIES as readonly string[]).toContain(c.faction);
      expect(c.keywords).not.toContain('cryptid');
    }
    const briar = CARDS.find((c) => c.faction === 'The Briar Sidhe')!;
    expect(isShopPlate(briar)).toBe(false);
  });

  it('charges by rarity, caps copies, and refuses when poor', () => {
    const unit = shopStock().find((c) => c.kind === 'unit' && c.rarity === 'common')!;
    let p = { ...defaultProfile(), alchemicalShards: 1000 };
    for (let i = 0; i < 3; i++) {
      const r = buyPlate(p, unit.id);
      expect('profile' in r).toBe(true);
      if ('profile' in r) p = r.profile;
    }
    expect(p.alchemicalShards).toBe(1000 - 3 * 40);
    expect(buyPlate(p, unit.id)).toEqual({ error: 'Three copies is the shelf.' });
    const leader = shopStock().find((c) => c.kind === 'hero')!;
    const r = buyPlate(p, leader.id);
    expect('profile' in r).toBe(true);
    if ('profile' in r) {
      expect(buyPlate(r.profile, leader.id)).toEqual({ error: 'You already keep that leader.' });
    }
    expect('error' in buyPlate({ ...p, alchemicalShards: 0 }, unit.id)).toBe(true);
    expect(buyPlate(p, 'coil_novice')).toEqual({
      error: 'The night counter does not stock that plate.',
    });
  });

  it('First Hour seals never carry Second Hour or Sealed Century plates', () => {
    let p: Profile = { ...defaultProfile(), alchemicalShards: 100_000, allegiance: 'The Vril Syndicate' };
    for (let i = 0; i < 40; i++) {
      const r = breakSeal(p, () => (i * 0.137) % 1);
      if (!('pulls' in r)) break;
      for (const c of r.pulls) {
        expect(SECOND_HOUR_SOCIETIES as readonly string[]).not.toContain(c.faction);
        expect(SEALED_CENTURY_ORDERS as readonly string[]).not.toContain(c.faction);
      }
      p = r.profile;
    }
  });
});
