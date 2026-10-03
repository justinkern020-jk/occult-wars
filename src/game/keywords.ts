/** Keyword glossary (combat-relevant + board keywords from grok set). */

export interface KeywordInfo {
  key: string;
  /** Player-facing name (the internal key is never shown). */
  name: string;
  glyph?: string;
  title: string;
  combat?: boolean;
}

export const KEYWORDS: Record<string, KeywordInfo> = {
  fast: {
    key: 'fast',
    name: 'Fast Attack',
    glyph: 'F',
    title:
      'Fast Attack. Strikes first in melee (attacker or defender). If the blow drops the foe to Power ≤ 0, they do not strike back. Both Fast: simultaneous.',
    combat: true,
  },
  slow: {
    key: 'slow',
    name: 'Slow Attack',
    glyph: 'S',
    title:
      'Slow Attack. Strikes last. The opponent deals first; if this unit survives, it deals its (possibly reduced) Power.',
    combat: true,
  },
  delay: {
    key: 'delay',
    name: 'Slow muster',
    glyph: 'D',
    title: 'Slow muster. Cannot move or attack the rite it arrives.',
  },
  tough: {
    key: 'tough',
    name: 'Toughness',
    glyph: 'T',
    title: 'Toughness. The first point of any strike is refused.',
    combat: true,
  },
  ranged: {
    key: 'ranged',
    name: 'Ranged Strike',
    glyph: 'R',
    title:
      'Ranged Strike. A shot reaches 2 circles in a straight line — the same rank or file — and is not answered. It cannot shoot on a diagonal. Stepping into an adjacent enemy is an ordinary fight.',
  },
  crown: {
    key: 'crown',
    name: 'Lamp',
    glyph: '☼',
    title: 'Lamp. Adjacent units you control strike for +1 Power.',
  },
  shutter: {
    key: 'shutter',
    name: 'Shutter',
    glyph: 'H',
    title: 'Shutter. Ranged strikes cannot choose this unit.',
  },
  tithe: {
    key: 'tithe',
    name: 'Tithe',
    glyph: '†',
    title: 'Tithe. While this unit stands, your bank yields +1 at rite open.',
  },
  tithe2: {
    key: 'tithe2',
    name: 'Greater Tithe',
    glyph: '‡',
    title: 'Greater Tithe. While this unit stands, your bank yields +2.',
  },
  hearth: {
    key: 'hearth',
    name: 'Hearth',
    glyph: '⌂',
    title: 'Hearth. A resource node this unit stands on banks twice.',
  },
  cryptid: {
    key: 'cryptid',
    name: 'Cryptid',
    glyph: '◊',
    title: 'Cryptid. A sighting at the edge of the map.',
  },
  gills: {
    key: 'gills',
    name: 'Undine',
    glyph: '≈',
    title: 'Undine. A water-born spirit of the Paracelsian kind. Seep cannot wound it.',
  },
  relay: {
    key: 'relay',
    name: 'Relay',
    glyph: '⟳',
    title: 'Relay. When you muster another unit, draw 1 card.',
  },
  arrest: {
    key: 'arrest',
    name: 'Arrest',
    glyph: 'A',
    title:
      'Arrest. A unit wounded by this strike cannot move for its next two turns.',
  },
  veiled: {
    key: 'veiled',
    name: 'Untargetable',
    glyph: '◌',
    title:
      'Untargetable. Combat and ranged strikes pass over this unit. Cannot be named by rites or leaders. Does not conquer.',
  },
  // Board keywords without a glyph: still named for players.
  sprout: {
    key: 'sprout',
    name: 'Growth',
    title:
      'Growth. Gains 1 power at the end of its own rite, and 1 power after each battle it survives.',
  },
  blooded: {
    key: 'blooded',
    name: 'Blooded',
    title: 'Blooded. If it strikes and survives, it gains +2 power.',
  },
  root: {
    key: 'root',
    name: 'Root',
    title: 'Root. Adjacent enemy units cannot move or strike.',
  },
  seep: {
    key: 'seep',
    name: 'Seep',
    title: 'Seep. At the start of your rite, deal 1 to each adjacent enemy (Undine refuse it).',
  },
  unclaiming: {
    key: 'unclaiming',
    name: 'Does not conquer',
    title: 'Does not conquer. It crosses circles and leaves them unclaimed.',
  },
  salvage: {
    key: 'salvage',
    name: 'Salvage',
    title: 'Salvage. When another unit you control is destroyed, bank +1 resources.',
  },
  gas: { key: 'gas', name: 'Gas', title: 'Gas. A poison cloud over the whole field.' },
  toll: {
    key: 'toll',
    name: 'Toll',
    title: 'Toll. When this unit conquers a circle, bank +1 resources.',
  },
  charm: {
    key: 'charm',
    name: 'Charm',
    title: 'Charm. When mustered, the opponent discards a random card.',
  },
  airship: {
    key: 'airship',
    name: 'Airship',
    title:
      'Airship. Loses 1 power at the start of your rite. You may muster onto an empty circle beside it.',
  },
  berserk: {
    key: 'berserk',
    name: 'Berserk',
    title: 'Berserk. When mustered, discard a random card from your hand.',
  },
  tax: {
    key: 'tax',
    name: 'Upkeep',
    title: 'Upkeep. At the start of your rite, pay 2 or it cannot act.',
  },
  reap: {
    key: 'reap',
    name: 'Reap',
    title: 'Reap. When its strike destroys a unit, score 2 domination.',
  },
  chill: {
    key: 'chill',
    name: 'Chill',
    title: 'Chill. Enemy units are mustered exhausted while it stands.',
  },
  glory: {
    key: 'glory',
    name: 'Glory',
    title: 'Glory. When this unit conquers a circle, it gains +1 power.',
  },
  graze: {
    key: 'graze',
    name: 'Graze',
    title: 'Graze. When it moves, adjacent enemy circles become neutral (strongholds are spared).',
  },
  deed: {
    key: 'deed',
    name: 'Deed',
    title: 'Deed. When this unit conquers a circle, score 1 domination.',
  },
  warband: {
    key: 'warband',
    name: 'Warband',
    title: 'Warband. When mustered, gains +1 power for each other unit you control.',
  },
  bloom: {
    key: 'bloom',
    name: 'Bloom',
    title: 'Bloom. When this unit conquers a circle, it gains +1 power.',
  },
  scandal: {
    key: 'scandal',
    name: 'Scandal',
    title: 'Scandal. When mustered, the opponent loses 2 resources.',
  },
  banish: {
    key: 'banish',
    name: 'Banish',
    title: 'Banish. Its attack returns the defender to its owner\'s hand instead of striking.',
  },
  mourner: {
    key: 'mourner',
    name: 'Mourner',
    title: 'Mourner. When an enemy unit is destroyed, draw 1 card.',
  },
  devour: {
    key: 'devour',
    name: 'Devour',
    title: 'Devour. A unit that meets it in combat is destroyed, and its owner discards a card.',
  },
  poll: {
    key: 'poll',
    name: 'Poll',
    title: 'Poll. +1 domination at rite end while it stands on a circle you hold.',
  },
  canvass: {
    key: 'canvass',
    name: 'Canvass',
    title: 'Canvass. When it conquers a street, it also claims one adjacent neutral street.',
  },
};

