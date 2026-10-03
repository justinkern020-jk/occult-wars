import { describe, expect, it } from 'vitest';
import { CARDS, cardGeneratesResources } from './catalog';

describe('card flavor quotes', () => {
  it('every card has non-empty quote and quoted', () => {
    const missing = CARDS.filter(
      (c) =>
        typeof c.quote !== 'string' ||
        !c.quote.trim() ||
        typeof c.quoted !== 'string' ||
        !c.quoted.trim(),
    );
    expect(missing.map((c) => c.id)).toEqual([]);
  });
});

describe('card resources copy', () => {
  it('no card text uses the word loyalty', () => {
    const hits = CARDS.filter((c) => /\bloyalty\b/i.test(c.text));
    expect(hits.map((c) => c.id)).toEqual([]);
  });
});

describe('cardGeneratesResources', () => {
  it('flags tithe / bank / leech engines, not mere muster cost', () => {
    const siren = CARDS.find((c) => c.id === 'parish_tithe_lord');
    const lamp = CARDS.find((c) => c.id === 'coil_novice');
    const rose = CARDS.find((c) => c.id === 'rose_of_the_shut_garden');
    const mint = CARDS.find((c) => c.id === 'runaway_mint');
    expect(siren && cardGeneratesResources(siren)).toBe(true);
    expect(rose && cardGeneratesResources(rose)).toBe(true);
    // coil_novice has cost but does not bank Resources
    expect(lamp && cardGeneratesResources(lamp)).toBe(false);
    // empties banks — does not generate
    expect(mint && cardGeneratesResources(mint)).toBe(false);
  });

  it('returns a stable set of resource-engine card ids', () => {
    const ids = CARDS.filter(cardGeneratesResources)
      .map((c) => c.id)
      .sort();
    expect(ids.length).toBeGreaterThan(20);
    expect(ids).toContain('brass_count');
    expect(ids).toContain('opened_barrow');
    expect(ids).toContain('hearth_imp');
  });
});
