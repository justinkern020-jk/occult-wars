/**
 * The Portal (owner-only spectating) — client side.
 *
 * Reporter: a match in progress (the host, or the only client) tells the
 * table it is live every LIVE_EVERY_MS; while the owner watches, it streams
 * frames and receives codes sent through the portal.
 *
 * Owner: /api/watch, gated server-side. The owner proves themselves with a
 * signed-in seat (OWNER_EMAILS / OWNER_IDS) or an owner key opened once via
 * `#owner-key=…` and kept on this device.
 */
import { seatHeaders } from './account';
import { tableMark } from './table';

export const OWNER_KEY_STORAGE = 'occult-wars.owner-key';
export const LIVE_EVERY_MS = 10_000;
export const WATCHED_EVERY_MS = 2_000;

export type PortalCode = 'justin' | 'adept' | 'seth' | 'southhaven' | 'athens';
export type PortalCommand = { n: number; side: 'blue' | 'red'; code: PortalCode; at: number };

export type SeatLine = { name: string; faction: string; leader: string };
export type MatchSummary = {
  id: string;
  mode: string;
  era: string;
  map: string;
  turn: number;
  side: 'blue' | 'red';
  phase: string;
  blue: SeatLine;
  red: SeatLine;
  over: boolean;
  at: number;
};

export type FrameUnit = {
  uid: string;
  cardId: string;
  name: string;
  side: 'blue' | 'red';
  power: number;
  maxPower: number;
  loyalty: number;
  keywords: string[];
  sick?: boolean;
  gained?: number;
};

/** What the portal shows. Hands are counts only — they stay hidden. */
export type MatchFrame = {
  map: string;
  turn: number;
  side: 'blue' | 'red';
  phase: string;
  resources: { blue: number; red: number };
  domination: { blue: number; red: number };
  hand: { blue: number; red: number };
  deck: { blue: number; red: number };
  board: (FrameUnit | null)[][];
  control: ('blue' | 'red' | null)[][];
  log: string[];
  over: { winner: 'blue' | 'red'; reason: string } | null;
};

export function newMatchId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export function newMatchKey(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
}

