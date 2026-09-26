/** First-hour orders, second-hour societies, and ally jewels. */

export const FIRST_HOUR_ORDERS = [
  'The Vril Syndicate',
  'Order of the Lead Dawn',
  'Sons of the Green Lion',
  'The Hermetic Circle',
  'The Midnight Assembly',
  'The Columbia Lodge',
] as const;

export type FirstHourOrder = (typeof FIRST_HOUR_ORDERS)[number];

export const SECOND_HOUR_SOCIETIES = [
  'The Blackout Wardens',
  'The Drowned Parish',
  'The Numbers Station',
  'The Dust Ballot',
] as const;

export type SecondHourSociety = (typeof SECOND_HOUR_SOCIETIES)[number];

/** Six first-hour pairs (bidirectional). */
export const FIRST_HOUR_ALLIES: Record<FirstHourOrder, FirstHourOrder> = {
  'The Vril Syndicate': 'The Hermetic Circle',
  'The Hermetic Circle': 'The Vril Syndicate',
  'Order of the Lead Dawn': 'The Midnight Assembly',
  'The Midnight Assembly': 'Order of the Lead Dawn',
  'Sons of the Green Lion': 'The Columbia Lodge',
  'The Columbia Lodge': 'Sons of the Green Lion',
};

/** Four second-hour pairs. */
export const SECOND_HOUR_ALLIES: Record<SecondHourSociety, SecondHourSociety> = {
  'The Blackout Wardens': 'The Drowned Parish',
  'The Drowned Parish': 'The Blackout Wardens',
  'The Numbers Station': 'The Dust Ballot',
  'The Dust Ballot': 'The Numbers Station',
};

export function isFirstHourOrder(f: string): f is FirstHourOrder {
  return (FIRST_HOUR_ORDERS as readonly string[]).includes(f);
}

export function isSecondHourSociety(f: string): f is SecondHourSociety {
  return (SECOND_HOUR_SOCIETIES as readonly string[]).includes(f);
}

export function normalizeFaction(f: string): string {
  if (f === 'The Hermetic Cabal') return 'The Hermetic Circle';
  return f;
}

/** Ally jewel for a sworn order (first or second hour). */
export function allyOf(faction: string): string | null {
  const n = normalizeFaction(faction);
  if (isFirstHourOrder(n)) return FIRST_HOUR_ALLIES[n];
  if (isSecondHourSociety(n)) return SECOND_HOUR_ALLIES[n];
  return null;
}

/** True if `cardFaction` may sit in a working led by `order`. */
export function isLegalForOrder(order: string, cardFaction: string): boolean {
  const o = normalizeFaction(order);
  const f = normalizeFaction(cardFaction);
  if (f === 'Unaligned') return true;
  if (f === o) return true;
  const ally = allyOf(o);
  return ally != null && f === ally;
}

export const FIRST_HOUR_PAIR_BLURBS: Record<FirstHourOrder, string> = {
  'The Vril Syndicate':
    'Machine hour. Engineers of the lamp. Ally: Hermetic Circle.',
  'The Hermetic Circle':
    'Glass and formula. The retort answers. Ally: Vril Syndicate.',
  'Order of the Lead Dawn':
    'A funeral that has not happened yet. Ally: Midnight Assembly.',
  'The Midnight Assembly':
    'Back-room seats at the hour. Ally: Lead Dawn.',
  'Sons of the Green Lion':
    'Hedge and root. The green quiet. Ally: Columbia Lodge.',
  'The Columbia Lodge':
    'Poe\'s hour, Cayce\'s voice. Ally: Green Lion.',
};

export const SECOND_HOUR_BLURBS: Record<SecondHourSociety, string> = {
  'The Blackout Wardens':
    'Lamps against the dark. Ally: Drowned Parish.',
  'The Drowned Parish':
    'Water under the seals. Ally: Blackout Wardens.',
  'The Numbers Station':
    'Four. Four. Two. Ally: Dust Ballot.',
  'The Dust Ballot':
    'The count before the living. Ally: Numbers Station.',
};
