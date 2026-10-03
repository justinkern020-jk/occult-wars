/**
 * The table: who is playing now, the one open challenge, and the countries
 * that have checked in. Ported from grok.me's server functions (heartbeat /
 * issue / accept / cancel) onto a Redis-shaped store.
 */
import { toRecord, type Store } from './store.js';

export const SEEN_WINDOW_MS = 35_000;
export const CHALLENGE_MS = 60_000;
const TAKEN_SEC = 180;

const K = {
  seen: 'ow:t:seen',
  country: 'ow:t:cc',
  checked: 'ow:t:checked',
  checkins: 'ow:t:checkins',
  challenge: 'ow:t:challenge',
  taken: (room: string) => `ow:t:taken:${room}`,
};

export const MARK_RE = /^[a-z0-9]{16}$/;
export const ROOM_RE = /^[A-Z]{4}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

export type ChallengeView = { room: string; mine: boolean; left: number };
export type TableView = {
  ok: true;
  store: Store['kind'];
  playing: number;
  you: string | null;
  others: string[];
  challenge: ChallengeView | null;
  checkins: { country: string; n: number }[];
  /** Newest Occultist Meeting message id (for the unread dot). */
  meet: number;
};

type Challenge = { room: string; mark: string; at: number };

export function cleanCountry(raw: unknown): string | null {
  const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!COUNTRY_RE.test(c) || c === 'XX' || c === 'T1') return null;
  return c;
}

function parseChallenge(raw: unknown): Challenge | null {
  if (typeof raw !== 'string') return null;
  try {
    const c = JSON.parse(raw) as Challenge;
    if (c && ROOM_RE.test(c.room) && MARK_RE.test(c.mark) && Number.isFinite(c.at)) return c;
  } catch {
    /* ignore */
  }
  return null;
}

function viewChallenge(c: Challenge | null, mark: string, now: number): ChallengeView | null {
  if (!c) return null;
  const left = c.at + CHALLENGE_MS - now;
  if (left <= 0) return null;
  return { room: c.room, mine: c.mark === mark, left };
}

/** Heartbeat: mark this hand seated, then read the table. */
export async function beat(
  store: Store,
  mark: string,
  country: string | null,
  now: number,
): Promise<TableView> {
  const cutoff = now - SEEN_WINDOW_MS;
  const head = await store.pipe([
    ['ZRANGEBYSCORE', K.seen, '-inf', `(${cutoff}`],
    ['ZREMRANGEBYSCORE', K.seen, '-inf', `(${cutoff}`],
    ['ZADD', K.seen, now, mark],
    ...(country ? [['HSET', K.country, mark, country] as (string | number)[]] : []),
    ...(country ? [['HSETNX', K.checked, mark, country] as (string | number)[]] : []),
    ['ZRANGEBYSCORE', K.seen, cutoff, '+inf'],
    ['GET', K.challenge],
  ]);
  const stale = (head[0] as string[]) ?? [];
  const firstCheckIn = country ? Number(head[4]) === 1 : false;
  const seated = ((country ? head[5] : head[3]) as string[]) ?? [];
  const challengeRaw = country ? head[6] : head[4];

  const tail: (string | number)[][] = [];
  if (stale.length) tail.push(['HDEL', K.country, ...stale]);
  if (firstCheckIn && country) tail.push(['HINCRBY', K.checkins, country, 1]);
  const others = seated.filter((m) => m !== mark).slice(0, 200);
  tail.push(['HMGET', K.country, mark, ...others]);
  tail.push(['HGETALL', K.checkins]);
  tail.push(['GET', 'ow:meet:n']);
  const res = await store.pipe(tail);
  const countries = (res[res.length - 3] as (string | null)[]) ?? [];
  const tally = toRecord(res[res.length - 2]);
  const meet = Number(res[res.length - 1]) || 0;

  return {
    ok: true,
    store: store.kind,
    playing: Math.max(1, seated.length),
    you: countries[0] ?? country ?? null,
    others: countries.slice(1).filter((c): c is string => !!c),
    challenge: viewChallenge(parseChallenge(challengeRaw), mark, now),
    checkins: Object.entries(tally)
      .map(([c, n]) => ({ country: c, n: Number(n) }))
      .filter((r) => COUNTRY_RE.test(r.country) && r.n > 0)
      .sort((a, b) => b.n - a.n || a.country.localeCompare(b.country)),
    meet,
  };
}

/** Post the one open challenge. False when another is already out. */
export async function issue(store: Store, mark: string, room: string, now: number) {
  const body = JSON.stringify({ room, mark, at: now } satisfies Challenge);
  const [res] = await store.pipe([
    ['SET', K.challenge, body, 'PX', CHALLENGE_MS, 'NX'],
  ]);
  return { ok: res === 'OK' };
}

/** First hand to answer sits down; the challenge leaves the table. */
export async function accept(store: Store, mark: string, room: string, now: number) {
  const [raw] = await store.pipe([['GET', K.challenge]]);
  const c = parseChallenge(raw);
  if (!c || c.room !== room || c.mark === mark || c.at + CHALLENGE_MS <= now) {
    return { ok: false };
  }
  const [taken] = await store.pipe([['SET', K.taken(room), mark, 'EX', TAKEN_SEC, 'NX']]);
  if (taken !== 'OK') return { ok: false };
  const [again] = await store.pipe([['GET', K.challenge]]);
  if (parseChallenge(again)?.room === room) await store.pipe([['DEL', K.challenge]]);
  return { ok: true };
}

/** Call off your own challenge. */
export async function cancel(store: Store, mark: string) {
  const [raw] = await store.pipe([['GET', K.challenge]]);
  const c = parseChallenge(raw);
  if (c && c.mark === mark) await store.pipe([['DEL', K.challenge]]);
  return { ok: true };
}
