/** Profile persistence: occult-wars.profile.v1 */

import { CARDS } from '../data/catalog';
import type { Card } from './types';
import {
  FIRST_HOUR_ORDERS,
  allyOf,
  isFirstHourOrder,
  isLegalForOrder,
  normalizeFaction,
  type FirstHourOrder,
} from './orders';
import { buildWorkingIds } from './deck';

export const PROFILE_KEY = 'occult-wars.profile.v1';
export const PACK_COST = 150;
export const START_SHARDS = 500;
export const DAILY_PURSE = 1000;

export type ShardRewards = {
  training: { win: number; loss: number };
  pvp: { win: number; loss: number };
  hotseat: { win: number; loss: number };
  campaign: { win: number; loss: number };
};

export const SHARD_REWARDS: ShardRewards = {
  training: { win: 50, loss: 15 },
  pvp: { win: 100, loss: 30 },
  hotseat: { win: 0, loss: 0 },
  campaign: { win: 40, loss: 10 },
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

export function migrateProfile(raw: Partial<Profile> & Record<string, unknown>): Profile {
  const base = defaultProfile();
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
      ? raw.collection.filter((id): id is string => typeof id === 'string')
      : [],
    customDecks: Array.isArray(raw.customDecks)
      ? (raw.customDecks as CustomDeck[])
          .filter((d) => d && typeof d.id === 'string')
          .map((d) => ({
            id: d.id,
            name: String(d.name ?? 'Untitled working').slice(0, 32),
            heroId: String(d.heroId ?? ''),
            cards: Array.isArray(d.cards)
              ? d.cards.filter((c): c is string => typeof c === 'string')
              : [],
          }))
      : [],
    seenPrimer: !!raw.seenPrimer && raw.primerVersion === 3,
    primerVersion: 3,
    allegiance,
    lastDaily:
      typeof raw.lastDaily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDaily)
        ? raw.lastDaily
        : null,
    campaign: (raw.campaign as CampaignProgress) ?? null,
    secondOrder: typeof raw.secondOrder === 'string' ? raw.secondOrder : null,
    secondHero: typeof raw.secondHero === 'string' ? raw.secondHero : null,
    secondCards: Array.isArray(raw.secondCards)
      ? raw.secondCards.filter((c): c is string => typeof c === 'string')
      : null,
  };
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
    if (!isLegalForOrder(hero.faction, card.faction)) return false;
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > 3) return false;
  }
  return true;
}

/** Pack pool: non-hero, non-cryptid; first 3 pulls bias to order+ally. */
export function packPool(order: string | null, biasOrder: boolean): Card[] {
  return CARDS.filter((c) => {
    if (c.kind === 'hero') return false;
    if (c.keywords.includes('cryptid')) return false;
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

export { FIRST_HOUR_ORDERS };
