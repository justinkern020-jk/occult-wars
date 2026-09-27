import { describe, expect, it } from 'vitest';
import { CARDS, isExcludedPlateId } from './catalog';
import { isSecondHourSociety } from '../game/orders';

/** Mirrors Catalog.tsx default Collection filter (encyclopedia, not inventory). */
function collectionEncyclopedia() {
  return CARDS.filter((c) => !isSecondHourSociety(c.faction));
}

describe('Collection encyclopedia (Catalog default)', () => {
  it('includes secret hand-drop and nuke aftermath as archive faces', () => {
    const ids = new Set(collectionEncyclopedia().map((c) => c.id));
    expect(ids.has('south_haven_dispatch')).toBe(true);
    expect(ids.has('radiation_poisoning')).toBe(true);
    expect(ids.has('nuclear_winter')).toBe(true);
    expect(ids.has('justin_kern')).toBe(true);
    expect(ids.has('seth_kern')).toBe(true);
    expect(ids.has('black_monday')).toBe(true);
    // Still flagged for packs/decks — visibility ≠ unlock / own.
    expect(isExcludedPlateId('south_haven_dispatch')).toBe(true);
    expect(isExcludedPlateId('radiation_poisoning')).toBe(true);
    expect(isExcludedPlateId('nuclear_winter')).toBe(true);
    // Loss-inject is collectible once granted — not an excluded archive plate.
    expect(isExcludedPlateId('black_monday')).toBe(false);
  });

  it('includes First Hour cryptids (not only owned)', () => {
    const rows = collectionEncyclopedia().filter((c) =>
      c.keywords.includes('cryptid'),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => !isSecondHourSociety(c.faction))).toBe(true);
  });

  it('excludes Second Hour society plates (deliberate since efa2bf7)', () => {
    const rows = collectionEncyclopedia();
    expect(rows.some((c) => isSecondHourSociety(c.faction))).toBe(false);
    expect(CARDS.some((c) => isSecondHourSociety(c.faction))).toBe(true);
  });
});
