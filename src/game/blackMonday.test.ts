import { describe, expect, it } from 'vitest';
import {
  BLACK_MONDAY_ID,
  CARDS,
  cardById,
  isExcludedPlateId,
  isLossInjectId,
} from '../data/catalog';
import { cardImageUrl } from './maps';
import {
  BLACK_MONDAY_CHANCE,
  applyBlackMondayLossInject,
  defaultProfile,
  isLegalDeck,
  packPool,
  swearAllegiance,
  type Profile,
} from './profile';
import {
  buildOrderAllyWorkingIds,
  buildWorkingIds,
  heroForFaction,
  validateDeck,
} from './deck';

describe('Black Monday card', () => {
  it('exists with cost 0, bank 2, Unaligned, image slug', () => {
    const card = cardById(BLACK_MONDAY_ID);
    expect(card).toBeTruthy();
    expect(card!.name).toBe('Black Monday');
    expect(card!.faction).toBe('Unaligned');
    expect(card!.kind).toBe('rite');
    expect(card!.rarity).toBe('uncommon');
    expect(card!.cost).toBe(0);
    expect(card!.oath).toBe(0);
    expect(card!.keywords).toEqual([]);
    expect(card!.effect).toEqual({ op: 'bank', n: 2 });
    expect(card!.alsoDraw).toBeUndefined();
    expect(card!.text.toLowerCase()).toMatch(/bank 2 resources/);
    expect(typeof card!.quote).toBe('string');
    expect(card!.quote!.trim().length).toBeGreaterThan(0);
    expect(card!.quoted).toMatch(/Galbraith/);
    expect(cardImageUrl(card!.name)).toBe('/assets/images/black_monday.jpg');
    expect(isLossInjectId(card!.id)).toBe(true);
    expect(isExcludedPlateId(card!.id)).toBe(false);
  });
});

describe('Black Monday pack / auto-working exclusion', () => {
  it('is not in packPool', () => {
    for (const bias of [true, false]) {
      const ids = packPool('The Vril Syndicate', bias).map((c) => c.id);
      expect(ids).not.toContain(BLACK_MONDAY_ID);
    }
    expect(packPool(null, false).map((c) => c.id)).not.toContain(
      BLACK_MONDAY_ID,
    );
  });

  it('is not in buildWorkingIds for a faction', () => {
    for (const faction of [
      'The Vril Syndicate',
      'The Columbia Lodge',
      'Unaligned',
    ]) {
      expect(buildWorkingIds(faction, 30)).not.toContain(BLACK_MONDAY_ID);
    }
    expect(buildOrderAllyWorkingIds('The Vril Syndicate', 30)).not.toContain(
      BLACK_MONDAY_ID,
    );
  });
});

describe('Black Monday validateDeck', () => {
  it('accepts black_monday in a legal working', () => {
    const hero = heroForFaction('The Vril Syndicate')!;
    const base = buildOrderAllyWorkingIds('The Vril Syndicate', 30);
    const withBm = [...base.slice(0, 29), BLACK_MONDAY_ID];
    const v = validateDeck(hero.id, withBm);
    expect(v).toEqual({ ok: true });
    expect(
      isLegalDeck({
        id: 't',
        name: 't',
        heroId: hero.id,
        cards: withBm,
      }),
    ).toBe(true);
  });
});

describe('applyBlackMondayLossInject', () => {
  function sworn(): Profile {
    return swearAllegiance(defaultProfile(), 'The Vril Syndicate');
  }

  it('adds to collection+deck with forced rand below chance', () => {
    const p = sworn();
    const deckId = p.customDecks[0]!.id;
    const beforeLen = p.customDecks[0]!.cards.length;
    const r = applyBlackMondayLossInject(p, {
      rand: () => 0, // always under BLACK_MONDAY_CHANCE
      deckId,
    });
    expect(r.injected).toBe(true);
    expect(r.profile.collection).toContain(BLACK_MONDAY_ID);
    expect(r.profile.customDecks[0]!.cards).toContain(BLACK_MONDAY_ID);
    expect(r.profile.customDecks[0]!.cards.length).toBe(beforeLen + 1);
  });

  it('chance gate: rand at/above threshold → no inject', () => {
    const p = sworn();
    const r = applyBlackMondayLossInject(p, {
      rand: () => BLACK_MONDAY_CHANCE,
    });
    expect(r.injected).toBe(false);
    expect(r.profile.collection).not.toContain(BLACK_MONDAY_ID);
    expect(r.profile).toBe(p);
  });

  it('still grants collection when all decks are full at 40', () => {
    let p = sworn();
    const filler = buildOrderAllyWorkingIds('The Vril Syndicate', 40);
    // pad to 40 without black_monday
    const cards = filler.filter((id) => id !== BLACK_MONDAY_ID).slice(0, 40);
    while (cards.length < 40) cards.push(cards[0]!);
    p = {
      ...p,
      customDecks: [{ ...p.customDecks[0]!, cards }],
    };
    const r = applyBlackMondayLossInject(p, { rand: () => 0 });
    expect(r.injected).toBe(true);
    expect(r.profile.collection).toContain(BLACK_MONDAY_ID);
    expect(r.profile.customDecks[0]!.cards).not.toContain(BLACK_MONDAY_ID);
    expect(r.profile.customDecks[0]!.cards.length).toBe(40);
  });

  it('skips when already owned and every deck is at 3 copies or full', () => {
    let p = sworn();
    const base = p.customDecks[0]!.cards.filter((id) => id !== BLACK_MONDAY_ID);
    const cards = [...base.slice(0, 37), BLACK_MONDAY_ID, BLACK_MONDAY_ID, BLACK_MONDAY_ID];
    p = {
      ...p,
      collection: [...p.collection, BLACK_MONDAY_ID],
      customDecks: [{ ...p.customDecks[0]!, cards }],
    };
    const r = applyBlackMondayLossInject(p, { rand: () => 0 });
    expect(r.injected).toBe(false);
  });
});

describe('catalog holds Black Monday once', () => {
  it('single plate in CARDS', () => {
    expect(CARDS.filter((c) => c.id === BLACK_MONDAY_ID)).toHaveLength(1);
  });
});
