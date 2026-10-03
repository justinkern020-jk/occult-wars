/**
 * Which Codex pages are open: a plate you own, or one you have met on the
 * field (seen on the board, in your hand, or cast onto a discard pile).
 * Cryptids only once sighted. Justin and Seth Kern never have a page.
 */
import { CARDS } from '../data/catalog';
import type { Card } from './types';
import type { Profile } from './profile';

/** Never a Codex page (code-only plates). */
export const CODEX_EXCLUDED = new Set(['justin_kern', 'seth_kern']);

export const CODEX_CARDS: readonly Card[] = CARDS.filter((c) => !CODEX_EXCLUDED.has(c.id));

export function isCryptid(c: Card): boolean {
  return c.keywords.includes('cryptid');
}

/** The page is open for this adept. */
export function codexOpen(p: Profile, c: Card, owned?: Set<string>): boolean {
  if (CODEX_EXCLUDED.has(c.id)) return false;
  const seen = p.codex ?? [];
  if (isCryptid(c)) {
    return seen.includes(c.id) || (p.ach?.sets.cryptids ?? []).includes(c.name);
  }
  return (owned ?? new Set(p.collection)).has(c.id) || seen.includes(c.id);
}

export function codexCount(p: Profile): number {
  const owned = new Set(p.collection);
  let n = 0;
  for (const c of CODEX_CARDS) if (codexOpen(p, c, owned)) n++;
  return n;
}

const KNOWN = new Set(CARDS.map((c) => c.id));

/** Fold plates met on the field into the Codex (excluded ids are dropped). */
export function noteEncounters(p: Profile, ids: string[]): Profile {
  const have = new Set(p.codex ?? []);
  let added = false;
  for (const id of ids) {
    if (!KNOWN.has(id) || CODEX_EXCLUDED.has(id) || have.has(id)) continue;
    have.add(id);
    added = true;
  }
  return added ? { ...p, codex: [...have] } : p;
}

export function migrateCodex(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && KNOWN.has(x) && !CODEX_EXCLUDED.has(x)))];
  return ids.length ? ids : undefined;
}
