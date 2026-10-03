/**
 * The table (ported from grok.me): a heartbeat to /api/table says this hand
 * is seated; the answer is who else is playing, where from, the one open
 * challenge, and the countries that have checked in.
 *
 * Challenges ride on Friend Working: the challenger hosts a 4-letter PeerJS
 * room and posts it here; whoever answers first joins that room. The match
 * itself is the same peer link as a room code, so it works across networks.
 */

export const MARK_KEY = 'occult-wars.mark';
export const BEAT_MS = 12_000;

/** Window events shared by PlayingNow, App and FriendWorking. */
export const TABLE_CHALLENGE_EVENT = 'occult-table-challenge';
export const CHALLENGE_POSTED_EVENT = 'occult-challenge-posted';
export const CHALLENGE_CLEARED_EVENT = 'occult-challenge-cleared';

export type TableChallengeDetail =
  | { action: 'issue'; room: string }
  | { action: 'accept'; room: string }
  | { action: 'cancel' };

export type ChallengeView = { room: string; mine: boolean; left: number };

export type TableView = {
  playing: number;
  you: string | null;
  others: string[];
  challenge: ChallengeView | null;
  checkins: { country: string; n: number }[];
  store: 'redis' | 'memory';
};

const MARK_RE = /^[a-z0-9]{16}$/;

/** A random per-device mark — no name, no account. */
export function tableMark(): string {
  if (typeof localStorage === 'undefined') return 'previewmark00000';
  try {
    const have = localStorage.getItem(MARK_KEY);
    if (have && MARK_RE.test(have)) return have;
    const fresh = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem(MARK_KEY, fresh);
    return fresh;
  } catch {
    return 'previewmark00000';
  }
}

export function parseTableView(raw: unknown): TableView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true || !Number.isFinite(r.playing)) return null;
  const ch = r.challenge as Record<string, unknown> | null | undefined;
  return {
    playing: Number(r.playing),
    you: typeof r.you === 'string' ? r.you : null,
    others: Array.isArray(r.others) ? r.others.filter((c): c is string => typeof c === 'string') : [],
    challenge:
      ch && typeof ch.room === 'string' && /^[A-Z]{4}$/.test(ch.room)
        ? { room: ch.room, mine: ch.mine === true, left: Number(ch.left) || 0 }
        : null,
    checkins: Array.isArray(r.checkins)
      ? (r.checkins as { country?: unknown; n?: unknown }[])
          .filter((c) => typeof c.country === 'string' && Number(c.n) > 0)
          .map((c) => ({ country: String(c.country), n: Number(c.n) }))
      : [],
    store: r.store === 'redis' ? 'redis' : 'memory',
  };
}

async function post(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('/api/table', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mark: tableMark(), ...body }),
  });
  if (!res.ok) throw new Error(`table ${res.status}`);
  return res.json();
}

export function beatTable(): Promise<TableView | null> {
  return post({ op: 'beat' })
    .then(parseTableView)
    .catch(() => null);
}

export function issueChallenge(room: string): Promise<boolean> {
  return post({ op: 'issue', room })
    .then((r) => (r as { ok?: boolean }).ok === true)
    .catch(() => false);
}

export function acceptChallenge(room: string): Promise<boolean> {
  return post({ op: 'accept', room })
    .then((r) => (r as { ok?: boolean }).ok === true)
    .catch(() => false);
}

export function cancelChallenge(): Promise<void> {
  return post({ op: 'cancel' })
    .then(() => undefined)
    .catch(() => undefined);
}

export function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
    return name && name.toUpperCase() !== code.toUpperCase() ? name : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/* ---- table state: 'live' while seated in a two-hand match ---- */

export type TableState = 'open' | 'live';
let tableState: TableState = 'open';
const stateSubs = new Set<(s: TableState) => void>();

export function setTableState(next: TableState): void {
  if (tableState === next) return;
  tableState = next;
  stateSubs.forEach((fn) => fn(next));
}
export function getTableState(): TableState {
  return tableState;
}
export function onTableState(fn: (s: TableState) => void): () => void {
  stateSubs.add(fn);
  return () => {
    stateSubs.delete(fn);
  };
}

/* ---- shared heartbeat: one loop for the whole app ---- */

export type TableSnapshot = { view: TableView | null; status: 'wait' | 'open' | 'shut' };
let snapshot: TableSnapshot = { view: null, status: 'wait' };
const viewSubs = new Set<(s: TableSnapshot) => void>();
let started = false;
let timer: number | null = null;
let failures = 0;
/** Smooths a dip in the count while a stale beat is still in flight. */
let steadyPlaying = 0;
let dips = 0;

function publish(next: TableSnapshot) {
  snapshot = next;
  viewSubs.forEach((fn) => fn(snapshot));
}

export function beatNow(): void {
  void beatTable().then((view) => {
    if (!view) {
      failures += 1;
      if (failures >= 2 || snapshot.status === 'wait') publish({ view: snapshot.view, status: 'shut' });
      return;
    }
    failures = 0;
    if (view.playing >= steadyPlaying || dips >= 2) {
      steadyPlaying = view.playing;
      dips = 0;
    } else dips += 1;
    publish({ view: { ...view, playing: Math.max(steadyPlaying, view.playing) }, status: 'open' });
  });
}

function schedule() {
  if (timer != null) window.clearTimeout(timer);
  if (document.visibilityState === 'hidden') {
    timer = null;
    return;
  }
  // Back off when the table does not answer (no store, offline, limits).
  const wait = failures > 0 ? Math.min(BEAT_MS * 2 ** failures, 120_000) : BEAT_MS;
  timer = window.setTimeout(() => {
    beatNow();
    schedule();
  }, wait);
}

function startTable() {
  if (started || typeof window === 'undefined') return;
  started = true;
  beatNow();
  schedule();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') beatNow();
    schedule();
  });
}

export function subscribeTable(fn: (s: TableSnapshot) => void): () => void {
  startTable();
  viewSubs.add(fn);
  fn(snapshot);
  return () => {
    viewSubs.delete(fn);
  };
}

export function readTableSnapshot(): TableSnapshot {
  return snapshot;
}
