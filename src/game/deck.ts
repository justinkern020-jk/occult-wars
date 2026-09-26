/** Auto-built workings + deck legality (order+ally, 30–40, max 3). */

import { CARDS } from '../data/catalog';
import type { Card } from './types';
import { HAND_CAP } from './scoring';
import { allyOf, isLegalForOrder } from './orders';

/** Grok Oe(): cycle faction non-hero cards up to 3 copies until 30. */
export function buildWorkingIds(faction: string, size = 30): string[] {
  const pool = CARDS.filter(
    (c) =>
      c.faction === faction &&
      c.kind !== 'hero' &&
      !c.keywords.includes('cryptid'),
  );
  if (pool.length === 0) {
    const units = CARDS.filter((c) => c.kind === 'unit' && c.power != null);
    const ids: string[] = [];
    for (let pass = 0; pass < 3 && ids.length < size; pass++) {
      for (const u of units) {
        if (ids.length >= size) break;
        ids.push(u.id);
      }
    }
    return ids;
  }
  const ids: string[] = [];
  for (let pass = 0; pass < 3 && ids.length < size; pass++) {
    for (const c of pool) {
      if (ids.length >= size) break;
      ids.push(c.id);
    }
  }
  return ids;
}

/** Build 30 from order then ally fill. */
export function buildOrderAllyWorkingIds(order: string, size = 30): string[] {
  const ids = buildWorkingIds(order, size);
  if (ids.length >= size) return ids.slice(0, size);
  const ally = allyOf(order);
  if (!ally) return ids;
  for (const id of buildWorkingIds(ally, size)) {
    if (ids.length >= size) break;
    ids.push(id);
  }
  return ids.slice(0, size);
}

export function cardsFromIds(ids: string[]): Card[] {
  const byId = new Map(CARDS.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is Card => !!c);
}

export function shuffleInPlace<T>(arr: T[], rand = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildShuffledWorking(faction: string): Card[] {
  return shuffleInPlace(cardsFromIds(buildWorkingIds(faction)));
}

export function buildShuffledOrderWorking(order: string): Card[] {
  return shuffleInPlace(cardsFromIds(buildOrderAllyWorkingIds(order)));
}

export function drawFromDeck(
  deck: Card[],
  hand: Card[],
  n: number,
  handCap = HAND_CAP,
): { deck: Card[]; hand: Card[]; drawn: number; sealed: boolean } {
  const nextDeck = [...deck];
  const nextHand = [...hand];
  let drawn = 0;
  let sealed = false;
  for (let i = 0; i < n; i++) {
    if (nextHand.length >= handCap) {
      sealed = true;
      break;
    }
    const card = nextDeck.shift();
    if (!card) break;
    nextHand.push(card);
    drawn += 1;
  }
  return { deck: nextDeck, hand: nextHand, drawn, sealed };
}

export function heroForFaction(faction: string): Card | undefined {
  return CARDS.find((c) => c.kind === 'hero' && c.faction === faction);
}

export function legalCardForHero(heroId: string, card: Card): boolean {
  const hero = CARDS.find((c) => c.id === heroId);
  if (!hero || hero.kind !== 'hero') return false;
  if (card.kind === 'hero') return false;
  return isLegalForOrder(hero.faction, card.faction);
}

export function validateDeck(
  heroId: string,
  cardIds: string[],
): { ok: true } | { ok: false; error: string } {
  const hero = CARDS.find((c) => c.id === heroId);
  if (!hero || hero.kind !== 'hero') {
    return { ok: false, error: 'A working needs one leader.' };
  }
  if (cardIds.length < 30 || cardIds.length > 40) {
    return { ok: false, error: 'A working needs 30–40 cards.' };
  }
  const counts: Record<string, number> = {};
  for (const id of cardIds) {
    const card = CARDS.find((c) => c.id === id);
    if (!card) return { ok: false, error: `Unknown plate: ${id}` };
    if (card.keywords.includes('cryptid')) {
      return {
        ok: false,
        error: `${card.name} is a Second Hour sighting — not a First Hour plate.`,
      };
    }
    if (!legalCardForHero(heroId, card)) {
      return {
        ok: false,
        error: `${card.name} is not of ${hero.faction} or its ally.`,
      };
    }
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id] > 3) {
      return { ok: false, error: `At most 3 copies of ${card.name}.` };
    }
  }
  return { ok: true };
}
