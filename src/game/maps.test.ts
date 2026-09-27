import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAPS, cardImageUrl, tileLabel, tileLogName, type Tile } from './maps';

describe('card art paths', () => {
  it('resolves Papa John art to an existing local asset', () => {
    expect(cardImageUrl('Papa John')).toBe('/assets/images/papa_john.jpg');
    expect(
      existsSync(resolve(process.cwd(), 'public/assets/images/papa_john.jpg')),
    ).toBe(true);
  });
});

describe('tile labels (map UI)', () => {
  it('gates have no board text overlay', () => {
    expect(tileLabel({ kind: 'gate' })).toBe('');
    expect(tileLabel({ kind: 'gate', home: 'blue' })).toBe('');
    expect(tileLabel({ kind: 'gate', home: 'red' })).toBe('');
  });
  it('walkable field never says Street', () => {
    expect(tileLabel({ kind: 'street' })).toBe('');
  });
  it('stronghold and resource have no text overlay', () => {
    expect(tileLabel({ kind: 'stronghold', home: 'blue' })).toBe('');
    expect(tileLabel({ kind: 'resource', symbols: 1 })).toBe('');
  });
  it('Outer Seal center gate has no overlay text', () => {
    const m = MAPS.find((x) => x.id === 'outer-seal')!;
    const center = m.tiles[1][2];
    expect(center.kind).toBe('gate');
    expect(center.home).toBeUndefined();
    expect(tileLabel(center)).toBe('');
  });
  it('no map tile overlay contains Gate, Stronghold, Street, or Deployment', () => {
    for (const m of MAPS) {
      for (const row of m.tiles) {
        for (const t of row) {
          const label = tileLabel(t as Tile);
          expect(label).toBe('');
          expect(label.includes('Street')).toBe(false);
          expect(label.includes('Deployment')).toBe(false);
          expect(label.includes('Gate')).toBe(false);
          expect(label.includes('Stronghold')).toBe(false);
        }
      }
    }
  });
  it('tileLogName still names gates for combat logs', () => {
    expect(tileLogName({ kind: 'gate' })).toBe('Gate');
    expect(tileLogName({ kind: 'gate', home: 'blue' })).toBe('Azure Gate');
    expect(tileLogName({ kind: 'stronghold', home: 'red' })).toBe(
      'Crimson stronghold',
    );
  });
});
