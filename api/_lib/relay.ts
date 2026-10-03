/**
 * The relay: a server-carried channel for Friend Working when WebRTC cannot
 * open (no UDP, dead TURN, strict firewalls). Each room has a host inbox and
 * one inbox per guest; the clients long-poll them. Items are opaque JSON
 * envelopes ({k:'syn'|'ack'|'msg'|'bye', gid, m}) — the FriendMessage protocol
 * rides inside unchanged.
 *
 * Quick Match also lives here: a short queue of rooms waiting for a partner.
 */
import { randomInt } from 'node:crypto';
import type { Store } from './store.js';

export const RELAY_ROOM_RE = /^[A-Z]{4}$/;
export const RELAY_ID_RE = /^[a-f0-9]{8,32}$/;
export const RELAY_BOX_RE = /^(h|g:[a-f0-9]{8,32})$/;
/** Host lease: refreshed by the host's polls. */
export const HOST_LEASE_SEC = 90;
const BOX_SEC = 2 * 60 * 60;
const BOX_MAX = 20_000;
export const PULL_MAX = 40;
export const ITEM_MAX = 400_000;
const QUICK_OPEN_SEC = 45;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class RelayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const K = {
  host: (room: string) => `ow:rly:${room}:host`,
  box: (room: string, box: string) => `ow:rly:${room}:${box}`,
  open: (room: string) => `ow:rly:${room}:open`,
  quick: 'ow:rly:quick',
};

function room(raw: unknown): string {
  const r = String(raw ?? '');
  if (!RELAY_ROOM_RE.test(r)) throw new RelayError(400, 'Bad room.');
  return r;
}
function id(raw: unknown): string {
  const v = String(raw ?? '');
  if (!RELAY_ID_RE.test(v)) throw new RelayError(400, 'Bad id.');
  return v;
}
function box(raw: unknown): string {
  const b = String(raw ?? '');
  if (!RELAY_BOX_RE.test(b)) throw new RelayError(400, 'Bad box.');
  return b;
}

/** Claim (or re-claim) a room as its host. A fresh claim empties the host inbox. */
export async function hostRoom(store: Store, rawRoom: unknown, rawHid: unknown) {
  const r = room(rawRoom);
  const hid = id(rawHid);
  const [claimed, holder] = await store.pipe([
    ['SET', K.host(r), hid, 'NX', 'EX', HOST_LEASE_SEC],
    ['GET', K.host(r)],
  ]);
  if (claimed === 'OK') {
    await store.pipe([['DEL', K.box(r, 'h')]]);
    return { ok: true as const, fresh: true };
  }
  if (holder === hid) {
    await store.pipe([['EXPIRE', K.host(r), HOST_LEASE_SEC]]);
    return { ok: true as const };
  }
  return { ok: false as const, taken: true };
}

export async function leaveRoom(store: Store, rawRoom: unknown, rawHid: unknown) {
  const r = room(rawRoom);
  const hid = id(rawHid);
  const [holder] = await store.pipe([['GET', K.host(r)]]);
  if (holder === hid) await store.pipe([['DEL', K.host(r)], ['DEL', K.open(r)]]);
  return { ok: true as const };
}

/** Append envelopes to an inbox. The host inbox only takes mail while a host holds the room. */
export async function pushItems(store: Store, rawRoom: unknown, rawBox: unknown, items: unknown) {
  const r = room(rawRoom);
  const b = box(rawBox);
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new RelayError(400, 'Bad items.');
  }
  const texts = items.map((x) => JSON.stringify(x));
  if (texts.some((t) => t.length > ITEM_MAX)) throw new RelayError(413, 'Too large.');
  if (b === 'h') {
    const [held] = await store.pipe([['EXISTS', K.host(r)]]);
    if (!Number(held)) return { ok: false as const, nohost: true };
  }
  const [len] = await store.pipe([
    ['RPUSH', K.box(r, b), ...texts],
    ['EXPIRE', K.box(r, b), BOX_SEC],
  ]);
  if (Number(len) > BOX_MAX) throw new RelayError(413, 'The relay is full for this room.');
  return { ok: true as const, n: Number(len) };
}

