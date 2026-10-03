import { describe, expect, it } from 'vitest';
import {
  buildShuffledWorking,
  buildWorkingIds,
  drawFromDeck,
} from './deck';
import { HAND_CAP } from './scoring';

describe('training working decks', () => {
  it('builds 30-card Second Hour and Sealed Century workings', () => {
    for (const f of [
      'The Whitethorn Coven',
      'The Helix Bureau',
      'The Monad Faculty',
      'The Iconostasy',
      'The Briar Sidhe',
      'The Mercury Works',
      'The Closed Proof',
      'The Birch Vigil',
    ]) {
      expect(buildWorkingIds(f), f).toHaveLength(30);
    }
  });

  it('draws toward hand cap 7', () => {
    const deck = buildShuffledWorking('The Whitethorn Coven');
    const a = drawFromDeck(deck, [], 5);
    expect(a.hand).toHaveLength(5);
    expect(a.deck).toHaveLength(25);
    const b = drawFromDeck(a.deck, a.hand, 3);
    expect(b.hand).toHaveLength(HAND_CAP);
    expect(b.drawn).toBe(2);
    expect(b.sealed).toBe(true);
  });
});
