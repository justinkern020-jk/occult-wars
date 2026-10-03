import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/catalog';
import { strongestDeck, plateScore } from './autoDeck';
import { validateDeck, buildOrderAllyWorkingIds, heroForFaction } from './deck';
import { countOwned } from './profile';

const factions = [...new Set(CARDS.filter((c) => c.kind === 'hero').map((c) => c.faction))];
const everything: Record<string, number> = Object.fromEntries(CARDS.map((c) => [c.id, 3]));

describe('strongest deck', () => {
  it('is always a legal working, for every order of every hour', () => {
    for (const f of factions) {
      const { cards, short } = strongestDeck(f, everything);
      expect(short).toBe(0);
      expect(cards.length).toBe(30);
      const v = validateDeck(heroForFaction(f)!.id, cards);
      expect(v, f).toEqual({ ok: true });
      for (const id of cards) {
        const c = CARDS.find((x) => x.id === id)!;
        expect(c.keywords.includes('cryptid')).toBe(false);
      }
    }
  });

  it('never seats more copies than owned', () => {
    const f = factions[0]!;
    const owned = countOwned(buildOrderAllyWorkingIds(f, 30));
    owned[Object.keys(owned)[0]!] = 1;
    const { cards, short } = strongestDeck(f, owned);
    const used = countOwned(cards);
    for (const [id, n] of Object.entries(used)) expect(n).toBeLessThanOrEqual(owned[id] ?? 0);
    expect(short).toBe(30 - cards.length);
  });

  it('scores plates per Resource (a cheap strong unit beats a dear weak one)', () => {
    const cheap = { ...CARDS.find((c) => c.kind === 'unit')!, cost: 1, power: 3, keywords: [] };
    const dear = { ...cheap, cost: 5, power: 2 };
    expect(plateScore(cheap)).toBeGreaterThan(plateScore(dear));
  });
});
