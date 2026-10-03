/** First-hour orders, second-hour societies, sealed-century loyalties, and ally jewels. */

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
  'The Whitethorn Coven',
  'The Helix Bureau',
  'The Monad Faculty',
  'The Iconostasy',
] as const;

export type SecondHourSociety = (typeof SECOND_HOUR_SOCIETIES)[number];

/** The Sealed Century: four loyalties of the old work. */
export const SEALED_CENTURY_ORDERS = [
  'The Briar Sidhe',
  'The Mercury Works',
  'The Closed Proof',
  'The Birch Vigil',
] as const;

export type SealedCenturyOrder = (typeof SEALED_CENTURY_ORDERS)[number];

/** Factions retired from the Second Hour (old saves may still name them). */
export const RETIRED_SECOND_HOUR_SOCIETIES = [
  'The Blackout Wardens',
  'The Drowned Parish',
  'The Numbers Station',
  'The Dust Ballot',
] as const;

/** Six first-hour pairs (bidirectional). */
export const FIRST_HOUR_ALLIES: Record<FirstHourOrder, FirstHourOrder> = {
  'The Vril Syndicate': 'The Hermetic Circle',
  'The Hermetic Circle': 'The Vril Syndicate',
  'Order of the Lead Dawn': 'The Midnight Assembly',
  'The Midnight Assembly': 'Order of the Lead Dawn',
  'Sons of the Green Lion': 'The Columbia Lodge',
  'The Columbia Lodge': 'Sons of the Green Lion',
};

/** Four second-hour pairs (ally jewels). */
export const SECOND_HOUR_ALLIES: Record<SecondHourSociety, SecondHourSociety> = {
  'The Whitethorn Coven': 'The Iconostasy',
  'The Iconostasy': 'The Whitethorn Coven',
  'The Helix Bureau': 'The Monad Faculty',
  'The Monad Faculty': 'The Helix Bureau',
};

/** Second Hour rival across the yard (the other tradition, not the ally). */
export const SECOND_HOUR_RIVALS: Record<SecondHourSociety, SecondHourSociety> = {
  'The Whitethorn Coven': 'The Helix Bureau',
  'The Helix Bureau': 'The Whitethorn Coven',
  'The Iconostasy': 'The Monad Faculty',
  'The Monad Faculty': 'The Iconostasy',
};

/** Sealed Century ally jewels. */
export const SEALED_CENTURY_ALLIES: Record<SealedCenturyOrder, SealedCenturyOrder> = {
  'The Briar Sidhe': 'The Birch Vigil',
  'The Birch Vigil': 'The Briar Sidhe',
  'The Mercury Works': 'The Closed Proof',
  'The Closed Proof': 'The Mercury Works',
};

/** Sealed Century rival across the circle. */
export const SEALED_CENTURY_RIVALS: Record<SealedCenturyOrder, SealedCenturyOrder> = {
  'The Briar Sidhe': 'The Mercury Works',
  'The Mercury Works': 'The Briar Sidhe',
  'The Birch Vigil': 'The Closed Proof',
  'The Closed Proof': 'The Birch Vigil',
};

export function isFirstHourOrder(f: string): f is FirstHourOrder {
  return (FIRST_HOUR_ORDERS as readonly string[]).includes(f);
}

export function isSecondHourSociety(f: string): f is SecondHourSociety {
  return (SECOND_HOUR_SOCIETIES as readonly string[]).includes(f);
}

export function isSealedCenturyOrder(f: string): f is SealedCenturyOrder {
  return (SEALED_CENTURY_ORDERS as readonly string[]).includes(f);
}

export function isRetiredSecondHourSociety(f: string): boolean {
  return (RETIRED_SECOND_HOUR_SOCIETIES as readonly string[]).includes(f);
}

export function normalizeFaction(f: string): string {
  if (f === 'The Hermetic Cabal') return 'The Hermetic Circle';
  return f;
}

/** Ally jewel for a sworn order (first hour, second hour, or sealed century). */
export function allyOf(faction: string): string | null {
  const n = normalizeFaction(faction);
  if (isFirstHourOrder(n)) return FIRST_HOUR_ALLIES[n];
  if (isSecondHourSociety(n)) return SECOND_HOUR_ALLIES[n];
  if (isSealedCenturyOrder(n)) return SEALED_CENTURY_ALLIES[n];
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
  'The Whitethorn Coven':
    'Witches, the sidhe, and the green law. May Queen, pooka, bean-nighe, sluagh. Ally: the Iconostasy.',
  'The Helix Bureau':
    'Mad-scientist industry. Aether, chromium, a patent golem, an unlicensed engine. Ally: the Monad Faculty.',
  'The Monad Faculty':
    'Alchemists and masters of the metaphysical. Salt, the living monad, the golden visage. Ally: the Helix Bureau.',
  'The Iconostasy':
    'Slavic folklore. Mad monks, shamans, gamayun, likho, the pike tsar. Ally: the Whitethorn Coven.',
};

export const SEALED_CENTURY_BLURBS: Record<SealedCenturyOrder, string> = {
  'The Briar Sidhe':
    'Witches, the sidhe, and the green law. Cailleach, puck, kelpie, dullahan. Ally: the Birch Vigil.',
  'The Mercury Works':
    'Interwar occult industry. Coils, patents, ray rifles, a walking lathe. Ally: the Closed Proof.',
  'The Closed Proof':
    'Alchemists and masters of the metaphysical. Quicksilver, the veil, the hidden adept. Ally: the Mercury Works.',
  'The Birch Vigil':
    'Slavic folklore. Grizzled shamans, mad monks, leshy, rusalka, the black icon. Ally: the Briar Sidhe.',
};
