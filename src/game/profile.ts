/** Profile persistence: occult-wars.profile.v1 */

import {
  BLACK_MONDAY_ID,
  CARDS,
  canonicalCardId,
  cardById,
  isExcludedPlateId,
  isLossInjectId,
} from '../data/catalog';
import type { Card } from './types';
import {
  FIRST_HOUR_ORDERS,
  allyOf,
  isFirstHourOrder,
  isLegalForOrder,
  isSealedCenturyOrder,
  isSecondHourSociety,
  normalizeFaction,
  type FirstHourOrder,
} from './orders';
import { buildOrderAllyWorkingIds, buildWorkingIds } from './deck';

export const PROFILE_KEY = 'occult-wars.profile.v1';
export const PACK_COST = 150;
export const START_SHARDS = 500;
export const DAILY_PURSE = 1000;

export type ShardRewards = {
  training: { win: number; loss: number };
  pvp: { win: number; loss: number };
  hotseat: { win: number; loss: number };
  campaign: { win: number; loss: number };
  /** The Sealed Century (the prequel): shards spent at its own counter. */
  old: { win: number; loss: number };
};

export const SHARD_REWARDS: ShardRewards = {
  training: { win: 50, loss: 15 },
  pvp: { win: 100, loss: 30 },
  hotseat: { win: 0, loss: 0 },
  campaign: { win: 40, loss: 10 },
  old: { win: 50, loss: 15 },
};

export type CustomDeck = {
  id: string;
  name: string;
  heroId: string;
  cards: string[];
};

export type CampaignProgress = {
  stage: number;
  endings: string[];
  choices: Record<string, string>;
};

export type Profile = {
  version: 1;
  username: string;
  alchemicalShards: number;
  collection: string[];
  customDecks: CustomDeck[];
  seenPrimer: boolean;
  primerVersion: number;
  allegiance: FirstHourOrder | null;
  lastDaily: string | null;
  campaign: CampaignProgress | null;
  secondOrder: string | null;
  secondHero: string | null;
  secondCards: string[] | null;
  /** The Sealed Century: sworn loyalty, leader, and working. */
  oldOrder: string | null;
  oldHero: string | null;
  oldCards: string[] | null;
  /**
   * The Sealed Century workings shelf (up to 8 per order). The first one whose
   * leader fits the sworn order is the one on the field (mirrored in oldHero /
   * oldCards, which the match reads).
   */
  oldDecks: CustomDeck[];
};

