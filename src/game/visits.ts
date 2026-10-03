/** Cryptid sighting cadence — every Nth match visit (localStorage), like grok.me. */

import { CARDS } from '../data/catalog';
import type { Card } from './types';
import {
  isFirstHourOrder,
  isSealedCenturyOrder,
  isSecondHourSociety,
} from './orders';

export type Era = 'first' | 'second' | 'old';

/** Matches between rare cryptid sightings (First Hour, Second Hour, Sealed Century). */
export const SIGHTING_EVERY = 15;

const VISIT_KEYS: Record<Era, string> = {
  first: 'occult-wars.visits',
  second: 'the-second-hour.visits',
  old: 'the-sealed-century.visits',
};

const GATE_KEYS: Record<Era, string> = {
  first: 'occult-wars.visit-gate',
  second: 'the-second-hour.visit-gate',
  old: 'the-sealed-century.visit-gate',
};

/** Ignore remounts within this window (React Strict Mode boots twice). */
const BOOT_DEDUPE_MS = 4000;

/**
 * Increment era visit counter; return true on every SIGHTING_EVERY-th visit.
 * Dedupes Rapid remounts so one Training start cannot burn two visits.
 */
export function recordMatchVisit(era: Era): boolean {
  if (typeof localStorage === 'undefined') return false;
  const now = Date.now();
  if (typeof sessionStorage !== 'undefined') {
    const gate = GATE_KEYS[era];
    const last = Number(sessionStorage.getItem(gate) ?? '0');
    if (Number.isFinite(last) && last > 0 && now - last < BOOT_DEDUPE_MS) {
      return false;
    }
    sessionStorage.setItem(gate, String(now));
  }
  const key = VISIT_KEYS[era];
  const raw = Number(localStorage.getItem(key) ?? '0') + 1;
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  localStorage.setItem(key, String(n));
  return n % SIGHTING_EVERY === 0;
}

export function readVisitCount(era: Era): number {
  if (typeof localStorage === 'undefined') return 0;
  const n = Number(localStorage.getItem(VISIT_KEYS[era]) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const PLAYED_KEYS: Record<Era, string> = {
  first: 'occult-wars.played',
  second: 'the-second-hour.played',
  old: 'the-sealed-century.played',
};

/** A finished match on this device (win or loss), by hour. */
export function recordMatchPlayed(era: Era): number {
  if (typeof localStorage === 'undefined') return 0;
  const n = readPlayedCount(era) + 1;
  try {
    localStorage.setItem(PLAYED_KEYS[era], String(n));
  } catch {
    /* private mode */
  }
  return n;
}

export function readPlayedCount(era: Era): number {
  if (typeof localStorage === 'undefined') return 0;
  const n = Number(localStorage.getItem(PLAYED_KEYS[era]) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Test helper: set visits so the *next* recordMatchVisit is a sighting. */
export function setVisitsForNextSighting(era: Era): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VISIT_KEYS[era], String(SIGHTING_EVERY - 1));
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(GATE_KEYS[era]);
  }
}

/**
 * Cryptid pools by era.
 * First Hour: order cryptids (Vril Wyrm, Foo Fighter, Mothman, …) as rare sightings.
 * Second Hour: society cryptids on Second Hour matches.
 * Sealed Century: order cryptids on Sealed Century matches.
 * Never ordinary deck plates.
 */
function cryptidsInEra(era: Era): Card[] {
  return CARDS.filter((c) => {
    if (!c.keywords.includes('cryptid')) return false;
    if (era === 'second') return isSecondHourSociety(c.faction);
    if (era === 'old') return isSealedCenturyOrder(c.faction);
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
