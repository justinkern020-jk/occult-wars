/**
 * The Occultist Meeting — one shared bulletin board for everyone at the table.
 *
 * Messages are plain text (never HTML; the client renders them as text) kept
 * in a sorted index of sequential ids, the newest ~200 retained. Posting is
 * rate-limited per hand and per address; links and repeated-character spam
 * are refused and a short list of slurs and profanity is masked. The owner
 * (server-verified: OWNER_KEY / OWNER_EMAILS / OWNER_IDS) posts with a Grand
 * Master badge and may strike any message.
 */
import type { Store } from './store.js';
import { userForToken } from './accounts.js';

export const KEEP = 200;
export const TEXT_MAX = 500;
export const NAME_MAX = 24;
export const POST_EVERY_MS = 5_000;
export const IP_PER_10S = 8;
const MSG_SEC = 30 * 24 * 60 * 60;

export const MK = {
  n: 'ow:meet:n',
  rev: 'ow:meet:rev',
  idx: 'ow:meet:idx',
  msg: (id: number) => `ow:meet:m:${id}`,
  rate: (who: string) => `ow:meet:rl:${who}`,
};

export type Badge = 'owner' | 'seat' | 'guest';
export type MeetingMessage = { id: number; at: number; name: string; text: string; badge: Badge };

export class MeetingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Kept short and whole-word so ordinary words are not caught.
const MASK = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'shitty', 'bullshit', 'cunt', 'bitch',
  'bastard', 'asshole', 'dick', 'dickhead', 'cock', 'pussy', 'whore', 'slut', 'wanker', 'twat',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink', 'tranny',
];
const MASK_RE = new RegExp(`\\b(${MASK.join('|')})(s|es|ed|ing)?\\b`, 'gi');
const LINK_RE =
  /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|xyz|ru|cn|ly|me|co|app|dev|info|biz|tk|top|site|online|link|click|shop)\b|discord\.gg|t\.me\/)/i;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,23}$/u;
const RESERVED_RE = /grand\s*master|owner|admin|moderator|justin\s*kern|occult\s*wars/i;

/** Plain text, no control characters, whitespace tamed, length capped. */
export function cleanText(raw: unknown): string {
  const s = String(raw ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.slice(0, TEXT_MAX);
}

export function maskProfanity(text: string): string {
  return text.replace(MASK_RE, (w) => w[0] + '✶'.repeat(Math.max(2, w.length - 1)));
}

/** Refusal reason, or null when the message may be posted. */
export function spamReason(text: string, owner: boolean): string | null {
  if (!text) return 'Say something first.';
  if (owner) return null;
  if (LINK_RE.test(text)) return 'Links are not read aloud at the meeting.';
  if (/(.)\1{11,}/u.test(text)) return 'That is one letter shouted many times.';
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 24 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return 'The meeting asks you not to shout.';
  }
  return null;
}

export function cleanName(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!NAME_RE.test(s)) return null;
  return s;
}

function parse(raw: unknown): MeetingMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as MeetingMessage;
    return m && Number.isFinite(m.id) && typeof m.text === 'string' ? m : null;
  } catch {
    return null;
  }
}

/** Recent messages (oldest first). With `since`, only newer ones. */
export async function listMeeting(
  store: Store,
  since = 0,
): Promise<{ msgs: MeetingMessage[]; head: number; rev: number }> {
  const [ids, head, rev] = await store.pipe([
    ['ZRANGEBYSCORE', MK.idx, since > 0 ? `(${since}` : '-inf', '+inf'],
    ['GET', MK.n],
    ['GET', MK.rev],
  ]);
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(-KEEP);
  let msgs: MeetingMessage[] = [];
  if (list.length) {
    const [raws] = await store.pipe([['MGET', ...list.map(MK.msg)]]);
    msgs = (Array.isArray(raws) ? raws : []).map(parse).filter((m): m is MeetingMessage => !!m);
  }
  return { msgs, head: Number(head) || 0, rev: Number(rev) || 0 };
}

export type Poster = {
  owner: boolean;
  seatId: string | null;
  seatName: string | null;
  mark: string;
  ip: string;
};

export async function posterFor(
  store: Store,
  token: string | null,
  owner: boolean,
  mark: string,
  ip: string,
): Promise<Poster> {
  const user = await userForToken(store, token);
  return {
    owner,
    seatId: user?.id ?? null,
    seatName: user ? user.username || user.displayName || null : null,
    mark,
    ip,
  };
}

export async function postMeeting(
  store: Store,
  who: Poster,
  input: { text: unknown; name: unknown },
  now: number,
): Promise<MeetingMessage> {
  const text = cleanText(input.text);
  const why = spamReason(text, who.owner);
  if (why) throw new MeetingError(400, why);
  let name: string;
  let badge: Badge;
  if (who.owner) {
    name = cleanName(input.name) ?? 'Grand Master';
    badge = 'owner';
  } else if (who.seatName) {
    name = cleanName(who.seatName) ?? 'Occultist';
    badge = 'seat';
  } else {
    const chosen = cleanName(input.name);
    if (!chosen) throw new MeetingError(400, 'Choose a name to speak under (letters and numbers).');
    if (RESERVED_RE.test(chosen)) throw new MeetingError(400, 'That name belongs to the lodge.');
    name = chosen;
    badge = 'guest';
  }
  if (!who.owner) {
    // One message per hand every 5 s; a shared address (an office, a station)
    // gets a looser ceiling so a crowd behind one router can still talk.
    const slow = new MeetingError(429, 'Wait a few breaths before you speak again.');
    const hand = who.seatId ? `s:${who.seatId}` : `m:${who.mark}`;
    const [mine] = await store.pipe([['SET', MK.rate(hand), '1', 'PX', POST_EVERY_MS, 'NX']]);
    if (mine !== 'OK') throw slow;
    const bucket = MK.rate(`ip:${who.ip}:${Math.floor(now / 10_000)}`);
    const [count] = await store.pipe([['INCR', bucket], ['EXPIRE', bucket, 20]]);
    if (Number(count) > IP_PER_10S) throw slow;
  }
  const [n] = await store.pipe([['INCR', MK.n]]);
  const id = Number(n);
  const msg: MeetingMessage = { id, at: now, name, text: who.owner ? text : maskProfanity(text), badge };
  await store.pipe([
    ['SET', MK.msg(id), JSON.stringify(msg), 'EX', MSG_SEC],
    ['ZADD', MK.idx, id, String(id)],
    ['ZREMRANGEBYSCORE', MK.idx, '-inf', id - KEEP],
  ]);
  return msg;
}

/** Owner only (the caller checks): strike a message from the board. */
export async function deleteMeeting(store: Store, id: unknown): Promise<void> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new MeetingError(400, 'Bad message.');
  await store.pipe([['ZREM', MK.idx, String(n)], ['DEL', MK.msg(n)], ['INCR', MK.rev]]);
}
