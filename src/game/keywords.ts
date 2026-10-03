/** Keyword glossary (combat-relevant + board keywords from grok set). */

export interface KeywordInfo {
  key: string;
  glyph: string;
  title: string;
  combat?: boolean;
}

export const KEYWORDS: Record<string, KeywordInfo> = {
  fast: {
    key: 'fast',
    glyph: 'F',
    title:
      'Fast Attack. Strikes first in melee (attacker or defender). If the blow drops the foe to Power ≤ 0, they do not strike back. Both Fast: simultaneous.',
    combat: true,
  },
  slow: {
    key: 'slow',
    glyph: 'S',
    title:
      'Slow Attack. Strikes last. The opponent deals first; if this unit survives, it deals its (possibly reduced) Power.',
    combat: true,
  },
  delay: {
    key: 'delay',
    glyph: 'D',
    title: 'Slow muster. Cannot move or attack the rite it arrives.',
  },
  tough: {
    key: 'tough',
    glyph: 'T',
    title: 'Toughness. The first point of any strike is refused.',
    combat: true,
  },
  ranged: {
    key: 'ranged',
    glyph: 'R',
    title:
      'Ranged Strike. A shot reaches 2 circles in a straight line — the same rank or file — and is not answered. It cannot shoot on a diagonal. Stepping into an adjacent enemy is an ordinary fight.',
  },
  crown: {
    key: 'crown',
    glyph: 'C',
    title: 'Lamp. Adjacent units you control strike for +1 Power.',
  },
  shutter: {
    key: 'shutter',
    glyph: 'H',
    title: 'Shutter. Ranged strikes cannot choose this unit.',
  },
  tithe: {
    key: 'tithe',
    glyph: '†',
    title: 'Tithe. While this unit stands, your bank yields +1 at rite open.',
  },
  tithe2: {
    key: 'tithe2',
    glyph: '‡',
    title: 'Greater Tithe. While this unit stands, your bank yields +2.',
  },
  hearth: {
    key: 'hearth',
    glyph: '⌂',
    title: 'Hearth. A resource node this unit stands on banks twice.',
  },
  cryptid: {
    key: 'cryptid',
    glyph: '◊',
    title: 'Cryptid. A sighting at the edge of the map.',
  },
  gills: {
    key: 'gills',
    glyph: '≈',
    title: 'Gills. Seep cannot wound this unit.',
  },
  relay: {
    key: 'relay',
    glyph: '⟳',
    title: 'Relay. When you muster another unit, draw 1 card.',
  },
  arrest: {
    key: 'arrest',
    glyph: 'A',
    title:
      'Arrest. A unit wounded by this strike cannot move for its next two turns.',
  },
    veiled: {
    key: 'veiled',
    glyph: '◌',
    title:
      'Veiled (Untargetable). Combat and ranged strikes pass over this unit. Cannot be named by rites or leaders. Does not conquer.',
  },
};

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
