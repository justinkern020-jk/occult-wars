import { describe, expect, it } from 'vitest';
import { MAPS, tileLabel, type Tile } from './maps';

describe('tile labels (map UI)', () => {
  it('neutral gate is Gate, never Deployment', () => {
    expect(tileLabel({ kind: 'gate' })).toBe('Gate');
  });
  it('sided gates keep Azure/Crimson', () => {
    expect(tileLabel({ kind: 'gate', home: 'blue' })).toBe('Azure Gate');
    expect(tileLabel({ kind: 'gate', home: 'red' })).toBe('Crimson Gate');
  });
  it('walkable field never says Street', () => {
    expect(tileLabel({ kind: 'street' })).toBe('');
  });
  it('strongholds are labeled', () => {
    expect(tileLabel({ kind: 'stronghold', home: 'blue' })).toBe(
      'Azure Stronghold',
    );
  });
  it('Outer Seal center is a neutral Gate', () => {
    const m = MAPS.find((x) => x.id === 'outer-seal')!;
    // `.sRs.` / `r1d1r` / `s2s2s` — row1 col2 is `d`
    const center = m.tiles[1][2];
    expect(center.kind).toBe('gate');
    expect(center.home).toBeUndefined();
    expect(tileLabel(center)).toBe('Gate');
  });
  it('no map tile label contains Street or Deployment', () => {
    for (const m of MAPS) {
      for (const row of m.tiles) {
        for (const t of row) {
          const label = tileLabel(t as Tile);
          expect(label.includes('Street')).toBe(false);
          expect(label.includes('Deployment')).toBe(false);
        }
      }
    }
  });
});
