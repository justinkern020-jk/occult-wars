import { describe, expect, it } from 'vitest';
import { FOIL_CHANCE, addFoils, foilMask, migrateFoils, rollFoil } from './foil';
import { breakSeal, buyPlate, defaultProfile, migrateProfile, shopStock } from './profile';

describe('foil plates', () => {
  it('rolls about one in twelve', () => {
    expect(FOIL_CHANCE).toBeCloseTo(1 / 12);
    expect(rollFoil(() => 0.05)).toBe(true);
    expect(rollFoil(() => 0.5)).toBe(false);
  });
  it('never keeps more foil copies than owned', () => {
    expect(migrateFoils({ a: 3, b: 1, c: 'x' }, ['a', 'a'])).toEqual({ a: 2 });
    expect(migrateFoils(null, ['a'])).toEqual({});
  });
  it('marks the first foil copies in a list', () => {
    expect(foilMask(['a', 'b', 'a', 'a'], { a: 2 })).toEqual([true, false, true, false]);
  });
  it('an old save stays plain', () => {
    const p = migrateProfile({ ...defaultProfile(), collection: ['fairy_doctor'] });
    expect(p.foils).toBeUndefined();
  });
  it('a broken seal can carry foils; the price is unchanged', () => {
    const p = { ...defaultProfile(), alchemicalShards: 1000 };
    const r = breakSeal(p, () => 0.3, () => 0.01);
    if ('error' in r) throw new Error(r.error);
    expect(r.foil.every(Boolean)).toBe(true);
    expect(r.profile.alchemicalShards).toBe(850);
    const total = Object.values(r.profile.foils ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.pulls.length);
  });
  it('a counter purchase can come foil', () => {
    const p = { ...defaultProfile(), alchemicalShards: 1000 };
    const card = shopStock('night')[0]!;
    const r = buyPlate(p, card.id, 'night', () => 0.01);
    if ('error' in r) throw new Error(r.error);
    expect(r.foil).toBe(true);
    expect(r.profile.foils).toEqual(addFoils(undefined, [card.id]));
  });
});
