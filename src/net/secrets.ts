/**
 * Secrets uncovered — a hidden code found by this player is noted here (for
 * the hints) and once at the table (players who found each secret). The
 * owner's own finds never count: an owner key on this device is never sent
 * as a find, and the server also refuses the owner's seat.
 */
import { markSecretFound } from '../game/secretHints';
import {
  isAthensCode,
  isBattleCountCode,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSecondHourCode,
  isSethKernCode,
  isSouthHavenPdCode,
} from '../game/hourUnlock';
import { seatHeaders } from './account';
import { tableMark } from './table';
import { OWNER_KEY_STORAGE, watchCallOwner } from './watch';

export type SecretId = 'second' | 'seth' | 'justin' | 'athens' | 'southhaven' | 'battlecount';

export const SECRET_ORDER: SecretId[] = ['second', 'seth', 'justin', 'athens', 'southhaven', 'battlecount'];

export const SECRET_LABEL: Record<SecretId, string> = {
  second: 'Second Hour',
  seth: 'Seth Kern',
  justin: 'Justin Kern',
  athens: 'Athens, Ohio',
  southhaven: 'South Haven Dispatch',
  battlecount: 'The battle count',
};

/** Which secret a typed name answers, if any (read exactly as the name boxes read them). */
export function secretIdForCode(text: string): SecretId | null {
  if (isSecondHourCode(text)) return 'second';
  if (isBattleCountCode(text)) return 'battlecount';
  if (isAthensCode(text)) return 'athens';
  if (isOppenheimerCode(text) || isHiddenAdeptCode(text)) return 'justin';
  if (isSethKernCode(text)) return 'seth';
  if (isSouthHavenPdCode(text)) return 'southhaven';
  return null;
}

function ownerDevice(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY_STORAGE);
  } catch {
    return null;
  }
}

/** A hidden code answered for this player. */
export function reportSecretFound(secret: SecretId, name?: string): void {
  markSecretFound(secret);
  if (typeof fetch === 'undefined' || ownerDevice()) return;
  void fetch('/api/table', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...seatHeaders() },
    body: JSON.stringify({ op: 'found', mark: tableMark(), secret, name: (name ?? '').slice(0, 24) }),
  }).catch(() => undefined);
}

export type SecretCounts = Record<SecretId, number>;

function cleanCounts(raw: unknown): SecretCounts {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as SecretCounts;
  for (const id of SECRET_ORDER) out[id] = Math.max(0, Math.floor(Number(r[id]) || 0));
  return out;
}

/** Public: how many players have found each secret. */
export async function readSecretCounts(): Promise<SecretCounts | null> {
  try {
    const res = await fetch('/api/table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'secrets', mark: tableMark() }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok?: boolean; counts?: unknown };
    return j.ok ? cleanCounts(j.counts) : null;
  } catch {
    return null;
  }
}

export type FinderLine = { name: string; account: string | null; at: number };

/** Owner only: who found each secret. */
export async function readSecretFinders(): Promise<{ counts: SecretCounts; finders: Record<SecretId, FinderLine[]> } | null> {
  const r = await watchCallOwner<{ counts?: unknown; finders?: Record<string, FinderLine[]> }>({ op: 'secrets' });
  if (!r) return null;
  const finders = {} as Record<SecretId, FinderLine[]>;
  for (const id of SECRET_ORDER) finders[id] = Array.isArray(r.finders?.[id]) ? r.finders![id]! : [];
  return { counts: cleanCounts(r.counts), finders };
}
