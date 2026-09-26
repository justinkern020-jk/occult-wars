/** Cryptid sighting cadence — every 15th match visit (localStorage), like grok.me. */

import { CARDS } from '../data/catalog';
import type { Card } from './types';
import {
  isFirstHourOrder,
  isSecondHourSociety,
} from './orders';

export type Era = 'first' | 'second';

const VISIT_KEYS: Record<Era, string> = {
  first: 'occult-wars.visits',
  second: 'the-second-hour.visits',
};

/** Increment era visit counter; return true on every 15th visit. */
export function recordMatchVisit(era: Era): boolean {
  if (typeof localStorage === 'undefined') return false;
  const key = VISIT_KEYS[era];
  const raw = Number(localStorage.getItem(key) ?? '0') + 1;
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  localStorage.setItem(key, String(n));
  return n % 15 === 0;
}

export function readVisitCount(era: Era): number {
  if (typeof localStorage === 'undefined') return 0;
  const n = Number(localStorage.getItem(VISIT_KEYS[era]) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Test helper: set visits so the *next* recordMatchVisit is a sighting. */
export function setVisitsForNextSighting(era: Era): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VISIT_KEYS[era], '14');
}

/**
 * Sighting pools by era.
 * First Hour: order cryptids (Mothman, Foo Fighter, …) — rare hand drops only.
 * Second Hour: society cryptids — only on Second Hour matches.
 * Never treated as ordinary deck plates.
 */
function cryptidsInEra(era: Era): Card[] {
  return CARDS.filter((c) => {
    if (!c.keywords.includes('cryptid')) return false;
    if (era === 'second') return isSecondHourSociety(c.faction);
    return isFirstHourOrder(c.faction);
  });
}

/** Faction cryptid pool for a side; falls back to any era cryptid. */
export function cryptidPoolFor(faction: string, era: Era): Card[] {
  const eraPool = cryptidsInEra(era);
  const byFaction = eraPool.filter((c) => c.faction === faction);
  if (byFaction.length > 0) return byFaction;
  return eraPool;
}

export function pickCryptid(
  faction: string,
  era: Era,
  rand = Math.random,
): Card | null {
  const pool = cryptidPoolFor(faction, era);
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)] ?? null;
}

/** Schedule sighting on turn 2 or 3 (inclusive). */
export function rollVisitTurn(rand = Math.random): number {
  return 2 + Math.floor(rand() * 2);
}
