import { describe, expect, it } from 'vitest';
import { defaultProfile } from '../game/profile';
import { draftsFromProfile } from './DeckEditor';

describe('draftsFromProfile', () => {
  it('offers one fresh working when none is sealed', () => {
    const p = { ...defaultProfile(), allegiance: 'The Vril Syndicate' as const, customDecks: [] };
    const drafts = draftsFromProfile(p);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ id: 'first-working', fresh: true, cards: [] });
    expect(drafts[0].heroId).not.toBe('');
  });

  it('copies every sealed working onto the shelf', () => {
    const p = {
      ...defaultProfile(),
      customDecks: [
        { id: 'a', name: 'A', heroId: 'h1', cards: ['x', 'y'] },
        { id: 'b', name: 'B', heroId: 'h2', cards: ['z'] },
      ],
    };
    const drafts = draftsFromProfile(p);
    expect(drafts.map((d) => [d.id, d.fresh])).toEqual([
      ['a', false],
      ['b', false],
    ]);
    drafts[0].cards.push('w');
    expect(p.customDecks[0].cards).toEqual(['x', 'y']);
  });
});
