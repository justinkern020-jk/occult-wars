/**
 * Accounts, the Ledger and the cloud profile — client for /api/account.
 * The seat is a small shared store so every screen sees the same signed-in
 * occultist. When the server answers 503 { shut } the book is shut: no
 * durable ledger store is connected, so everything stays local.
 */

export type Seat = {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  tableWins: number;
  tableLosses: number;
  practiceWins: number;
  practiceLosses: number;
};

export type BookRow = { username: string; tableWins: number; tableLosses: number };

export type SeatState = {
  /** 'unknown' until the first answer; 'shut' when the server has no ledger store. */
  status: 'unknown' | 'open' | 'shut' | 'offline';
  seat: Seat | null;
};

export class AccountError extends Error {
  shut: boolean;
  status: number;
  constructor(message: string, status: number, shut = false) {
    super(message);
    this.status = status;
    this.shut = shut;
  }
}

const ENDPOINT = '/api/account';
/** The seat token, kept so a reload or a fresh tab stays seated. */
export const SEAT_TOKEN_KEY = 'occult-wars.seat-token';
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function readSeatToken(): string | null {
  try {
    const t = localStorage.getItem(SEAT_TOKEN_KEY);
    return t && TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}

function writeSeatToken(token: string | null): void {
  try {
    if (token && TOKEN_RE.test(token)) localStorage.setItem(SEAT_TOKEN_KEY, token);
    else localStorage.removeItem(SEAT_TOKEN_KEY);
  } catch {
    /* private mode: the HttpOnly cookie still carries the seat */
  }
}

/** Authorization header for any /api call that should know the seat. */
export function seatHeaders(): Record<string, string> {
  const t = readSeatToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

let state: SeatState = { status: 'unknown', seat: null };
const listeners = new Set<(s: SeatState) => void>();

function setState(next: SeatState) {
  state = next;
  for (const l of listeners) l(state);
}

export function readSeatState(): SeatState {
  return state;
}

export function subscribeSeat(fn: (s: SeatState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function call<T>(init: { op: string; body?: Record<string, unknown>; keepalive?: boolean }): Promise<T> {
  let res: Response;
  try {
    res =
      init.body === undefined
        ? await fetch(`${ENDPOINT}?op=${encodeURIComponent(init.op)}`, {
            credentials: 'same-origin',
            headers: { accept: 'application/json', ...seatHeaders() },
          })
        : await fetch(ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              ...seatHeaders(),
            },
            body: JSON.stringify({ op: init.op, ...init.body }),
            keepalive: init.keepalive,
          });
  } catch {
    throw new AccountError('The ledger could not be reached.', 0);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not json */
  }
  if (!res.ok || data.ok === false) {
    const shut = data.shut === true;
    if (shut) setState({ status: 'shut', seat: null });
    throw new AccountError(
      typeof data.error === 'string' ? data.error : `The ledger answered ${res.status}.`,
      res.status,
      shut,
    );
  }
  return data as T;
}

function seatFrom(data: { seat?: Seat | null; token?: string }): Seat | null {
  const seat = data.seat ?? null;
  if (typeof data.token === 'string') writeSeatToken(data.token);
  else if (!seat) writeSeatToken(null);
  setState({ status: 'open', seat });
  return seat;
}

/** Who is sitting here? Resolves the shared seat state. */
export async function refreshSeat(): Promise<SeatState> {
  try {
    seatFrom(await call<{ seat: Seat | null }>({ op: 'me' }));
  } catch (err) {
    if (!(err instanceof AccountError && err.shut)) setState({ status: 'offline', seat: state.seat });
  }
  return state;
}

export async function signUp(email: string, password: string, name: string): Promise<Seat | null> {
  return seatFrom(await call({ op: 'signup', body: { email, password, name } }));
}

export async function signIn(email: string, password: string): Promise<Seat | null> {
  return seatFrom(await call({ op: 'signin', body: { email, password } }));
}

export async function signOut(): Promise<void> {
  try {
    await call({ op: 'signout', body: {} });
  } finally {
    writeSeatToken(null);
    setState({ status: 'open', seat: null });
  }
}

/** Close this account for good (asks for the password again). */
export async function deleteAccount(password: string): Promise<void> {
  await call({ op: 'delete', body: { password } });
  writeSeatToken(null);
  setState({ status: 'open', seat: null });
}

export async function takeLedgerName(username: string): Promise<Seat | null> {
  return seatFrom(await call({ op: 'name', body: { username } }));
}

/** Record a finished match. `table` = a live match against another occultist. */
export async function recordMatch(won: boolean, table: boolean): Promise<void> {
  if (!state.seat) return;
  try {
    seatFrom(await call({ op: 'record', body: { won, table } }));
  } catch {
    /* the field result stands locally either way */
  }
}

export async function readBook(): Promise<BookRow[]> {
  const data = await call<{ book?: BookRow[] }>({ op: 'book' });
  return Array.isArray(data.book) ? data.book : [];
}

export async function fetchCloudProfile(): Promise<unknown | null> {
  const data = await call<{ profile?: unknown }>({ op: 'profile' });
  return data.profile ?? null;
}

export async function pushCloudProfile(profile: unknown, opts: { keepalive?: boolean } = {}): Promise<void> {
  // keepalive (page closing) only fits small bodies (~64 KB).
  const keepalive = !!opts.keepalive && JSON.stringify(profile).length < 60_000;
  await call({ op: 'profile', body: { profile }, keepalive });
}

/** "7–3 · 70%" or "untried". */
export function recordLine(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return 'untried';
  return `${wins}–${losses} · ${Math.round((wins / total) * 100)}%`;
}

/** Testing seam. */
export function resetSeatForTests(): void {
  state = { status: 'unknown', seat: null };
  listeners.clear();
}