export async function reportLive(body: {
  id: string;
  key: string;
  summary: Omit<MatchSummary, 'id' | 'at'>;
  frame?: MatchFrame;
}): Promise<{ watched: boolean; cmds: PortalCommand[] } | null> {
  try {
    const res = await fetch('/api/table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'live', mark: tableMark(), ...body }),
      keepalive: !body.frame,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { watched?: boolean; cmds?: PortalCommand[] };
    return {
      watched: data.watched === true,
      cmds: Array.isArray(data.cmds) ? data.cmds.filter(isPortalCommand) : [],
    };
  } catch {
    return null;
  }
}

function isPortalCommand(c: unknown): c is PortalCommand {
  const o = c as PortalCommand;
  return (
    !!o &&
    (o.side === 'blue' || o.side === 'red') &&
    ['justin', 'adept', 'seth', 'southhaven', 'athens'].includes(o.code)
  );
}

/** Pick up `#owner-key=…` once, keep it on this device, and clear the hash. */
export function captureOwnerKey(): void {
  if (typeof window === 'undefined') return;
  const m = /(?:^#|&)owner-key=([^&]{16,200})/.exec(window.location.hash);
  if (!m) return;
  try {
    localStorage.setItem(OWNER_KEY_STORAGE, decodeURIComponent(m[1]));
  } catch {
    /* private mode */
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function ownerHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', ...seatHeaders() };
  try {
    const k = localStorage.getItem(OWNER_KEY_STORAGE);
    if (k) h['x-ow-owner-key'] = k;
  } catch {
    /* none */
  }
  return h;
}

async function watchCall<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch('/api/watch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: ownerHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** True only when the server says this is the owner. */
export async function portalOpen(): Promise<boolean> {
  return (await watchCall<{ ok: boolean }>({ op: 'gate' }))?.ok === true;
}

export async function listMatches(): Promise<MatchSummary[] | null> {
  const r = await watchCall<{ matches: MatchSummary[] }>({ op: 'list' });
  return r ? r.matches ?? [] : null;
}

/** One hand at the table, as the owner's roll sees it. */
export type HandLine = {
  id: string;
  name: string;
  seat: boolean;
  country: string | null;
  where: string;
  mode: string;
  era: string;
  map: string;
  match: string;
  build: string;
  since: number;
  last: number;
  /** False for a page too old to say what it is doing. */
  known: boolean;
  /** Adept level (0 / missing = a page too old to say). */
  level?: number;
};

export async function readWho(): Promise<{ hands: HandLine[]; matches: MatchSummary[]; build: string } | null> {
  const r = await watchCall<{ hands?: HandLine[]; matches?: MatchSummary[]; build?: string }>({ op: 'who' });
  if (!r) return null;
  return { hands: r.hands ?? [], matches: r.matches ?? [], build: r.build ?? '' };
}

/** One claimed name on the owner's account roll (no email). */
export type AccountLine = {
  username: string;
  createdAt: number;
  lastSignInAt: number | null;
  country: string | null;
};

export async function readAccounts(): Promise<{ accounts: AccountLine[]; truncated: boolean } | null> {
  const r = await watchCall<{ accounts?: AccountLine[]; truncated?: boolean }>({ op: 'accounts' });
  if (!r) return null;
  return { accounts: r.accounts ?? [], truncated: !!r.truncated };
}

export async function viewMatch(
  id: string,
): Promise<{ summary: MatchSummary | null; frame: MatchFrame | null } | null> {
  return watchCall({ op: 'view', id });
}

export async function sendPortalCode(
  id: string,
  side: 'blue' | 'red',
  code: PortalCode,
): Promise<boolean> {
  return (await watchCall<{ ok: boolean }>({ op: 'code', id, side, code }))?.ok === true;
}

/** Any frame (this build's or an older client's) made safe to draw. */
export function normalizeFrame(raw: unknown): MatchFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const side = (v: unknown): 'blue' | 'red' | null => (v === 'blue' || v === 'red' ? v : null);
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const pair = (v: unknown) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { blue: num(o.blue), red: num(o.red) };
  };
  const unit = (v: unknown): FrameUnit | null => {
    if (!v || typeof v !== 'object') return null;
    const u = v as Record<string, unknown>;
    const s = side(u.side) ?? (u.owner === 'red' ? 'red' : u.owner === 'blue' ? 'blue' : null);
    if (!s) return null;
    const power = num(u.power ?? u.attack, 0);
    return {
      uid: String(u.uid ?? u.id ?? Math.random().toString(36).slice(2)),
      cardId: String(u.cardId ?? u.card ?? ''),
      name: String(u.name ?? ''),
      side: s,
      power,
      maxPower: num(u.maxPower, power),
      loyalty: num(u.loyalty, 0),
      keywords: Array.isArray(u.keywords) ? u.keywords.filter((k): k is string => typeof k === 'string') : [],
      sick: u.sick === true,
      gained: num(u.gained, 0),
    };
  };
  const grid = <T,>(v: unknown, cell: (x: unknown) => T): T[][] =>
    Array.isArray(v) ? v.map((row) => (Array.isArray(row) ? row.map(cell) : [])) : [];
  return {
    map: typeof f.map === 'string' ? f.map : '',
    turn: num(f.turn, 1),
    side: side(f.side) ?? 'blue',
    phase: typeof f.phase === 'string' ? f.phase : '',
    resources: pair(f.resources),
    domination: pair(f.domination),
    hand: pair(f.hand),
    deck: pair(f.deck),
    board: grid(f.board, unit),
    control: grid(f.control, side),
    log: Array.isArray(f.log) ? f.log.filter((l): l is string => typeof l === 'string').slice(-30) : [],
    over:
      f.over && typeof f.over === 'object' && side((f.over as { winner?: unknown }).winner)
        ? { winner: side((f.over as { winner: unknown }).winner)!, reason: String((f.over as { reason?: unknown }).reason ?? '') }
        : null,
  };
}
