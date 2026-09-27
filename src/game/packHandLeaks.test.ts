import { describe, expect, it } from 'vitest';
import {
  CARDS,
  isExcludedPlateId,
  isNukeAftermathId,
  isSecretHandDropId,
} from '../data/catalog';
import { isSecondHourSociety } from './orders';
import {
  breakSeal,
  defaultProfile,
  migrateProfile,
  packPool,
  swearAllegiance,
  applyNukeAftermathUnlocks,
  applySouthHavenDispatchUnlock,
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

  it('never includes radiation_poisoning, nuclear_winter, south_haven_dispatch, or black_monday', () => {
    for (const bias of [true, false]) {
      const pool = packPool('The Columbia Lodge', bias);
      const ids = pool.map((c) => c.id);
      expect(ids).not.toContain('radiation_poisoning');
      expect(ids).not.toContain('nuclear_winter');
      expect(ids).not.toContain('south_haven_dispatch');
      expect(ids).not.toContain('black_monday');
    }
    const open = packPool(null, false);
    expect(open.map((c) => c.id)).not.toContain('radiation_poisoning');
    expect(open.map((c) => c.id)).not.toContain('nuclear_winter');
    expect(open.map((c) => c.id)).not.toContain('south_haven_dispatch');
    expect(open.map((c) => c.id)).not.toContain('black_monday');
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
        expect(isExcludedPlateId(card.id)).toBe(false);
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


describe('South Haven Dispatch is secret hand-drop only', () => {
  const SHD = 'south_haven_dispatch';

  it('is flagged as secret / excluded plate', () => {
    expect(isSecretHandDropId(SHD)).toBe(true);
    expect(isExcludedPlateId(SHD)).toBe(true);
    expect(isNukeAftermathId(SHD)).toBe(false);
  });

  it('never appears in packPool', () => {
    for (const bias of [true, false]) {
      const ids = packPool('The Columbia Lodge', bias).map((c) => c.id);
      expect(ids).not.toContain(SHD);
    }
    expect(packPool(null, false).map((c) => c.id)).not.toContain(SHD);
  });

  it('breakSeal pulls never include south_haven_dispatch', () => {
    let p = swearAllegiance(defaultProfile(), 'Sons of the Green Lion');
    p = { ...p, alchemicalShards: 10_000 };
    for (let i = 0; i < 40; i++) {
      const r = i / 40;
      const result = breakSeal(p, () => r);
      expect('pulls' in result).toBe(true);
      if (!('pulls' in result)) continue;
      for (const card of result.pulls) {
        expect(card.id).not.toBe(SHD);
        expect(isExcludedPlateId(card.id)).toBe(false);
      }
      p = { ...result.profile, alchemicalShards: 10_000 };
    }
  });

  it('buildWorkingIds / order+ally never emit south_haven_dispatch', () => {
    for (const faction of [
      'The Vril Syndicate',
      'Unaligned',
      'The Blackout Wardens',
    ]) {
      expect(buildWorkingIds(faction, 30)).not.toContain(SHD);
    }
    expect(buildOrderAllyWorkingIds('The Vril Syndicate', 30)).not.toContain(SHD);
  });

  it('validateDeck / isLegalDeck reject south_haven_dispatch', () => {
    const hero = heroForFaction('The Vril Syndicate')!;
    const base = buildOrderAllyWorkingIds('The Vril Syndicate', 30);
    const withShd = [...base.slice(0, 29), SHD];
    const v = validateDeck(hero.id, withShd);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.toLowerCase()).toMatch(/secret/);

    const cards = buildOrderAllyWorkingIds('The Columbia Lodge', 30);
    cards[0] = SHD;
    expect(
      isLegalDeck({
        id: 'x',
        name: 'x',
        heroId: heroForFaction('The Columbia Lodge')!.id,
        cards,
      }),
    ).toBe(false);
  });

  it('applySouthHavenDispatchUnlock strips collection / decks (no grant)', () => {
    const base = {
      ...defaultProfile(),
      collection: [SHD, 'justin_kern'],
      customDecks: [
        {
          id: 'first-working',
          name: 'Leak',
          heroId: 'the_rune_colonel',
          cards: [SHD, 'lamp_bearer'],
        },
      ],
    };
    const next = applySouthHavenDispatchUnlock(base);
    expect(next.collection).toEqual(['justin_kern']);
    expect(next.customDecks[0]?.cards).toEqual(['lamp_bearer']);
    // Idempotent — never grants
    const again = applySouthHavenDispatchUnlock(defaultProfile());
    expect(again.collection).not.toContain(SHD);
  });

  it('migrateProfile strips leaked south_haven_dispatch', () => {
    const next = migrateProfile({
      collection: [SHD, 'justin_kern'],
      customDecks: [
        {
          id: 'first-working',
          name: 'Leak',
          heroId: 'the_rune_colonel',
          cards: [SHD, 'lamp_bearer'],
        },
      ],
      secondCards: [SHD, 'lamp_bearer'],
    });
    expect(next.collection).toEqual(['justin_kern']);
    expect(next.customDecks[0]?.cards).toEqual(['lamp_bearer']);
    expect(next.secondCards).toEqual(['lamp_bearer']);
  });

  it('catalog still holds the card for code-unlock reveal art', () => {
    expect(CARDS.some((c) => c.id === SHD)).toBe(true);
  });
});