export function defaultProfile(): Profile {
  return {
    version: 1,
    username: 'Adept',
    alchemicalShards: START_SHARDS,
    collection: [],
    customDecks: [],
    seenPrimer: false,
    primerVersion: 3,
    allegiance: null,
    lastDaily: null,
    campaign: null,
    secondOrder: null,
    secondHero: null,
    secondCards: null,
    oldOrder: null,
    oldHero: null,
    oldCards: null,
    oldDecks: [],
  };
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadProfile(): Profile {
  if (typeof localStorage === 'undefined') return defaultProfile();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    return migrateProfile(JSON.parse(raw));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

/**
 * A plate id an old save may still hold: must exist in the catalogue (retired
 * Second Hour plates — Blackout Wardens, Drowned Parish, Numbers Station, Dust
 * Ballot — are stripped) and must not be an excluded plate.
 */
/** Follow plate renames so old saves keep their re-made plates. */
function renamedIds(list: unknown[]): unknown[] {
  return list.map((id) => (typeof id === 'string' ? canonicalCardId(id) : id));
}

function isKeepablePlateId(id: unknown): id is string {
  return typeof id === 'string' && !!cardById(id) && !isExcludedPlateId(id);
}

/** Era working (second / old): keep only live plates that the oath allows. */
function eraWorking(
  order: string | null,
  heroRaw: unknown,
  cardsRaw: unknown,
): { hero: string | null; cards: string[] | null } {
  if (!order) return { hero: null, cards: null };
  const heroCard = typeof heroRaw === 'string' ? cardById(heroRaw) : undefined;
  const hero =
    heroCard && heroCard.kind === 'hero' && isLegalForOrder(order, heroCard.faction)
      ? heroCard.id
      : null;
  const cards = Array.isArray(cardsRaw)
    ? renamedIds(cardsRaw).filter(
        (c): c is string =>
          isKeepablePlateId(c) && isLegalForOrder(order, cardById(c)!.faction),
      )
    : null;
  return { hero, cards };
}

export function migrateProfile(raw: Partial<Profile> & Record<string, unknown>): Profile {
  const base = defaultProfile();
  const secondOrder =
    typeof raw.secondOrder === 'string' && isSecondHourSociety(raw.secondOrder)
      ? raw.secondOrder
      : null;
  const second = eraWorking(secondOrder, raw.secondHero, raw.secondCards);
  const oldOrder =
    typeof raw.oldOrder === 'string' && isSealedCenturyOrder(raw.oldOrder)
      ? raw.oldOrder
      : null;
  const old = eraWorking(oldOrder, raw.oldHero, raw.oldCards);
  const allegianceRaw =
    typeof raw.allegiance === 'string' ? normalizeFaction(raw.allegiance) : null;
  const allegiance =
    allegianceRaw && isFirstHourOrder(allegianceRaw) ? allegianceRaw : null;
  return {
    version: 1,
    username:
      typeof raw.username === 'string' && raw.username.trim()
        ? raw.username.slice(0, 32)
        : base.username,
    alchemicalShards:
      typeof raw.alchemicalShards === 'number'
        ? Math.max(0, Math.floor(raw.alchemicalShards))
        : base.alchemicalShards,
    collection: Array.isArray(raw.collection)
      ? renamedIds(raw.collection).filter(isKeepablePlateId)
      : [],
    customDecks: migrateDecks(raw.customDecks),
    seenPrimer: !!raw.seenPrimer && raw.primerVersion === 3,
    primerVersion: 3,
    allegiance,
    lastDaily:
      typeof raw.lastDaily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDaily)
        ? raw.lastDaily
        : null,
    campaign: (raw.campaign as CampaignProgress) ?? null,
    secondOrder,
    secondHero: second.hero,
    secondCards: second.cards,
    oldOrder,
    oldHero: old.hero,
    oldCards: old.cards,
    oldDecks: migrateDecks(raw.oldDecks),
  };
}

function migrateDecks(raw: unknown): CustomDeck[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CustomDeck[])
    .filter((d) => d && typeof d.id === 'string')
    .map((d) => ({
      id: d.id,
      name: String(d.name ?? 'Untitled working').slice(0, 32),
      heroId: canonicalCardId(String(d.heroId ?? '')),
      cards: Array.isArray(d.cards) ? renamedIds(d.cards).filter(isKeepablePlateId) : [],
    }));
}

/** Apply day-purse if lastDaily is not today. Returns [profile, granted]. */
export function claimDaily(p: Profile): { profile: Profile; granted: number } {
  const today = todayKey();
  if (p.lastDaily === today) return { profile: p, granted: 0 };
  return {
    profile: {
      ...p,
      lastDaily: today,
      alchemicalShards: p.alchemicalShards + DAILY_PURSE,
    },
    granted: DAILY_PURSE,
  };
}

export function countOwned(collection: string[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const id of collection) t[id] = (t[id] ?? 0) + 1;
  return t;
}

export function heroesForOrder(order: string): Card[] {
  return CARDS.filter((c) => c.kind === 'hero' && c.faction === order);
}

export function autoWorking(order: string): CustomDeck {
  const heroes = heroesForOrder(order);
  const hero = heroes[0];
  if (!hero) throw new Error(`No leader for ${order}`);
  const cards = buildWorkingIds(order, 30);
  // Prefer order cards; fill from ally if short
  if (cards.length < 30) {
    const ally = allyOf(order);
    if (ally) {
      for (const id of buildWorkingIds(ally, 30)) {
        if (cards.length >= 30) break;
        cards.push(id);
      }
    }
  }
  return {
    id: 'first-working',
    name: order,
    heroId: hero.id,
    cards: cards.slice(0, 30),
  };
}

/** Swear primary order: grant starter working into collection + customDecks. */
export function swearAllegiance(p: Profile, order: FirstHourOrder): Profile {
  const working = autoWorking(order);
  const owned = countOwned(p.collection);
  const need = countOwned(working.cards);
  const collection = [...p.collection];
  for (const [id, n] of Object.entries(need)) {
    const deficit = n - (owned[id] ?? 0);
    for (let i = 0; i < deficit; i++) collection.push(id);
  }
  // Grant hero plate
  if (!collection.includes(working.heroId)) collection.push(working.heroId);
  const customDecks = [
    working,
    ...p.customDecks.filter((d) => d.id !== working.id),
  ];
  return { ...p, allegiance: order, collection, customDecks };
}

