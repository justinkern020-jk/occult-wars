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
  R('leaden-court', 'The Leaden Court', 'Facing strongholds and single-yield nodes.', [
    '.rRr.',
    's1s1s',
    'sdsds',
    's1s1s',
    '.bBb.',
  ]),
  R('ashen-cross', 'The Ashen Cross', 'A cross, not a square. Side-arm +2 seals.', [
    '.rRr.',
    '.s1s.',
    '2dsd2',
    '.s1s.',
    '.bBb.',
  ]),
  R('twin-vaults', 'The Twin Vaults', 'Double-yield vaults sit off the lane.', [
    'srRrs',
    '1sds1',
    '2sss2',
    '1sds1',
    'sbBbs',
  ]),
  R('outer-seal', 'The Outer Seal', 'Peripheral +2 nodes; center deployment gate.', [
    '.sRs.',
    'r1d1r',
    's2s2s',
    'b1d1b',
    '.sBs.',
  ]),
  R(
    'blackout-yard',
    'The Blackout Yard',
    'The second hour. A yard of streets where the dark can walk.',
    ['.rRr.', 's2s1s', 'sdsds', 's1s2s', '.bBb.'],
    'second',
  ),
  R(
    'culvert-court',
    'The Culvert Court',
    'The second hour. Water under the seals, and a long street for the vote.',
    ['srRrs', '2sds1', 'sssss', '1sds2', 'sbBbs'],
    'second',
  ),
];

export function mapById(id: string): GameMap {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function mapsForEra(era: 'first' | 'second'): GameMap[] {
  return MAPS.filter((m) => (m.era ?? 'first') === era);
}

/** User-facing tile name. Stronghold/resource use full-tile art — no text overlay. */
export function tileLabel(t: Tile): string {
  if (t.kind === 'void') return '';
  // Strongholds & resources: graphics only (no "Stronghold" / "Resource" text).
  if (t.kind === 'stronghold' || t.kind === 'resource') return '';
  if (t.kind === 'gate') {
    if (t.home === 'blue') return 'Azure Gate';
    if (t.home === 'red') return 'Crimson Gate';
    return 'Gate';
  }
  return '';
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
