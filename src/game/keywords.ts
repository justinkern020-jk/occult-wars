/** Keyword glossary (combat-relevant + common board keywords). */

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
      'Fast Attack. Strikes first in melee. If the blow drops the foe to Power ≤ 0, they do not strike back.',
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
    title: 'Ranged Strike. May strike at range instead of stepping into melee.',
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
};

export function hasKeyword(
  unit: { keywords: string[]; tough?: boolean; fast?: boolean; slow?: boolean },
  key: string,
): boolean {
  if (key === 'tough' && unit.tough) return true;
  if (key === 'fast' && (unit as { fast?: boolean }).fast) return true;
  if (key === 'slow' && (unit as { slow?: boolean }).slow) return true;
  return unit.keywords.includes(key);
}

export function combatModeFor(
  attacker: { keywords: string[] },
): 'normal' | 'fast' | 'slow' {
  if (hasKeyword(attacker, 'fast')) return 'fast';
  if (hasKeyword(attacker, 'slow')) return 'slow';
  return 'normal';
}
