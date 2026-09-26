/**
 * Friend Working loadout exchange — each peer brings their Deck Editor working.
 */
import { CARDS, cardById } from '../data/catalog';
import {
  FIRST_HOUR_ORDERS,
  allyOf,
  isFirstHourOrder,
  normalizeFaction,
} from '../game/orders';
import type { CustomDeck } from '../game/profile';

export type FriendLoadout = {
  heroId?: string;
  cards: string[];
  faction?: string;
};

const KNOWN_IDS = new Set(CARDS.map((c) => c.id));

/** Filter unknown ids; drop non-hero heroId; infer faction from hero when missing. */
export function sanitizeFriendLoadout(raw: {
  heroId?: unknown;
  cards?: unknown;
  faction?: unknown;
}): FriendLoadout {
  const cards = Array.isArray(raw.cards)
    ? raw.cards.filter(
        (id): id is string => typeof id === 'string' && KNOWN_IDS.has(id),
      )
    : [];

  let heroId: string | undefined;
  if (typeof raw.heroId === 'string' && KNOWN_IDS.has(raw.heroId)) {
    const hero = cardById(raw.heroId);
    if (hero && hero.kind === 'hero') heroId = raw.heroId;
  }

  let faction: string | undefined;
  if (typeof raw.faction === 'string' && raw.faction.trim()) {
    faction = normalizeFaction(raw.faction.trim());
  }
  if (!faction && heroId) {
    faction = cardById(heroId)?.faction;
  }

  return { heroId, cards, faction };
}

/** Selected Deck Editor working + sworn order → wire payload. */
export function loadoutFromWorking(
  working: CustomDeck | undefined,
  allegiance: string | null | undefined,
): FriendLoadout {
  if (working && working.cards.length > 0) {
    return sanitizeFriendLoadout({
      heroId: working.heroId,
      cards: working.cards,
      faction: allegiance ?? cardById(working.heroId)?.faction,
    });
  }
  return sanitizeFriendLoadout({
    cards: [],
    faction: allegiance ?? undefined,
  });
}

/** Prefer a rival first-hour order (not self / not ally). */
export function rivalFaction(order: string): string {
  const pool = FIRST_HOUR_ORDERS.filter(
    (o) => o !== order && o !== allyOf(order),
  );
  return pool[0] ?? 'Order of the Lead Dawn';
}

export type ResolvedFriendMatch = {
  blueDeckIds: string[] | undefined;
  blueHeroId: string | undefined;
  blueFaction: string;
  redDeckIds: string[] | undefined;
  redHeroId: string | undefined;
  redFaction: string;
};

/**
 * Host = Azure (blue), guest = Crimson (red).
 * Custom cards used only when ≥30 known ids remain; else default faction working.
 */
export function resolveFriendMatchLoadouts(
  host: FriendLoadout,
  guest: FriendLoadout,
  hostAllegianceFallback: string,
): ResolvedFriendMatch {
  const blueFaction =
    host.faction && host.faction.length > 0
      ? host.faction
      : hostAllegianceFallback;
  const redFaction =
    guest.faction && guest.faction.length > 0
      ? guest.faction
      : rivalFaction(blueFaction);

  const blueDeckIds = host.cards.length >= 30 ? host.cards : undefined;
  const redDeckIds = guest.cards.length >= 30 ? guest.cards : undefined;

  let blueHeroId = host.heroId;
  if (blueHeroId) {
    const h = cardById(blueHeroId);
    if (!h || h.kind !== 'hero') blueHeroId = undefined;
  }

  let redHeroId = guest.heroId;
  if (redHeroId) {
    const h = cardById(redHeroId);
    if (!h || h.kind !== 'hero') redHeroId = undefined;
  }

  return {
    blueDeckIds,
    blueHeroId,
    blueFaction: isFirstHourOrder(blueFaction)
      ? blueFaction
      : hostAllegianceFallback,
    redDeckIds,
    redHeroId,
    redFaction,
  };
}
