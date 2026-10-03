/** 5×5 occult field maps (Cabals / Grok lander encodings). */

export type Side = 'blue' | 'red';

export type TileKind =
  | 'void'
  | 'street' /* walkable field — never show "Street" in UI */
  | 'stronghold'
  | 'gate'
  | 'resource';

export interface Tile {
  kind: TileKind;
  home?: Side;
  symbols?: 1 | 2;
}

/** Which hour a field belongs to: First Hour, Second Hour, or the Sealed Century. */
export type MapEra = 'first' | 'second' | 'old';

export interface GameMap {
  id: string;
  name: string;
  epithet: string;
  tiles: Tile[][];
  era?: MapEra;
  /** 'bright' grounds are daylight fields (warmer tiles). */
  mood?: 'bright';
}

function Me(ch: string): Tile {
  switch (ch) {
    case '.':
      return { kind: 'void' };
    case 's':
      return { kind: 'street' };
    case 'B':
      return { kind: 'stronghold', home: 'blue' };
    case 'R':
      return { kind: 'stronghold', home: 'red' };
    case 'b':
      return { kind: 'gate', home: 'blue' };
    case 'r':
      return { kind: 'gate', home: 'red' };
    case 'd':
      return { kind: 'gate' };
    case '1':
      return { kind: 'resource', symbols: 1 };
    case '2':
      return { kind: 'resource', symbols: 2 };
    default:
      throw new Error(`Unknown tile glyph: ${ch}`);
  }
}

function R(
  id: string,
  name: string,
  epithet: string,
  rows: string[],
  era: MapEra = 'first',
  mood?: 'bright',
): GameMap {
  const tiles = rows.map((row) => [...row].map(Me));
  return mood ? { id, name, epithet, tiles, era, mood } : { id, name, epithet, tiles, era };
}

export const MAPS: GameMap[] = [
  R(
    'leaden-court',
    'The Leaden Court',
    'Doubles sit against your gates. The middle of that rank is an open street.',
    ['.rRr.', '21s12', 'sdsds', '21s12', '.bBb.'],
  ),
  R(
    'ashen-cross',
    'The Ashen Cross',
    'A cross. The heavy seals are on the stem. The arms only pay one.',
    ['.rRr.', '.s2s.', '1dsd1', '.s2s.', '.bBb.'],
  ),
  R(
    'twin-vaults',
    'The Twin Vaults',
    'Double vaults beside the doors. The mid lane only pays one.',
    ['srRrs', '2sds2', '1sss1', '2sds2', 'sbBbs'],
  ),
  R(
    'outer-seal',
    'The Outer Seal',
    'Fat seals on your wings. The center road pays less.',
    ['.sRs.', 'r2d2r', 's1s1s', 'b2d2b', '.sBs.'],
  ),
  R(
    'blackout-yard',
    'The Blackout Yard',
    'A split yard. Two lanes, a hole between them. The seals are not across from each other.',
    ['.rRr.', 's2.1s', 'sd.ds', 's1.2s', '.bBb.'],
    'second',
  ),
  R(
    'culvert-court',
    'The Culvert Court',
    'A culvert. Doubles under the doors. The banks of that rank are cut away.',
    ['srRrs', '.2s2.', 's1s1s', '.2s2.', 'sbBbs'],
    'second',
  ),
  // The Sealed Century — seven grounds, none the same shape.
  R(
    'nile-court',
    'The Nile Court',
    'A bent river. A double under the house. A belt of singles you have to cross.',
    ['.rRr.', 's.2.s', '11s11', 's.2.s', '.bBb.'],
    'old',
  ),
  R(
    'saturn-cross',
    'The Saturn Ring',
    'A cloister ring. The heart is a hole. Doubles hang on the side aisles, and the aisles never meet.',
    ['.rRr.', '1s.s1', '2s.s2', '1s.s1', '.bBb.'],
    'old',
  ),
  R(
    'rose-crypt',
    'The Rose Crypt',
    'The houses stand one rank forward. Chapel seals pay one. There is no double seal.',
    ['rs.sr', 's1R1s', 's.s.s', 's1B1s', 'bs.sb'],
    'old',
  ),
  R(
    'silk-pass',
    'The Silk Pass',
    'Two rooms. You only cross by standing on a double-seal ledge.',
    ['..R..', 'r1s1r', '.2.2.', 'b1s1b', '..B..'],
    'old',
  ),
  R(
    'noon-orchard',
    'The Noon Orchard',
    'Daylight. Side hedges, a center path, and doubles that are the only bridges.',
    ['srRrs', '1.s.1', 's2s2s', '1.s.1', 'sbBbs'],
    'old',
    'bright',
  ),
  R(
    'white-road',
    'The White Road',
    'Daylight. Two forks with a void between the groves. Switch roads at home, not in the middle.',
    ['r.R.r', 's1s1s', '.2.2.', 's1s1s', 'b.B.b'],
    'old',
    'bright',
  ),
  R(
    'sun-garden',
    'The Sun Garden',
    'Daylight. Doubles in the corners, beside your own doors. The open road is the fight.',
    ['2rRr2', 's.1.s', 'sssss', 's.1.s', '2bBb2'],
    'old',
    'bright',
  ),
];

export function mapById(id: string): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function mapsForEra(era: MapEra): GameMap[] {
  return MAPS.filter((m) => (m.era ?? 'first') === era);
}

/**
 * Fields a player may pick in the main game — Training vs AI, Pass the Grimoire,
 * and friend matches: every First Hour field, then the Sealed Century (prequel)
 * grounds. The prequel grounds carry no era-only tile rules, so they play under
 * the ordinary First Hour rite. Second Hour yards stay behind their own door.
 */
export function mainGameMaps(): GameMap[] {
  return [...mapsForEra('first'), ...mapsForEra('old')];
}

export function isMainGameMap(id: string | null | undefined): boolean {
  return !!id && mainGameMaps().some((m) => m.id === id);
}

/**
 * The hour a match is played in (cryptid pool, visit counter, Portal label).
 * The mode decides it; a Sealed Century ground picked in the main game still
 * plays as the First Hour. A Second Hour yard keeps its own hour.
 */
export function matchEra(mode: string, map: GameMap): MapEra {
  if (mode === 'second') return 'second';
  if (mode === 'old') return 'old';
  if ((map.era ?? 'first') === 'second') return 'second';
  return 'first';
}

/** Board overlay label. Art speaks — never paint Gate/Stronghold/Resource text on tiles. */
export function tileLabel(t: Tile): string {
  void t;
  return '';
}

/** Internal name for logs (not rendered on the board). */
export function tileLogName(t: Tile): string {
  if (t.kind === 'void') return 'void';
  if (t.kind === 'stronghold') {
    if (t.home === 'blue') return 'Azure stronghold';
    if (t.home === 'red') return 'Crimson stronghold';
    return 'stronghold';
  }
  if (t.kind === 'resource') {
    return t.symbols === 2 ? 'double seal' : 'seal';
  }
  if (t.kind === 'gate') {
    if (t.home === 'blue') return 'Azure Gate';
    if (t.home === 'red') return 'Crimson Gate';
    return 'Gate';
  }
  return 'circle';
}

/** Prefer local mirrored art; fall back to grok CDN. */
export function cardImageUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `/assets/images/${slug}.jpg`;
}

export function cardImageFallback(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `https://occultwar.grok.me/assets/images/${slug}.jpg`;
}
