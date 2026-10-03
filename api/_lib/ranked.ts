/**
 * The ranked ladder for live tables (Friend Working: room code and quick
 * match). Ten Golden Dawn grades, Initiate to Magus, three divisions each;
 * points per settled win and loss; a fresh season each calendar month (UTC).
 *
 * A result only counts when BOTH seated hands report the same sitting and
 * agree on who won. Each hand must first 'begin' the sitting's room nonce;
 * a nonce holds two hands at most; a sitting must run a minimum time; and one
 * pair of hands can only move each other's rank a few times a day.
 */
import type { Store } from './store.js';
import type { User } from './accounts.js';

export const WIN_PTS = 25;
export const LOSS_PTS = 15;
export const DIV_PTS = 100;
export const GRADES = [
  'Initiate',
  'Neophyte',
  'Zelator',
  'Theoricus',
  'Practicus',
  'Philosophus',
  'Adeptus Minor',
  'Adeptus Major',
  'Adeptus Exemptus',
  'Magus',
] as const;
/** Shortest believable sitting (ms) from begin, and between two settled sittings. */
export const MIN_SITTING_MS = 75_000;
/** Settled results one pair of hands may trade per day. */
export const PAIR_DAILY_CAP = 6;
export const BOARD_SIZE = 50;
const DAY_SEC = 86_400;

export class RankedError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function seasonOf(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function rankFor(pts: number): { grade: string; div: number | null; label: string; into: number } {
  const p = Math.max(0, Math.floor(pts));
  const gi = Math.min(GRADES.length - 1, Math.floor(p / (DIV_PTS * 3)));
  if (gi === GRADES.length - 1) return { grade: 'Magus', div: null, label: 'Magus', into: p - gi * DIV_PTS * 3 };
  const within = p - gi * DIV_PTS * 3;
  const div = 3 - Math.floor(within / DIV_PTS);
  const roman = ['', 'I', 'II', 'III'][div];
  return { grade: GRADES[gi], div, label: `${GRADES[gi]} ${roman}`, into: within % DIV_PTS };
}

export type LadderRow = { name: string; pts: number; w: number; l: number; rank: string };

export const RK = {
  board: (s: string) => `ow:rk:${s}`,
  rows: (s: string) => `ow:rk:${s}:u`,
  sit: (nonce: string) => `ow:rk:sit:${nonce}`,
  match: (nonce: string, n: number) => `ow:rk:m:${nonce}:${n}`,
  pair: (day: string, a: string, b: string) => `ow:rk:pair:${day}:${[a, b].sort().join(':')}`,
};

const NONCE_RE = /^[a-z0-9]{8,32}$/;

export function cleanNonce(raw: unknown): string {
  if (typeof raw !== 'string' || !NONCE_RE.test(raw)) throw new RankedError(400, 'Bad sitting.');
  return raw;
}
export function cleanSitting(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 500) throw new RankedError(400, 'Bad sitting number.');
  return n;
}

function nameOf(u: User): string {
  return (u.username || u.displayName || 'Occultist').slice(0, 24);
}

function parseRow(raw: unknown): { name: string; pts: number; w: number; l: number } | null {
  if (typeof raw !== 'string') return null;
  try {
    const r = JSON.parse(raw) as { name: string; pts: number; w: number; l: number };
    return { name: String(r.name ?? ''), pts: Number(r.pts) || 0, w: Number(r.w) || 0, l: Number(r.l) || 0 };
  } catch {
    return null;
  }
}

/** A hand sits down at a room: remember who and when (two hands at most). */
export async function beginSitting(store: Store, user: User, nonce: string, now: number): Promise<void> {
  const k = RK.sit(nonce);
  const [all] = await store.pipe([['HGETALL', k]]);
  const seated = Object.keys(toFlat(all)).filter((f) => f.startsWith('u:'));
  if (!seated.includes(`u:${user.id}`) && seated.length >= 2) throw new RankedError(409, 'That table is full.');
  await store.pipe([
    ['HSETNX', k, `u:${user.id}`, String(now)],
    ['HSETNX', k, 'begin', String(now)],
    ['EXPIRE', k, DAY_SEC],
  ]);
}

export type ReportResult = { settled: boolean; waiting?: boolean; reason?: string; me?: LadderRow };

