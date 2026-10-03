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

export interface GameMap {
  id: string;
  name: string;
  epithet: string;
  tiles: Tile[][];
  era?: 'first' | 'second';
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
  era: 'first' | 'second' = 'first',
): GameMap {
  const tiles = rows.map((row) => [...row].map(Me));
  return { id, name, epithet, tiles, era };
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
];

export function mapById(id: string): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function mapsForEra(era: 'first' | 'second'): GameMap[] {
  return MAPS.filter((m) => (m.era ?? 'first') === era);
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
