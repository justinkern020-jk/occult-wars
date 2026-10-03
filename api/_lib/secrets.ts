/**
 * Secrets uncovered: which hidden codes each player has found (one entry per
 * hand mark per secret, first find kept). The owner never counts. Public
 * counts for the battle count; names and dates for the owner's Portal only.
 */
import { toRecord, type Store } from './store.js';

export const SECRET_IDS = ['second', 'seth', 'justin', 'athens', 'southhaven', 'battlecount'] as const;
export type SecretId = (typeof SECRET_IDS)[number];

const K = { found: (id: string) => `ow:sec:${id}` };

export function isSecretId(v: unknown): v is SecretId {
  return typeof v === 'string' && (SECRET_IDS as readonly string[]).includes(v);
}

function cleanName(raw: unknown): string {
  const n = (typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return /^[\p{L}\p{N} ._'-]*$/u.test(n) ? n : '';
}

/** A first find for this hand (true) or one already counted (false). */
export async function recordFound(
  store: Store,
  secret: SecretId,
  mark: string,
  name: unknown,
  account: string | null,
  now: number,
): Promise<boolean> {
  const entry = JSON.stringify({ name: cleanName(name), account: account ?? null, at: now });
  const [n] = await store.pipe([['HSETNX', K.found(secret), mark, entry]]);
  return Number(n) === 1;
}

export async function secretCounts(store: Store): Promise<Record<SecretId, number>> {
  const res = await store.pipe(SECRET_IDS.map((id) => ['HLEN', K.found(id)]));
  const out = {} as Record<SecretId, number>;
  SECRET_IDS.forEach((id, i) => {
    out[id] = Math.max(0, Number(res[i]) || 0);
  });
  return out;
}

export type FinderRow = { name: string; account: string | null; at: number };

/** Owner only: who found each secret, earliest first (marks never leave the server). */
export async function secretFinders(store: Store, cap = 500): Promise<Record<SecretId, FinderRow[]>> {
  const res = await store.pipe(SECRET_IDS.map((id) => ['HGETALL', K.found(id)]));
  const out = {} as Record<SecretId, FinderRow[]>;
  SECRET_IDS.forEach((id, i) => {
    const values = Object.values(toRecord(res[i]));
    const rows: FinderRow[] = [];
    for (const v of values) {
      try {
        const e = JSON.parse(v) as { name?: unknown; account?: unknown; at?: unknown };
        rows.push({
          name: typeof e.name === 'string' && e.name ? e.name : '(no name)',
          account: typeof e.account === 'string' ? e.account : null,
          at: Number(e.at) || 0,
        });
      } catch {
        /* skip */
      }
    }
    rows.sort((a, b) => a.at - b.at);
    out[id] = rows.slice(0, cap);
  });
  return out;
}
