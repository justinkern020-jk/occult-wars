/** Oct 2026 card-fit pass: player-facing keyword names, Undine, renamed plates. */
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_ID_RENAMES, cardById } from '../data/catalog';
import { KEYWORDS, keywordLabel } from './keywords';
import { migrateProfile } from './profile';

describe('keyword names shown to players', () => {
  const used = [...new Set(CARDS.flatMap((c) => c.keywords))].sort();

  it.each(used.map((k) => [k]))('%s has a glossary name and tooltip', (k) => {
    expect(KEYWORDS[k]?.name, k).toBeTruthy();
    expect(KEYWORDS[k]?.title, k).toBeTruthy();
  });

  it('Lamp and Undine are named for players (never crown / gills)', () => {
    expect(keywordLabel('crown')).toBe('Lamp');
    expect(keywordLabel('gills')).toBe('Undine');
    expect(KEYWORDS.crown.title).toMatch(/^Lamp\./);
    expect(KEYWORDS.gills.title).toMatch(/^Undine\./);
    expect(KEYWORDS.veiled.title).not.toMatch(/veiled/i);
  });

  it('glyphs are unique and do not reuse the L / P stat pips', () => {
    const glyphs = Object.values(KEYWORDS)
      .map((k) => k.glyph)
      .filter((g): g is string => !!g);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(glyphs).not.toContain('L');
    expect(glyphs).not.toContain('P');
  });

  it('no card text says Gills, Stamina or crown', () => {
    for (const c of CARDS) {
      expect(c.text, c.id).not.toMatch(/\bGills\b|\bStamina\b|\bcrown\b|Four and four/);
    }
  });

  it('every Undine unit prints the Undine rule', () => {
    for (const c of CARDS.filter((x) => x.keywords.includes('gills'))) {
      expect(c.text, c.id).toMatch(/Undine\. Seep cannot wound it\./);
    }
  });
});

describe('re-made plates', () => {
  it('old ids resolve to the new plates', () => {
    for (const [from, to] of Object.entries(CARD_ID_RENAMES)) {
      expect(cardById(from)?.id, from).toBe(to);
      expect(CARDS.some((c) => c.id === from), from).toBe(false);
    }
  });

  it('new fast strikers keep Fast Attack + Blooded and their stats', () => {
    const want: Record<string, [number, number]> = {
      galvanic_hound: [3, 3],
      chromium_fencer: [3, 3],
      azoth_swordsman: [2, 2],
    };
    for (const [id, [cost, power]] of Object.entries(want)) {
      const c = cardById(id)!;
      expect(c.keywords, id).toEqual(['fast', 'blooded']);
      expect([c.cost, c.power], id).toEqual([cost, power]);
      expect(c.quote && c.quoted, id).toBeTruthy();
    }
  });

  it('saved collections, decks and era workings follow the rename', () => {
    const p = migrateProfile({
      collection: ['diagram_clerk', 'chromium_surgeon', 'the_minus_sign', 'redcap'],
      customDecks: [
        { id: 'd1', name: 'Old', heroId: 'director_voss', cards: ['diagram_clerk', 'redcap'] },
      ],
      oldOrder: 'The Closed Proof',
      oldHero: 'provost_of_the_azoth',
      oldCards: ['the_minus_sign', 'quicksilver_fellow'],
      secondOrder: 'The Helix Bureau',
      secondHero: 'chief_adler',
      secondCards: ['chromium_surgeon'],
    });
    expect(p.collection).toEqual(['galvanic_hound', 'chromium_fencer', 'azoth_swordsman', 'redcap']);
    expect(p.customDecks[0].cards).toEqual(['galvanic_hound', 'redcap']);
    expect(p.oldCards).toEqual(['azoth_swordsman', 'quicksilver_fellow']);
    expect(p.secondCards).toEqual(['chromium_fencer']);
  });
});
