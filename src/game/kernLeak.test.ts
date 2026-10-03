/** Justin / Seth Kern are code-only hand drops — never collection or working plates. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS, FACTIONS, cardById, isExcludedPlateId, isSecretHandDropId } from '../data/catalog';
import { buildOrderAllyWorkingIds, buildWorkingIds, validateDeck, withSecretHandDrop } from './deck';
import { secretDropCardId } from './hourUnlock';
import {
  applyJustinKernUnlock,
  applySethKernUnlock,
  defaultProfile,
  loadProfile,
  migrateProfile,
  PROFILE_KEY,
} from './profile';

const KERNS = ['justin_kern', 'seth_kern'];

function leaky() {
  return {
    ...defaultProfile(),
    username: 'seth kern',
    collection: ['justin_kern', 'seth_kern', 'lamp_bearer'],
    customDecks: [
      { id: 'w', name: 'Leak', heroId: 'the_rune_colonel', cards: ['justin_kern', 'lamp_bearer', 'seth_kern'] },
    ],
    secondCards: ['seth_kern', 'lamp_bearer'],
  };
}

describe('Kern secret hand drops', () => {
  it('are secret hand-drop ids (excluded from packs / workings / editor)', () => {
    for (const id of KERNS) {
      expect(isSecretHandDropId(id)).toBe(true);
      expect(isExcludedPlateId(id)).toBe(true);
    }
  });

  it('unlock functions never grant — they only strip leaked copies', () => {
    for (const fn of [applyJustinKernUnlock, applySethKernUnlock]) {
      const fresh = fn({ ...defaultProfile(), username: 'seth kern' });
      expect(fresh.collection.some((id) => KERNS.includes(id))).toBe(false);
      expect(fresh.customDecks.flatMap((d) => d.cards).some((id) => KERNS.includes(id))).toBe(false);
    }
    const j = applyJustinKernUnlock(leaky());
    expect(j.collection).not.toContain('justin_kern');
    expect(j.customDecks[0].cards).not.toContain('justin_kern');
    const s = applySethKernUnlock(leaky());
    expect(s.collection).not.toContain('seth_kern');
    expect(s.customDecks[0].cards).not.toContain('seth_kern');
    expect(s.secondCards ?? []).not.toContain('seth_kern');
  });

  it('migrateProfile sanitizes an old saved profile', () => {
    const p = migrateProfile(leaky() as never);
    expect(p.collection).toEqual(['lamp_bearer']);
    expect(p.customDecks[0].cards).toEqual(['lamp_bearer']);
    expect(p.secondCards).toEqual(['lamp_bearer']);
  });

  describe('loadProfile from storage', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('strips Kerns from a leaked saved ledger on load', () => {
      const store = new Map<string, string>([[PROFILE_KEY, JSON.stringify(leaky())]]);
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      });
      const p = loadProfile();
      expect(p.collection.some((id) => KERNS.includes(id))).toBe(false);
      expect(p.customDecks.flatMap((d) => d.cards).some((id) => KERNS.includes(id))).toBe(false);
    });
  });

  it('auto-built workings never include a Kern', () => {
    for (const f of FACTIONS) {
      try {
        expect(buildWorkingIds(f, 30).some((id) => KERNS.includes(id))).toBe(false);
      } catch {
        /* faction without a full pool */
      }
      try {
        expect(buildOrderAllyWorkingIds(f, 30).some((id) => KERNS.includes(id))).toBe(false);
      } catch {
        /* not an order */
      }
    }
  });

  it('validateDeck refuses a Kern in a working', () => {
    const base = buildOrderAllyWorkingIds('Order of the Lead Dawn', 30);
    const hero = CARDS.find((c) => c.kind === 'hero' && c.id === 'the_rune_colonel')!;
    for (const id of KERNS) {
      const cards = [...base.slice(0, 29), id];
      const v = validateDeck(hero.id, cards);
      expect(v.ok).toBe(false);
    }
  });

  it('codes map to their plate (menu next-match and mid-match)', () => {
    expect(secretDropCardId('Oppenheimer')).toBe('justin_kern');
    expect(secretDropCardId('911911')).toBe('justin_kern'); // Hidden Adept
    expect(secretDropCardId('Seth Kern')).toBe('seth_kern');
    expect(secretDropCardId('South Haven Police Department')).toBe('south_haven_dispatch');
    expect(secretDropCardId('Justin')).toBeNull();
  });

  it('a code drops the card into hand every time it is entered (until the hand is sealed)', () => {
    const jk = cardById('justin_kern')!;
    let hand = [cardById('lamp_bearer')!];
    for (let i = 0; i < 3; i++) {
      const d = withSecretHandDrop(hand, jk);
      expect(d.dropped).toBe(true);
      hand = d.hand;
    }
    expect(hand.filter((c) => c.id === 'justin_kern')).toHaveLength(3);
    const full = Array(7).fill(cardById('lamp_bearer')!);
    expect(withSecretHandDrop(full, jk).dropped).toBe(false);
  });
});