/** One hand reports a finished sitting; the second agreeing report settles it. */
export async function reportSitting(
  store: Store,
  user: User,
  input: { nonce: string; sitting: number; won: boolean },
  now: number,
): Promise<ReportResult> {
  const sk = RK.sit(input.nonce);
  const [seatedAt, begin, last] = await store.pipe([
    ['HGET', sk, `u:${user.id}`],
    ['HGET', sk, 'begin'],
    ['HGET', sk, 'last'],
  ]);
  if (seatedAt == null) throw new RankedError(403, 'That sitting is not yours.');
  const mk = RK.match(input.nonce, input.sitting);
  await store.pipe([
    ['HSETNX', mk, `r:${user.id}`, input.won ? '1' : '0'],
    ['HSETNX', mk, 'first', String(now)],
    ['EXPIRE', mk, DAY_SEC],
  ]);
  const [all] = await store.pipe([['HGETALL', mk]]);
  const h = toFlat(all);
  if (h.settled) return { settled: h.settled === '1', reason: h.settled === '1' ? undefined : h.settled };
  const reports = Object.entries(h)
    .filter(([f]) => f.startsWith('r:'))
    .map(([f, v]) => ({ id: f.slice(2), won: v === '1' }));
  if (reports.length < 2) return { settled: false, waiting: true };
  const settle = async (why: string) => {
    await store.pipe([['HSET', mk, 'settled', why]]);
    return { settled: false, reason: why };
  };
  if (reports.length > 2) return settle('crowded');
  const [a, b] = reports;
  if (a.id === b.id) return settle('one hand');
  if (a.won === b.won) return settle('disputed');
  const since = Number(last ?? begin ?? now);
  if (now - Number(begin ?? now) < MIN_SITTING_MS || now - since < MIN_SITTING_MS) return settle('too quick');
  const [claim] = await store.pipe([['HSETNX', mk, 'settled', '1']]);
  if (Number(claim) !== 1) return { settled: false, reason: 'already' };
  const day = new Date(now).toISOString().slice(0, 10);
  const pk = RK.pair(day, a.id, b.id);
  const [n] = await store.pipe([['INCR', pk], ['EXPIRE', pk, DAY_SEC * 2]]);
  await store.pipe([['HSET', sk, 'last', String(now)]]);
  if (Number(n) > PAIR_DAILY_CAP) {
    await store.pipe([['HSET', mk, 'settled', 'pair cap']]);
    return { settled: false, reason: 'pair cap' };
  }
  const winner = a.won ? a.id : b.id;
  const loser = a.won ? b.id : a.id;
  const season = seasonOf(now);
  await applyResult(store, season, winner, true, user.id === winner ? nameOf(user) : null);
  await applyResult(store, season, loser, false, user.id === loser ? nameOf(user) : null);
  return { settled: true, me: await readMine(store, user, now) };
}

async function applyResult(store: Store, season: string, id: string, won: boolean, name: string | null) {
  const [raw] = await store.pipe([['HGET', RK.rows(season), id]]);
  const row = parseRow(raw) ?? { name: name ?? 'Occultist', pts: 0, w: 0, l: 0 };
  if (name) row.name = name;
  if (!name && !raw) {
    // The other hand's name: read from their account record if we can.
    const [u] = await store.pipe([['GET', `ow:u:${id}`]]);
    try {
      const parsed = typeof u === 'string' ? (JSON.parse(u) as User) : null;
      if (parsed) row.name = nameOf(parsed);
    } catch {
      /* keep */
    }
  }
  if (won) {
    row.pts += WIN_PTS;
    row.w += 1;
  } else {
    // Never below the floor of the division held (and never below zero).
    const floor = Math.floor(row.pts / DIV_PTS) * DIV_PTS;
    row.pts = Math.max(floor, row.pts - LOSS_PTS);
    row.l += 1;
  }
  await store.pipe([
    ['HSET', RK.rows(season), id, JSON.stringify(row)],
    ['ZADD', RK.board(season), row.pts * 10_000 + Math.min(9_999, row.w), id],
    ['EXPIRE', RK.rows(season), DAY_SEC * 120],
    ['EXPIRE', RK.board(season), DAY_SEC * 120],
  ]);
}

export async function readBoard(store: Store, now: number): Promise<{ season: string; rows: LadderRow[] }> {
  const season = seasonOf(now);
  const [ids] = await store.pipe([['ZREVRANGE', RK.board(season), 0, BOARD_SIZE - 1]]);
  const list = ((ids as string[]) ?? []).map(String);
  if (!list.length) return { season, rows: [] };
  const [raws] = await store.pipe([['HMGET', RK.rows(season), ...list]]);
  const rows: LadderRow[] = [];
  for (const raw of (raws as unknown[]) ?? []) {
    const r = parseRow(raw);
    if (r) rows.push({ ...r, rank: rankFor(r.pts).label });
  }
  rows.sort((x, y) => y.pts - x.pts || y.w - x.w);
  return { season, rows };
}

export async function readMine(store: Store, user: User, now: number): Promise<LadderRow> {
  const season = seasonOf(now);
  const [raw] = await store.pipe([['HGET', RK.rows(season), user.id]]);
  const r = parseRow(raw) ?? { name: nameOf(user), pts: 0, w: 0, l: 0 };
  return { ...r, rank: rankFor(r.pts).label };
}

function toFlat(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  }
  return {};
}
