/**
 * Board diffs → feel. Pure helpers that read two board snapshots and say what
 * happened (moves, musters, deaths, wounds, growth), so a hand that only sees
 * states (the friend guest) can play the same sounds and effects, and every
 * hand can show death bursts and +N growth without touching the rules code.
 */
import type { Card } from './types';

export type FxSide = 'blue' | 'red';

export type FxUnit = {
  uid: string;
  cardId: string;
  name: string;
  side: FxSide;
  power: number;
  keywords: string[];
  attacked?: boolean;
  used?: boolean;
  once?: boolean;
};

export type FxBoard = (FxUnit | null)[][];

export type BoardDiff = {
  moves: { unit: FxUnit; fromR: number; fromC: number; toR: number; toC: number }[];
  musters: { unit: FxUnit; r: number; c: number }[];
  deaths: { unit: FxUnit; r: number; c: number }[];
  wounds: { unit: FxUnit; r: number; c: number; amount: number }[];
  gains: { unit: FxUnit; r: number; c: number; amount: number }[];
  /** Units that struck between the two snapshots (attacked false → true). */
  strikers: { unit: FxUnit; r: number; c: number; fromR: number; fromC: number }[];
  /** Units whose own power was called (once-each-rite / once-in-a-sitting flag set). */
  calls: { unit: FxUnit; r: number; c: number }[];
};

function index(board: FxBoard): Map<string, { u: FxUnit; r: number; c: number }> {
  const m = new Map<string, { u: FxUnit; r: number; c: number }>();
  board.forEach((row, r) =>
    row.forEach((u, c) => {
      if (u) m.set(u.uid, { u, r, c });
    }),
  );
  return m;
}

export function diffBoards(prev: FxBoard, next: FxBoard): BoardDiff {
  const a = index(prev);
  const b = index(next);
  const out: BoardDiff = {
    moves: [],
    musters: [],
    deaths: [],
    wounds: [],
    gains: [],
    strikers: [],
    calls: [],
  };
  for (const [uid, was] of a) {
    const now = b.get(uid);
    if (!now) {
      out.deaths.push({ unit: was.u, r: was.r, c: was.c });
      continue;
    }
    if (now.r !== was.r || now.c !== was.c) {
      out.moves.push({ unit: now.u, fromR: was.r, fromC: was.c, toR: now.r, toC: now.c });
    }
    const d = now.u.power - was.u.power;
    if (d < 0) out.wounds.push({ unit: now.u, r: now.r, c: now.c, amount: -d });
    if (d > 0) out.gains.push({ unit: now.u, r: now.r, c: now.c, amount: d });
    if ((!was.u.used && now.u.used) || (!was.u.once && now.u.once)) {
      out.calls.push({ unit: now.u, r: now.r, c: now.c });
    }
    if (!was.u.attacked && now.u.attacked) {
      out.strikers.push({ unit: now.u, r: now.r, c: now.c, fromR: was.r, fromC: was.c });
    }
  }
  for (const [uid, now] of b) {
    if (!a.has(uid)) out.musters.push({ unit: now.u, r: now.r, c: now.c });
  }
  return out;
}

export type GuestSound =
  | 'move'
  | 'cast'
  | 'gas'
  | 'dispatch'
  | 'clash'
  | 'gunshot'
  | 'power';

/**
 * What the guest should hear for one state step (deaths are heard by every
 * hand from the shared board effect, so they are not listed here). `newDiscards` are plates that
 * just reached either discard pile (a rite / device among them means a cast).
 */
export function guestSounds(diff: BoardDiff, newDiscards: Card[]): GuestSound[] {
  const out: GuestSound[] = [];
  const spell = [...newDiscards].reverse().find((c) => c.kind === 'rite' || c.kind === 'device');
  if (spell) {
    if (spell.id === 'south_haven_dispatch') out.push('dispatch');
    else if (spell.keywords.includes('gas')) out.push('gas');
    else out.push('cast');
  }
  if (diff.strikers.length > 0 && !spell) {
    const s = diff.strikers[0];
    const victims = [
      ...diff.wounds.filter((w) => w.unit.side !== s.unit.side),
      ...diff.deaths.filter((d) => d.unit.side !== s.unit.side),
    ];
    const far = victims.some((v) => Math.abs(v.r - s.fromR) + Math.abs(v.c - s.fromC) > 1);
    out.push(s.unit.keywords.includes('ranged') && far ? 'gunshot' : 'clash');
  } else if ((diff.moves.length > 0 || diff.musters.length > 0) && !spell) {
    out.push('move');
  }
  if (diff.calls.length > 0 && !spell) out.push('power');
  return out;
}

/** Plates added to a pile between two snapshots (pile only grows by appending). */
export function newOnPile(prev: Card[], next: Card[]): Card[] {
  return next.length > prev.length ? next.slice(prev.length) : [];
}
