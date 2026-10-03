/**
 * The Occultist Meeting — client side. Polls while open; the menu's unread
 * dot reads the newest id from the table heartbeat (no extra calls).
 */
import { seatHeaders } from './account';
import { tableMark } from './table';
import { OWNER_KEY_STORAGE } from './watch';

export const MEETING_POLL_MS = 4_000;
export const MEETING_TEXT_MAX = 500;
const SEEN_KEY = 'occult-wars.meeting.seen';
const NAME_KEY = 'occult-wars.meeting.name';

export type MeetingBadge = 'owner' | 'seat' | 'guest';
export type MeetingImage = { src: string; w: number; h: number; type: string };
export type MeetingMessage = {
  id: number;
  at: number;
  name: string;
  text: string;
  badge: MeetingBadge;
  img?: MeetingImage;
};
/** A compressed image ready to send (base64 without the data: prefix). */
export type MeetingUpload = { data: string; w: number; h: number; type: string; bytes: number; preview: string };
export type MeetingRead = {
  msgs: MeetingMessage[];
  head: number;
  rev: number;
  full: boolean;
  owner: boolean;
  store: 'redis' | 'memory';
};

export class MeetingError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', ...seatHeaders() };
  try {
    const k = localStorage.getItem(OWNER_KEY_STORAGE);
    if (k) h['x-ow-owner-key'] = k;
  } catch {
    /* none */
  }
  return h;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/meeting', {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers(),
      body: JSON.stringify(body),
    });
  } catch {
    throw new MeetingError('The meeting hall could not be reached.', 0);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* not json */
  }
  if (!res.ok || data.ok === false) {
    throw new MeetingError(
      typeof data.error === 'string' ? data.error : `The meeting answered ${res.status}.`,
      res.status,
    );
  }
  return data as T;
}

/** Only images the meeting itself serves: its own route, or its Vercel Blob store. */
export function safeImageSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null;
  if (/^\/api\/meeting\?img=\d{1,12}$/.test(src)) return src;
  if (/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/meeting\/[\w.-]+$/i.test(src)) return src;
  return null;
}

function isMessage(m: unknown): m is MeetingMessage {
  const o = m as MeetingMessage;
  if (!o || !Number.isFinite(o.id) || typeof o.text !== 'string' || typeof o.name !== 'string') return false;
  if (o.img) {
    const src = safeImageSrc(o.img.src);
    if (!src) delete o.img;
  }
  return true;
}

export async function readMeeting(since = 0, rev?: number): Promise<MeetingRead> {
  const r = await call<Partial<MeetingRead>>({ op: 'list', since, rev });
  return {
    msgs: Array.isArray(r.msgs) ? r.msgs.filter(isMessage) : [],
    head: Number(r.head) || 0,
    rev: Number(r.rev) || 0,
    full: r.full === true,
    owner: r.owner === true,
    store: r.store === 'redis' ? 'redis' : 'memory',
  };
}

export async function postMeeting(
  text: string,
  name: string,
  image?: MeetingUpload | null,
): Promise<MeetingMessage> {
  const r = await call<{ msg: MeetingMessage }>({
    op: 'post',
    mark: tableMark(),
    text,
    name,
    ...(image ? { image: { data: image.data, w: image.w, h: image.h } } : {}),
  });
  return r.msg;
}

export async function strikeMeeting(id: number): Promise<void> {
  await call({ op: 'delete', id });
}

/** Merge a read into the board (oldest first, newest ~200 kept). */
export function mergeMeeting(
  have: MeetingMessage[],
  read: Pick<MeetingRead, 'msgs' | 'full'>,
): MeetingMessage[] {
  if (read.full) return read.msgs.slice(-200);
  const byId = new Map(have.map((m) => [m.id, m]));
  for (const m of read.msgs) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-200);
}

export function readSeenMeeting(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeSeenMeeting(id: number): void {
  try {
    if (id > readSeenMeeting()) localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event('ow-meeting-seen'));
}

export function readMeetingName(fallback: string): string {
  try {
    return localStorage.getItem(NAME_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function writeMeetingName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

/** Split text into plain runs and http(s) links (rendered as text or <a>; never HTML). */
export function linkParts(text: string): ({ text: string } | { href: string; text: string })[] {
  const out: ({ text: string } | { href: string; text: string })[] = [];
  const re = /\bhttps?:\/\/[^\s<>"'`]+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    let raw = m[0];
    // Leave closing punctuation to the sentence.
    while (/[.,!?;:)\]}'"]$/.test(raw)) raw = raw.slice(0, -1);
    const at = m.index ?? 0;
    let href: string | null = null;
    try {
      const u = new URL(raw);
      href = u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
      href = null;
    }
    if (!href) continue;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ href, text: raw });
    last = at + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
