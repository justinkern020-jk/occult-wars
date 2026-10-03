/**
 * "Take a seat" — the gentle account invitation on the match-over plate.
 * Offered after the first finished match, then every 5th, until the player
 * holds an account (on this device) or has said "Not now" twice.
 */
const KEY = 'occult-wars-seat-invite';

export const SEAT_INVITE_EVERY = 5;
export const SEAT_INVITE_MAX_DECLINES = 2;

export type SeatInviteState = {
  /** Finished matches seen on this device. */
  matches: number;
  /** Times the player answered "Not now". */
  declined: number;
  /** The match count at which the invite was last offered (0 = never). */
  lastOfferedAt: number;
  /** An account has been seen on this device — the invite never returns. */
  seated: boolean;
};

const EMPTY: SeatInviteState = { matches: 0, declined: 0, lastOfferedAt: 0, seated: false };

export function readSeatInvite(): SeatInviteState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const o = JSON.parse(raw) as Partial<SeatInviteState>;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return {
      matches: n(o.matches),
      declined: n(o.declined),
      lastOfferedAt: n(o.lastOfferedAt),
      seated: o.seated === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(s: SeatInviteState): SeatInviteState {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
  return s;
}

/** Pure: should this finished match carry the invitation? */
export function shouldOfferSeat(s: SeatInviteState): boolean {
  if (s.seated || s.declined >= SEAT_INVITE_MAX_DECLINES || s.matches < 1) return false;
  if (s.lastOfferedAt === 0) return true; // the first finished match (or the first one that showed a plate)
  return s.matches - s.lastOfferedAt >= SEAT_INVITE_EVERY;
}

/** A match has finished: count it. Returns the new state. */
export function noteSeatMatch(): SeatInviteState {
  const s = readSeatInvite();
  return write({ ...s, matches: s.matches + 1 });
}

/** The invitation was actually shown on this match. */
export function markSeatOffered(): SeatInviteState {
  const s = readSeatInvite();
  return write({ ...s, lastOfferedAt: s.matches });
}

/** "Not now". */
export function declineSeatInvite(): SeatInviteState {
  const s = readSeatInvite();
  return write({ ...s, declined: s.declined + 1 });
}

/** An account sits on this device: never invite again. */
export function markSeated(): void {
  const s = readSeatInvite();
  if (!s.seated) write({ ...s, seated: true });
}
