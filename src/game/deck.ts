/** Auto-built training workings (default Wardens / Parish). */

import { CARDS } from '../data/catalog';
import type { Card } from './types';
import { HAND_CAP } from './scoring';

/** Grok Oe(): cycle faction non-hero cards up to 3 copies until 30. */
export function buildWorkingIds(faction: string, size = 30): string[] {
  const pool = CARDS.filter(
    (c) => c.faction === faction && c.kind !== 'hero',
  );
  if (pool.length === 0) {
    // Fallback: any units with power
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