/** Read an inbox from a cursor (list index). A host's read also renews its lease. */
export async function pullItems(
  store: Store,
  rawRoom: unknown,
  rawBox: unknown,
  rawFrom: unknown,
  rawHid?: unknown,
) {
  const r = room(rawRoom);
  const b = box(rawBox);
  const from = Math.max(0, Math.floor(Number(rawFrom) || 0));
  const cmds: (string | number)[][] = [['LRANGE', K.box(r, b), from, from + PULL_MAX - 1]];
  if (b === 'h' && rawHid != null) {
    const hid = id(rawHid);
    cmds.push(['GET', K.host(r)]);
    const [list, holder] = await store.pipe(cmds);
    if (holder === hid) await store.pipe([['EXPIRE', K.host(r), HOST_LEASE_SEC]]);
    else if (holder == null) await store.pipe([['SET', K.host(r), hid, 'NX', 'EX', HOST_LEASE_SEC]]);
    return view(list, from, holder != null && holder !== hid);
  }
  const [list] = await store.pipe(cmds);
  return view(list, from, false);
}

function view(list: unknown, from: number, lost: boolean) {
  const raw = Array.isArray(list) ? list : [];
  const items: unknown[] = [];
  for (const t of raw) {
    try {
      items.push(JSON.parse(String(t)));
    } catch {
      items.push(null);
    }
  }
  return { ok: true as const, items, next: from + raw.length, ...(lost ? { lost: true } : {}) };
}

function newRoom(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return s;
}

/**
 * Quick Match: take the oldest room still waiting (claiming it atomically by
 * deleting its open flag), or open a new room and wait in the queue.
 */
export async function quickMatch(store: Store, rawGid: unknown) {
  id(rawGid);
  for (let i = 0; i < 12; i++) {
    const [r] = await store.pipe([['LPOP', K.quick]]);
    if (typeof r !== 'string') break;
    if (!RELAY_ROOM_RE.test(r)) continue;
    const [gone] = await store.pipe([['DEL', K.open(r)]]);
    if (Number(gone) === 1) return { ok: true as const, role: 'guest' as const, room: r };
  }
  for (let i = 0; i < 6; i++) {
    const r = newRoom();
    const [free] = await store.pipe([['EXISTS', K.host(r)]]);
    if (Number(free)) continue;
    await store.pipe([
      ['SET', K.open(r), '1', 'EX', QUICK_OPEN_SEC],
      ['RPUSH', K.quick, r],
      ['EXPIRE', K.quick, 600],
    ]);
    return { ok: true as const, role: 'host' as const, room: r };
  }
  throw new RelayError(503, 'No room free. Try again.');
}

/** A waiting Quick Match host stays in the queue (re-queued if its slot lapsed unclaimed). */
export async function quickBeat(store: Store, rawRoom: unknown, rawHid: unknown) {
  const r = room(rawRoom);
  id(rawHid);
  const [kept] = await store.pipe([['SET', K.open(r), '1', 'XX', 'EX', QUICK_OPEN_SEC]]);
  return { ok: true as const, waiting: kept === 'OK' };
}

/** Put a waiting host back in the queue (its claimant never arrived). */
export async function quickRequeue(store: Store, rawRoom: unknown, rawHid: unknown) {
  const r = room(rawRoom);
  id(rawHid);
  await store.pipe([
    ['SET', K.open(r), '1', 'EX', QUICK_OPEN_SEC],
    ['RPUSH', K.quick, r],
    ['EXPIRE', K.quick, 600],
  ]);
  return { ok: true as const };
}

export async function quickCancel(store: Store, rawRoom: unknown) {
  const r = room(rawRoom);
  await store.pipe([['DEL', K.open(r)]]);
  return { ok: true as const };
}
