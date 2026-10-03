/**
 * The live-table ladder (client). Only Friend Working sittings between two
 * seated hands count; the server settles a sitting when both report it.
 */
import { useEffect, useState } from 'react';
import { seatHeaders } from './account';
import { rankFor } from '../../api/_lib/ranked';

export { rankFor };
export type LadderRow = { name: string; pts: number; w: number; l: number; rank: string };

const ENDPOINT = '/api/ranked';

async function get<T>(op: string): Promise<T> {
  const r = await fetch(`${ENDPOINT}?op=${op}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...seatHeaders() },
  });
  const d = (await r.json()) as T & { ok?: boolean; shut?: boolean; error?: string };
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error ?? 'The ladder could not be read.'), { shut: d.shut === true });
  return d;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...seatHeaders() },
    body: JSON.stringify(body),
    keepalive: true,
  });
  const d = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || d.ok === false) throw new Error(d.error ?? 'The ladder did not answer.');
  return d;
}

export function readLadder(): Promise<{ season: string; rows: LadderRow[] }> {
  return get('board');
}

let mine: LadderRow | null = null;
const listeners = new Set<(r: LadderRow | null) => void>();
function setMine(r: LadderRow | null) {
  mine = r;
  for (const l of listeners) l(r);
}

export async function refreshMyRank(): Promise<LadderRow | null> {
  try {
    const d = await get<{ me: LadderRow | null }>('me');
    setMine(d.me);
    return d.me;
  } catch {
    return mine;
  }
}

/** My rank this season (null when not seated or the ladder is shut). */
export function useMyRank(): LadderRow | null {
  const [r, setR] = useState(mine);
  useEffect(() => {
    listeners.add(setR);
    void refreshMyRank();
    return () => {
      listeners.delete(setR);
    };
  }, []);
  return r;
}

export function newSittingNonce(): string {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export function beginRanked(nonce: string): void {
  void post({ op: 'begin', nonce }).catch(() => undefined);
}

export async function reportRanked(nonce: string, sitting: number, won: boolean): Promise<{ settled: boolean; waiting?: boolean }> {
  return post({ op: 'report', nonce, sitting, won });
}

export function seasonLabel(season: string): string {
  const [y, m] = season.split('-').map(Number);
  const name = new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `${name} ${y}`;
}
