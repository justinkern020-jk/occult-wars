/**
 * Plain-English reading of a plate for the hover / long-press peek: what the
 * card is, what it does (rules sentences pulled out of the mixed text), what
 * each keyword means, a few table words explained, and the lore and quote.
 */
import type { Card } from './types';
import { KEYWORDS, keywordLabel } from './keywords';
import { DOMINATION_WIN } from './scoring';

export type PlainKeyword = { key: string; name: string; glyph?: string; text: string };
export type PlainTerm = { term: string; meaning: string };
export type PlainRules = {
  basics: string;
  rules: string[];
  keywords: PlainKeyword[];
  terms: PlainTerm[];
  lore: string[];
  quote?: { text: string; by?: string };
};

/** Plainer wording where the glossary line is terse. */
const PLAIN_KEYWORD: Record<string, string> = {
  crown: 'Your units next to it (above, below, left or right) strike for +1 Power.',
  root: 'Enemy units next to it cannot move or strike.',
  seep: 'At the start of your rite (turn), it deals 1 damage to each enemy next to it.',
  tough: 'The first point of damage from any strike against it is ignored.',
  fast: 'It strikes first in a fight. If that blow brings the foe to 0, the foe never hits back. Two Fast units hit at the same time.',
  slow: 'It strikes last: the other side hits first, and only if it survives does it hit back.',
  delay: 'It cannot move or attack on the rite (turn) it arrives.',
  tithe: 'While it stands, you get +1 resource at the start of each of your rites.',
  tithe2: 'While it stands, you get +2 resources at the start of each of your rites.',
  ranged: 'It can shoot a foe up to 2 circles away in a straight line (not diagonal), and the target cannot hit back. Stepping next to a foe is a normal fight.',
};

const RULE_RX =
  /\b(deals?|damage|power|bank|banks|yields?|draws?|strikes?|struck|rites?|moves?|attacks?|musters?|mustered|name (a|an|any)|pay|exhaust(ed)?|sacrifice|adjacent|resources?|discards?|conquers?|cannot|untargetable|gains?|loses?|destroy(ed|s)?|return|refused|answered|stronghold|domination|unmake|heal|enemy|enemies)\b/i;

const TERMS: { rx: RegExp; term: string; meaning: string }[] = [
  { rx: /\brites?\b/i, term: 'Rite', meaning: 'one turn.' },
  { rx: /\bbank/i, term: 'Bank', meaning: 'your store of resources, spent to muster and to speak cards.' },
  { rx: /\bmuster/i, term: 'Muster', meaning: 'bring a unit from your hand onto the field.' },
  { rx: /\bsitting\b/i, term: 'Sitting', meaning: 'one whole match.' },
  { rx: /\bexhaust/i, term: 'Exhaust', meaning: 'the unit is spent: it cannot move or strike again until your next rite.' },
  { rx: /\badjacent\b|\bbeside\b/i, term: 'Adjacent', meaning: 'the circle directly above, below, left or right (not diagonal).' },
  { rx: /\bname (a|an|any)\b/i, term: 'Name', meaning: 'choose the target.' },
  { rx: /\bconquer/i, term: 'Conquer', meaning: 'step onto a circle to claim it for your side.' },
  { rx: /\bstronghold/i, term: 'Stronghold', meaning: "each side's home circle. Seize the enemy's to win." },
  { rx: /\bdomination\b/i, term: 'Domination', meaning: `points from the circles you hold. Reach ${DOMINATION_WIN} to win.` },
  { rx: /\bunmake/i, term: 'Unmake', meaning: 'remove a unit from the field.' },
  { rx: /\bsacrific/i, term: 'Sacrifice', meaning: 'destroy one of your own units as the price.' },
  { rx: /\bcircles?\b/i, term: 'Circle', meaning: 'one space on the board.' },
];

export function plainKeyword(key: string): PlainKeyword {
  const info = KEYWORDS[key];
  const name = keywordLabel(key);
  let text = PLAIN_KEYWORD[key] ?? info?.title ?? name;
  // Glossary lines open with "Name. "; the peek shows the name beside it.
  if (!PLAIN_KEYWORD[key] && text.startsWith(`${name}.`)) text = text.slice(name.length + 1).trim();
  return { key, name, glyph: info?.glyph, text: text || name };
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function basicsFor(card: Card): string {
  const cost = card.cost;
  const res = `${cost} resource${cost === 1 ? '' : 's'}`;
  switch (card.kind) {
    case 'unit':
      return `A unit. Muster it onto the field for ${res}. Its Power (${card.power ?? 0}) is both its strength and its life: it hits for that much, damage wears it down, and it falls at 0.`;
    case 'rite':
      return `A rite. Speak it from your hand for ${res}; it takes effect at once, then goes to the discard pile.`;
    case 'device':
      return `A device. Use it from your hand for ${res}; it takes effect at once, then goes to the discard pile.`;
    case 'hero':
      return 'A leader. It stands beside the field, not on it; its power is spoken from the leader slot.';
    default:
      return '';
  }
}

export function plainRules(card: Card): PlainRules {
  const kwNames = new Set(card.keywords.map((k) => keywordLabel(k).toLowerCase()));
  const bare = new Set(['leader', 'device', 'rite', 'unit', ...kwNames]);
  const rules: string[] = [];
  const lore: string[] = [];
  for (const s of splitSentences(card.text ?? '')) {
    const head = s.replace(/[.!?]+$/, '').trim().toLowerCase();
    if (bare.has(head)) continue;
    if (RULE_RX.test(s)) rules.push(s);
    else lore.push(s);
  }
  const ruleText = rules.join(' ');
  const terms = TERMS.filter((t) => t.rx.test(ruleText)).map(({ term, meaning }) => ({ term, meaning }));
  return {
    basics: basicsFor(card),
    rules,
    keywords: card.keywords.map(plainKeyword),
    terms,
    lore,
    quote: card.quote ? { text: card.quote, by: card.quoted } : undefined,
  };
}