export function isLegalDeck(deck: CustomDeck | null | undefined): boolean {
  if (!deck) return false;
  const hero = CARDS.find((c) => c.id === deck.heroId);
  if (!hero || hero.kind !== 'hero') return false;
  if (deck.cards.length < 30 || deck.cards.length > 40) return false;
  const counts: Record<string, number> = {};
  for (const id of deck.cards) {
    const card = CARDS.find((c) => c.id === id);
    if (!card || card.kind === 'hero') return false;
    if (card.keywords.includes('cryptid')) return false;
    if (isExcludedPlateId(card.id)) return false;
    if (!isLegalForOrder(hero.faction, card.faction)) return false;
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > 3) return false;
  }
  return true;
}

/**
 * First Hour pack pool: non-hero, non-cryptid, no Second Hour societies
 * (sold at the night counter) and no Sealed Century loyalties,
 * no nuke-aftermath / secret hand-drop / loss-inject plates.
 * First 3 pulls bias to order+ally.
 */
export function packPool(order: string | null, biasOrder: boolean): Card[] {
  return CARDS.filter((c) => {
    if (c.kind === 'hero') return false;
    if (c.keywords.includes('cryptid')) return false;
    if (isSecondHourSociety(c.faction)) return false;
    if (isSealedCenturyOrder(c.faction)) return false;
    if (isExcludedPlateId(c.id)) return false;
    if (isLossInjectId(c.id)) return false;
    if (!biasOrder || !order) return true;
    return isLegalForOrder(order, c.faction);
  });
}

export function breakSeal(
  p: Profile,
  rand = Math.random,
): { error: string } | { profile: Profile; pulls: Card[] } {
  if (p.alchemicalShards < PACK_COST) {
    return { error: 'A booster asks 150 shards.' };
  }
  const pulls: Card[] = [];
  for (let i = 0; i < 5; i++) {
    const pool = packPool(p.allegiance, i < 3);
    if (pool.length === 0) continue;
    const card = pool[Math.floor(rand() * pool.length)];
    if (card) pulls.push(card);
  }
  return {
    profile: {
      ...p,
      alchemicalShards: p.alchemicalShards - PACK_COST,
      collection: [...p.collection, ...pulls.map((c) => c.id)],
    },
    pulls,
  };
}

/** Night counter prices (shards) by rarity. */
export const SHOP_PRICES: Record<Card['rarity'], number> = {
  common: 40,
  uncommon: 90,
  rare: 160,
  patron: 220,
};

/** A leader is kept once; units, rites, and devices up to three copies. */
export function shopCopyLimit(card: Card): number {
  return card.kind === 'hero' ? 1 : 3;
}

/**
 * Which counter: the night counter (Second Hour societies) or the sealed
 * counter inside the Sealed Century (its four orders, plus any unaligned
 * plate that is neither a cryptid, a secret code-drop, nuke aftermath, nor the
 * Black Monday comeback — today none qualify).
 */
export type ShopCounter = 'night' | 'sealed';

/** A counter stocks its era's plates only (never cryptids or secret plates). */
export function isShopPlate(card: Card, counter: ShopCounter = 'night'): boolean {
  if (counter === 'sealed') {
    if (!isSealedCenturyOrder(card.faction) && card.faction !== 'Unaligned') return false;
  } else if (!isSecondHourSociety(card.faction)) return false;
  if (card.keywords.includes('cryptid')) return false;
  if (isExcludedPlateId(card.id) || isLossInjectId(card.id)) return false;
  return (
    card.kind === 'unit' ||
    card.kind === 'rite' ||
    card.kind === 'device' ||
    card.kind === 'hero'
  );
}

