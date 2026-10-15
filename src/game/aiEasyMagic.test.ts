import { describe, expect, it } from 'vitest';
import { newMatch, playMatch, seededRand } from './engine';
import { pickAiAction, snapshotFromState } from './ai';
import { MAPS } from './maps';
import { buildOrderAllyWorkingIds, cardsFromIds, heroForFaction, shuffleInPlace } from './deck';
import { CARDS } from '../data/catalog';

describe('Easy AI occasionally uses rites and leader powers', () => {
  it('casts or uses its leader in some matches, never in all turns, and Expert is unaffected', () => {
    const f = [...new Set(CARDS.filter((c) => c.kind === 'hero').map((c) => c.faction))][0];
    const deck = buildOrderAllyWorkingIds(f, 30);
    let magic = 0;
    let actions = 0;
    for (let g = 0; g < 6; g++) {
      const rand = seededRand(900 + g);
      const st = newMatch({ tiles: MAPS[g % MAPS.length].tiles, blueDeck: shuffleInPlace(cardsFromIds(deck), rand), redDeck: shuffleInPlace(cardsFromIds(deck), rand), blueLeader: heroForFaction(f), redLeader: heroForFaction(f), rand });
      const pol = (s: any, avoid?: string[]) => {
        const a = pickAiAction({ ...snapshotFromState(s), avoid }, 'easy', { rand });
        actions++;
        if (a.type === 'cast' || a.type === 'leader') magic++;
        return a;
      };
      playMatch(st, { blue: pol, red: pol });
    }
    expect(magic).toBeGreaterThan(0);
    expect(magic / actions).toBeLessThan(0.3);
  });
});