/** Player-facing keyword name; never leaks an internal key like `crown`. */
export function keywordLabel(key: string): string {
  const info = KEYWORDS[key];
  if (info) return info.name;
  // Unknown key: title-case it rather than show a raw id.
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * True if attacker may choose defender for a strike at the given Manhattan distance.
 * When `from`/`to` are given, a ranged shot (dist > 1) must travel a straight
 * line — same rank or file — never a diagonal.
 */
export function canBeStruck(
  attacker: { keywords: string[] },
  defender: { keywords: string[]; shutter?: boolean },
  dist: number,
  from?: { r: number; c: number },
  to?: { r: number; c: number },
): boolean {
  if (dist < 1) return false;
  if (hasKeyword(defender, 'veiled')) return false;
  const reach = rangedReach(attacker);
  if (dist > reach) return false;
  if (dist > 1 && from && to && !isStraightLine(from, to)) return false;
  // Ranged shot (beyond melee adjacency) cannot choose Shutter.
  if (dist > 1 && (hasKeyword(defender, 'shutter') || defender.shutter)) {
    return false;
  }
  return true;
}

/** Same rank or same file (a ranged shot's lane). */
export function isStraightLine(
  from: { r: number; c: number },
  to: { r: number; c: number },
): boolean {
  return from.r === to.r || from.c === to.c;
}


export function hasKeyword(
  unit: { keywords: string[]; tough?: boolean; fast?: boolean; slow?: boolean },
  key: string,
): boolean {
  if (key === 'tough' && unit.tough) return true;
  if (key === 'fast' && (unit as { fast?: boolean }).fast) return true;
  if (key === 'slow' && (unit as { slow?: boolean }).slow) return true;
  return unit.keywords.includes(key);
}

/**
 * Initiative rank for melee timing.
 * Fast (2) > Normal (1) > Slow (0).
 * Higher rank strikes first; equal ranks trade simultaneously.
 */
export function initiativeRank(
  unit: { keywords: string[]; fast?: boolean; slow?: boolean },
): number {
  if (hasKeyword(unit, 'fast')) return 2;
  if (hasKeyword(unit, 'slow')) return 0;
  return 1;
}

/**
 * Melee timing from BOTH sides' keywords (Cabals dual-Power).
 * - Only one Fast → that side strikes first (no return if lethal).
 * - Both Fast (or equal initiative) → simultaneous.
 * - Slow loses initiative to Normal/Fast.
 */
export function combatModeFor(
  attacker: { keywords: string[]; fast?: boolean; slow?: boolean },
  defender?: { keywords: string[]; fast?: boolean; slow?: boolean },
): 'normal' | 'fast' | 'slow' {
  const atk = initiativeRank(attacker);
  const def = defender ? initiativeRank(defender) : 1;
  if (atk > def) return 'fast';
  if (atk < def) return 'slow';
  return 'normal';
}

/** Manhattan distance on the 5×5 field. */
export function manhattan(r1: number, c1: number, r2: number, c2: number): number {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

/** Ranged strike reach (Manhattan). Non-ranged melee is adjacent (1). */
export function rangedReach(unit: { keywords: string[] }): number {
  return hasKeyword(unit, 'ranged') ? 2 : 1;
}

/** Lamp (crown) bonus: +1 strike Power per adjacent allied crown unit. */
export function crownBonus(
  board: ({ side: string; keywords: string[] } | null)[][],
  side: string,
  r: number,
  c: number,
): number {
  let bonus = 0;
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const u = board[r + dr]?.[c + dc];
    if (u && u.side === side && hasKeyword(u, 'crown')) bonus += 1;
  }
  return bonus;
}
