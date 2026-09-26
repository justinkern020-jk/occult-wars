import { describe, expect, it } from 'vitest';
import {
  buildShuffledWorking,
  buildWorkingIds,
  drawFromDeck,
} from './deck';
import { HAND_CAP } from './scoring';

describe('training working decks', () => {
  it('builds 30-card Wardens / Parish workings', () => {
    const w = buildWorkingIds('The Blackout Wardens');
    const p = buildWorkingIds('The Drowned Parish');
    expect(w).toHaveLength(30);
    expect(p).toHaveLength(30);
  });

  it('draws toward hand cap 7', () => {
    const deck = buildShuffledWorking('The Blackout Wardens');
    const a = drawFromDeck(deck, [], 5);
    expect(a.hand).toHaveLength(5);
    expect(a.deck).toHaveLength(25);
    const b = drawFromDeck(a.deck, a.hand, 3);
    expect(b.hand).toHaveLength(HAND_CAP);
    expect(b.drawn).toBe(2);
    expect(b.sealed).toBe(true);
  });
});