export function shopStock(counter: ShopCounter = 'night'): Card[] {
  return CARDS.filter((c) => isShopPlate(c, counter)).sort(
    (a, b) =>
      a.faction.localeCompare(b.faction) ||
      a.cost - b.cost ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Copies a counter counts as already held: the collection, plus (at the sealed
 * counter) the sworn order's starter working, which the deck editor seats too.
 */
export function shopOwnedCount(p: Profile, id: string, counter: ShopCounter = 'night'): number {
  if (counter === 'sealed') return ownedForEra(p, 'old')[id] ?? 0;
  return p.collection.filter((x) => x === id).length;
}

/** Buy one copy at a counter (shards, added to the collection). */
export function buyPlate(
  p: Profile,
  id: string,
  counter: ShopCounter = 'night',
): { error: string } | { profile: Profile; card: Card } {
  const card = cardById(id);
  if (!card || !isShopPlate(card, counter)) {
    return {
      error:
        counter === 'sealed'
          ? 'The sealed counter does not stock that plate.'
          : 'The night counter does not stock that plate.',
    };
  }
  const owned = shopOwnedCount(p, id, counter);
  const limit = shopCopyLimit(card);
  if (owned >= limit) {
    return {
      error: limit === 1 ? 'You already keep that leader.' : 'Three copies is the shelf.',
    };
  }
  const price = SHOP_PRICES[card.rarity];
  if (p.alchemicalShards < price) {
    return { error: `${card.name} asks ${price} shards.` };
  }
  return {
    card,
    profile: {
      ...p,
      alchemicalShards: p.alchemicalShards - price,
      collection: [...p.collection, card.id],
    },
  };
}

export function awardShards(
  p: Profile,
  mode: keyof ShardRewards,
  won: boolean,
): Profile {
  const table = SHARD_REWARDS[mode];
  const gain = won ? table.win : table.loss;
  if (gain <= 0) return p;
  return { ...p, alchemicalShards: p.alchemicalShards + gain };
}

export function exportLedger(p: Profile): string {
  return JSON.stringify(p, null, 2);
}

export function importLedger(json: string): { error: string } | { profile: Profile } {
  try {
    const raw = JSON.parse(json);
    return { profile: migrateProfile(raw) };
  } catch {
    return { error: 'That ledger could not be read.' };
  }
}


/**
 * Seth Kern answers a code (secret hand-drop) — never a collectible or
 * working plate. Strip any leaked copies from collection / workings.
 */
export function applySethKernUnlock(p: Profile): Profile {
  return stripAftermathId(p, 'seth_kern');
}

/**
 * Justin Kern answers a code (secret hand-drop) — never a collectible or
 * working plate. Strip any leaked copies from collection / workings.
 */
export function applyJustinKernUnlock(p: Profile): Profile {
  return stripAftermathId(p, 'justin_kern');
}

/**
 * South Haven Dispatch is a secret hand-drop only (siren + reveal + pending /
 * mid-match inject). Never a collectible or working plate — strip leaks.
 */
export function applySouthHavenDispatchUnlock(p: Profile): Profile {
  return stripAftermathId(p, 'south_haven_dispatch');
}

/**
 * Strip a non-collectible id (nuke aftermath or secret hand-drop) from
 * collection / workings. Never owned deck plates.
 */
function stripAftermathId(p: Profile, id: string): Profile {
  const collection = p.collection.filter((x) => x !== id);
  const customDecks = p.customDecks.map((d) => ({
    ...d,
    cards: d.cards.filter((x) => x !== id),
  }));
  const secondCards = p.secondCards
    ? p.secondCards.filter((x) => x !== id)
    : null;
  const oldCards = p.oldCards ? p.oldCards.filter((x) => x !== id) : null;
  const oldDecks = p.oldDecks.map((d) => ({
    ...d,
    cards: d.cards.filter((x) => x !== id),
  }));
  if (
    collection.length === p.collection.length &&
    customDecks.every((d, i) => d.cards.length === p.customDecks[i]!.cards.length) &&
    oldDecks.every((d, i) => d.cards.length === p.oldDecks[i]!.cards.length) &&
    (secondCards?.length ?? 0) === (p.secondCards?.length ?? 0) &&
    (oldCards?.length ?? 0) === (p.oldCards?.length ?? 0)
  ) {
    return p;
  }
  return { ...p, collection, customDecks, secondCards, oldCards, oldDecks };
}

/** Ensure radiation_poisoning is not a collectible plate. */
export function applyRadiationPoisoningUnlock(p: Profile): Profile {
  return stripAftermathId(p, 'radiation_poisoning');
}

/** Ensure nuclear_winter is not a collectible plate. */
export function applyNuclearWinterUnlock(p: Profile): Profile {
  return stripAftermathId(p, 'nuclear_winter');
}

/**
 * Post-nuke profile pass: strip Radiation Poisoning / Nuclear Winter from
 * collection and workings. TarotPop still reveals them in-battle; they are
 * never owned deck plates.
 */
export function applyNukeAftermathUnlocks(p: Profile): Profile {
  return applyNuclearWinterUnlock(applyRadiationPoisoningUnlock(p));
}

/** Strip both nuke-aftermath rites from any profile surface. */
export function stripNukeAftermathPlates(p: Profile): Profile {
  return applyNukeAftermathUnlocks(p);
}


/** Chance a lost match grants Black Monday into collection / working. */
export const BLACK_MONDAY_CHANCE = 0.3;

export type BlackMondayInjectOpts = {
  rand?: () => number;
  /** Prefer this custom deck id (match working) when inserting a copy. */
  deckId?: string;
};

/**
 * After a local-player loss: ~30% chance to grant Black Monday into the
 * collection and insert one copy into a custom working (prefer match deck)
 * if there is room (<40) and fewer than 3 copies already.
 */
export function applyBlackMondayLossInject(
  p: Profile,
  opts: BlackMondayInjectOpts = {},
): { profile: Profile; injected: boolean } {
  const rand = opts.rand ?? Math.random;
  if (rand() >= BLACK_MONDAY_CHANCE) {
    return { profile: p, injected: false };
  }
  const id = BLACK_MONDAY_ID;
  const card = cardById(id);
  if (!card) return { profile: p, injected: false };

  let collection = p.collection;
  let changed = false;
  if (!collection.includes(id)) {
    collection = [...collection, id];
    changed = true;
  }

  const canInsert = (d: CustomDeck): boolean => {
    if (d.cards.length >= 40) return false;
    const n = d.cards.filter((c) => c === id).length;
    if (n >= 3) return false;
    const hero = CARDS.find((c) => c.id === d.heroId);
    if (!hero || hero.kind !== 'hero') return false;
    return isLegalForOrder(hero.faction, card.faction);
  };

  let customDecks = p.customDecks;
  const preferred =
    opts.deckId != null
      ? customDecks.find((d) => d.id === opts.deckId)
      : undefined;
  const target =
    (preferred && canInsert(preferred) ? preferred : undefined) ??
    customDecks.find(canInsert);

  if (target) {
    customDecks = customDecks.map((d) =>
      d.id === target.id ? { ...d, cards: [...d.cards, id] } : d,
    );
    changed = true;
  }

  if (!changed) return { profile: p, injected: false };
  return { profile: { ...p, collection, customDecks }, injected: true };
}

/* ── Era workings (shared by the deck editor, the counters, and App) ── */

export type DeckEra = 'first' | 'second' | 'old';

export function eraOrder(profile: Profile, era: DeckEra): string | null {
  if (era === 'second') return profile.secondOrder;
  if (era === 'old') return profile.oldOrder;
  return profile.allegiance;
}

/** Copies a player may seat in an era working: the collection, plus the oath's own working for the later hours. */
export function ownedForEra(profile: Profile, era: DeckEra): Record<string, number> {
  const owned = countOwned(profile.collection);
  const order = eraOrder(profile, era);
  if (era === 'first' || !order) return owned;
  const gift = countOwned(buildOrderAllyWorkingIds(order, 30));
  const out = { ...owned };
  for (const [id, n] of Object.entries(gift)) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Sealed Century workings whose leader may sit for `order` (shelf order kept). */
export function oldDecksForOrder(profile: Profile, order: string | null = profile.oldOrder): CustomDeck[] {
  if (!order) return [];
  return profile.oldDecks.filter((d) => {
    const hero = cardById(d.heroId);
    return !!hero && hero.kind === 'hero' && isLegalForOrder(order, hero.faction);
  });
}

/** Save a working for an era: it goes to the front of that era's shelf and onto the field. */
export function saveEraDeck(p: Profile, deck: CustomDeck, era: DeckEra): Profile {
  const copy: CustomDeck = { ...deck, cards: [...deck.cards] };
  if (era === 'second') {
    return { ...p, secondHero: copy.heroId, secondCards: [...copy.cards] };
  }
  if (era === 'old') {
    return {
      ...p,
      oldHero: copy.heroId,
      oldCards: [...copy.cards],
      oldDecks: [copy, ...p.oldDecks.filter((d) => d.id !== copy.id)],
    };
  }
  return { ...p, customDecks: [copy, ...p.customDecks.filter((d) => d.id !== copy.id)] };
}

/** Drop a sealed working from an era shelf; the next one takes the field. */
export function deleteEraDeck(p: Profile, id: string, era: DeckEra): Profile {
  if (era === 'old') {
    const wasField = oldDecksForOrder(p)[0]?.id === id;
    const next = { ...p, oldDecks: p.oldDecks.filter((d) => d.id !== id) };
    const field = wasField ? oldDecksForOrder(next)[0] : undefined;
    return field ? { ...next, oldHero: field.heroId, oldCards: [...field.cards] } : next;
  }
  if (era === 'first') return { ...p, customDecks: p.customDecks.filter((d) => d.id !== id) };
  return p;
}

/** What the Sealed Century field takes for the sworn player: the saved working. */
export function sealedCenturyLoadout(p: Profile): { heroId?: string; deckIds?: string[] } {
  return { heroId: p.oldHero ?? undefined, deckIds: p.oldCards ? [...p.oldCards] : undefined };
}

export { FIRST_HOUR_ORDERS };
