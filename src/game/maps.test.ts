import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  cardImageUrl,
  isMainGameMap,
  mainGameMaps,
  mapById,
  mapsForEra,
  matchEra,
  tileLabel,
  tileLogName,
  type Tile,
} from './maps';

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

describe('the prequel (Sealed Century) grounds in the main game', () => {
  it('the main-game picker lists every First Hour field, then all seven prequel grounds', () => {
    const ids = mainGameMaps().map((m) => m.id);
    expect(ids).toEqual([...mapsForEra('first'), ...mapsForEra('old')].map((m) => m.id));
    for (const id of [
      'nile-court',
      'saturn-cross',
      'rose-crypt',
      'silk-pass',
      'noon-orchard',
      'white-road',
      'sun-garden',
    ]) {
      expect(isMainGameMap(id), id).toBe(true);
    }
    // Second Hour yards stay behind their own door.
    expect(isMainGameMap('blackout-yard')).toBe(false);
    expect(isMainGameMap('culvert-court')).toBe(false);
    expect(isMainGameMap(undefined)).toBe(false);
  });

  it('a prequel ground in Training, Pass the Grimoire or a friend match plays as the First Hour', () => {
    const nile = mapById('nile-court');
    for (const mode of ['training', 'hotseat', 'friend', 'campaign']) {
      expect(matchEra(mode, nile), mode).toBe('first');
    }
    expect(matchEra('old', nile)).toBe('old');
    expect(matchEra('second', mapById('blackout-yard'))).toBe('second');
    expect(matchEra('training', mapById('blackout-yard'))).toBe('second');
    expect(matchEra('training', mapById('ashen-cross'))).toBe('first');
  });

  it('every prequel ground has a stronghold and gate for each side, so any mode can boot on it', () => {
    for (const m of mapsForEra('old')) {
      const flat = m.tiles.flat();
      expect(m.tiles).toHaveLength(5);
      for (const row of m.tiles) expect(row).toHaveLength(5);
      for (const side of ['blue', 'red'] as const) {
        expect(flat.some((t) => t.kind === 'stronghold' && t.home === side), `${m.id} ${side}`).toBe(true);
        expect(flat.some((t) => t.kind === 'gate' && t.home === side), `${m.id} ${side}`).toBe(true);
      }
    }
  });
});
