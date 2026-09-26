import { describe, expect, it } from 'vitest';
import { CARDS, isNukeAftermathId } from '../data/catalog';
import { isSecondHourSociety } from './orders';
import {
  breakSeal,
  defaultProfile,
  migrateProfile,
  packPool,
  swearAllegiance,
  applyNukeAftermathUnlocks,
  isLegalDeck,
} from './profile';
import {
  buildOrderAllyWorkingIds,
  buildWorkingIds,
  validateDeck,
  heroForFaction,
} from './deck';

const NUKE_IDS = ['radiation_poisoning', 'nuclear_winter'] as const;

describe('First Hour pack pool', () => {
  it('never includes Second Hour society cards', () => {
    for (const bias of [true, false]) {
      const pool = packPool('The Vril Syndicate', bias);
      for (const c of pool) {
        expect(isSecondHourSociety(c.faction)).toBe(false);
      }
    }
  });

  it('never includes radiation_poisoning or nuclear_winter', () => {
    for (const bias of [true, false]) {
      const pool = packPool('The Columbia Lodge', bias);
      const ids = pool.map((c) => c.id);
      expect(ids).not.toContain('radiation_poisoning');
      expect(ids).not.toContain('nuclear_winter');
    }
    const open = packPool(null, false);
    expect(open.map((c) => c.id)).not.toContain('radiation_poisoning');
    expect(open.map((c) => c.id)).not.toContain('nuclear_winter');
  });

  it('breakSeal pulls never include Second Hour or nuke aftermath', () => {
    let p = swearAllegiance(defaultProfile(), 'Sons of the Green Lion');
    p = { ...p, alchemicalShards: 10_000 };
    // Deterministic sweep across the unit interval
    for (let i = 0; i < 40; i++) {
      const r = i / 40;
      const result = breakSeal(p, () => r);
      expect('pulls' in result).toBe(true);
      if (!('pulls' in result)) continue;
      for (const card of result.pulls) {
        expect(isSecondHourSociety(card.faction)).toBe(false);
        expect(isNukeAftermathId(card.id)).toBe(false);
      }
      p = { ...result.profile, alchemicalShards: 10_000 };
    }
  });
});

describe('nuke aftermath never enter workings / hands', () => {
  it('buildWorkingIds never emits nuke aftermath ids', () => {
    for (const faction of [
      'The Vril Syndicate',
      'Unaligned',
      'The Blackout Wardens',
    ]) {
      const ids = buildWorkingIds(faction, 30);
      for (const id of NUKE_IDS) expect(ids).not.toContain(id);
    }
  });

  it('order+ally workings never include nuke aftermath', () => {
    const ids = buildOrderAllyWorkingIds('The Vril Syndicate', 30);
    for (const id of NUKE_IDS) expect(ids).not.toContain(id);
  });

  it('validateDeck rejects nuke aftermath plates', () => {
    const hero = heroForFaction('The Vril Syndicate')!;
    const base = buildOrderAllyWorkingIds('The Vril Syndicate', 30);
    const withRad = [...base.slice(0, 29), 'radiation_poisoning'];
    const v = validateDeck(hero.id, withRad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.toLowerCase()).toMatch(/aftermath|nuke/);
  });

  it('isLegalDeck rejects nuke aftermath plates', () => {
    const hero = heroForFaction('The Columbia Lodge')!;
    const cards = buildOrderAllyWorkingIds('The Columbia Lodge', 30);
    cards[0] = 'nuclear_winter';
    expect(
      isLegalDeck({
        id: 'x',
        name: 'x',
        heroId: hero.id,
        cards,
      }),
    ).toBe(false);
  });

  it('migrateProfile strips leaked nuke aftermath from collection and decks', () => {
    const next = migrateProfile({
      collection: ['radiation_poisoning', 'nuclear_winter', 'justin_kern'],
      customDecks: [
        {
          id: 'first-working',
          name: 'Leak',
          heroId: 'the_rune_colonel',
          cards: ['radiation_poisoning', 'nuclear_winter', 'lamp_bearer'],
        },
      ],
      secondCards: ['nuclear_winter', 'lamp_bearer'],
    });
    expect(next.collection).toEqual(['justin_kern']);
    expect(next.customDecks[0]?.cards).toEqual(['lamp_bearer']);
    expect(next.secondCards).toEqual(['lamp_bearer']);
  });

  it('applyNukeAftermathUnlocks does not grant collectibles', () => {
    const next = applyNukeAftermathUnlocks(defaultProfile());
    expect(next.collection).not.toContain('radiation_poisoning');
    expect(next.collection).not.toContain('nuclear_winter');
  });
});

describe('catalog still holds nuke cards for TarotPop', () => {
  it('cards exist for reveal art', () => {
    expect(CARDS.some((c) => c.id === 'radiation_poisoning')).toBe(true);
    expect(CARDS.some((c) => c.id === 'nuclear_winter')).toBe(true);
  });
});
