import { describe, expect, it } from 'vitest';
import { CARD_BACKS, COIN_SKINS, cleanCoinSkin, isUnlocked, migrateWardrobe, wornBack, wornCoin } from './wardrobe';
import { defaultProfile, type Profile } from './profile';
import { sanitizeWho } from '../net/friendLoadout';

const withAch = (stats: Record<string, number>, sets: Record<string, string[]> = {}, got: Record<string, number> = {}): Profile => ({
  ...defaultProfile(),
  ach: { stats, sets, got },
});

describe('wardrobe', () => {
  it('six card backs and four coin skins; only the defaults start open', () => {
    expect(CARD_BACKS).toHaveLength(6);
    expect(COIN_SKINS).toHaveLength(4);
    const p = defaultProfile();
    expect(CARD_BACKS.filter((b) => isUnlocked(p, b)).map((b) => b.id)).toEqual(['lodge']);
    expect(COIN_SKINS.filter((c) => isUnlocked(p, c)).map((c) => c.id)).toEqual(['brass']);
  });
  it('unlocks from honours and stats already kept', () => {
    const p = withAch({ wins: 12, sealedWins: 5, stormWins: 1, slain: 100 }, { cryptids: ['a', 'b', 'c'] }, Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`h${i}`, 1])));
    expect(CARD_BACKS.filter((b) => isUnlocked(p, b)).map((b) => b.id)).toEqual(['lodge', 'wax', 'brass', 'laurel', 'cryptid']);
    expect(COIN_SKINS.every((c) => isUnlocked(p, c))).toBe(true);
    expect(isUnlocked(withAch({ sealedWins: 4 }), CARD_BACKS.find((b) => b.id === 'brass')!)).toBe(false);
  });
  it('patron back needs a redeemed code; locked choices fall back to the default', () => {
    const p = { ...defaultProfile(), wardrobe: { back: 'patron', coin: 'bone' } };
    expect(wornBack(p)).toBe('lodge');
    expect(wornCoin(p)).toBe('brass');
    const patron = { ...p, wardrobe: { ...p.wardrobe, patron: 'PATRON-ABCDEF-GHJKLMNP' } };
    expect(wornBack(patron)).toBe('patron');
  });
  it('migrates only known ids and the code shape', () => {
    expect(migrateWardrobe({ back: 'wax', coin: 'nope', patron: 'free gold' })).toEqual({ back: 'wax' });
    expect(migrateWardrobe('x')).toBeUndefined();
    expect(migrateWardrobe({})).toBeUndefined();
  });
  it('the other chair only sees a known coin skin', () => {
    expect(cleanCoinSkin('obsidian')).toBe('obsidian');
    expect(cleanCoinSkin('<script>')).toBeUndefined();
    expect(sanitizeWho({ name: 'Ada', coin: 'bone' })?.coin).toBe('bone');
    expect(sanitizeWho({ name: 'Ada', coin: 'url(evil)' })?.coin).toBeUndefined();
  });
});
