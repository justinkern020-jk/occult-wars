/**
 * Patron codes: the owner hands these out; a code unlocks the patron
 * cosmetics (the gilt card back). Codes are signed, not stored, so checking
 * one needs no lookup:
 *
 *   PATRON-<6-char serial>-<8-char HMAC-SHA256(secret, serial)>
 *
 * The secret is PATRON_SECRET (≥16 chars) if set, else a random one kept in
 * the durable store (made on the first mint). Minted codes (with a note) and
 * redemption counts are kept so the owner can see them in the Portal; a
 * revoked code stops working.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from './store.js';

type Env = Record<string, string | undefined>;

const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I
const K = {
  secret: 'ow:patron:secret',
  minted: 'ow:patron:minted',
  used: 'ow:patron:used',
  revoked: 'ow:patron:revoked',
};
export const MINT_MAX = 500;
export const CODE_RE = /^PATRON-([2-9A-HJ-NP-Z]{6})-([2-9A-HJ-NP-Z]{8})$/;

export class PatronError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function enc(bytes: Buffer, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i]! % ALPHA.length];
  return out;
}

export function normalizeCode(raw: unknown): string {
  const s = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  // Accept with or without dashes / the PATRON prefix.
  const body = s.startsWith('PATRON') ? s.slice(6) : s;
  if (body.length !== 14) return '';
  const code = `PATRON-${body.slice(0, 6)}-${body.slice(6)}`;
  return CODE_RE.test(code) ? code : '';
}

async function secretOf(store: Store, env: Env, create: boolean): Promise<string | null> {
  const fromEnv = env.PATRON_SECRET ?? '';
  if (fromEnv.length >= 16) return fromEnv;
  if (!store.durable && env.OW_ALLOW_MEMORY_ACCOUNTS !== '1') return null;
  const [have] = (await store.pipe([['GET', K.secret]])) as (string | null)[];
  if (have) return have;
  if (!create) return null;
  await store.pipe([['SET', K.secret, randomBytes(32).toString('hex'), 'NX']]);
  const [now] = (await store.pipe([['GET', K.secret]])) as (string | null)[];
  return now ?? null;
}

function sign(secret: string, serial: string): string {
  return enc(createHmac('sha256', secret).update(`patron:${serial}`).digest(), 8);
}

/** Is this a live patron code? (Signed by this table, and not revoked.) */
export async function checkCode(store: Store, raw: unknown, env: Env = process.env): Promise<string | null> {
  const code = normalizeCode(raw);
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const secret = await secretOf(store, env, false);
  if (!secret) return null;
  const want = Buffer.from(sign(secret, m[1]!));
  const got = Buffer.from(m[2]!);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (store.durable || env.OW_ALLOW_MEMORY_ACCOUNTS === '1') {
    const [rev] = (await store.pipe([['HGET', K.revoked, code]])) as (string | null)[];
    if (rev) return null;
  }
  return code;
}

export async function redeemCode(store: Store, raw: unknown, env: Env = process.env): Promise<string> {
  const code = await checkCode(store, raw, env);
  if (!code) throw new PatronError(400, 'That patron code is not one of ours.');
  if (store.durable || env.OW_ALLOW_MEMORY_ACCOUNTS === '1') await store.pipe([['HINCRBY', K.used, code, 1]]);
  return code;
}

export type MintedCode = { code: string; note: string; at: number; used: number; revoked: boolean };

export async function mintCodes(store: Store, n: unknown, note: unknown, now = Date.now(), env: Env = process.env): Promise<string[]> {
  const count = Math.max(1, Math.min(20, Math.floor(Number(n) || 1)));
  const secret = await secretOf(store, env, true);
  if (!secret) throw new PatronError(503, 'Patron codes need the ledger store (or a PATRON_SECRET).');
  const [len] = (await store.pipe([['LLEN', K.minted]])) as number[];
  if ((len ?? 0) + count > MINT_MAX) throw new PatronError(400, `The patron book is full (${MINT_MAX}).`);
  const label = typeof note === 'string' ? note.replace(/[\u0000-\u001f]/g, '').slice(0, 60) : '';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const serial = enc(randomBytes(6), 6);
    codes.push(`PATRON-${serial}-${sign(secret, serial)}`);
  }
  await store.pipe(codes.map((code) => ['RPUSH', K.minted, JSON.stringify({ code, note: label, at: now })]));
  return codes;
}

export async function listCodes(store: Store): Promise<MintedCode[]> {
  const [rows, used, revoked] = (await store.pipe([
    ['LRANGE', K.minted, 0, MINT_MAX],
    ['HGETALL', K.used],
    ['HGETALL', K.revoked],
  ])) as [string[] | null, unknown, unknown];
  const asMap = (v: unknown): Record<string, string> => {
    if (Array.isArray(v)) {
      const o: Record<string, string> = {};
      for (let i = 0; i + 1 < v.length; i += 2) o[String(v[i])] = String(v[i + 1]);
      return o;
    }
    return (v && typeof v === 'object' ? v : {}) as Record<string, string>;
  };
  const u = asMap(used);
  const r = asMap(revoked);
  const out: MintedCode[] = [];
  for (const raw of rows ?? []) {
    try {
      const o = JSON.parse(raw) as { code?: string; note?: string; at?: number };
      if (!o.code) continue;
      out.push({ code: o.code, note: o.note ?? '', at: Number(o.at) || 0, used: Number(u[o.code] ?? 0), revoked: !!r[o.code] });
    } catch {
      /* skip */
    }
  }
  return out.reverse();
}

export async function revokeCode(store: Store, raw: unknown): Promise<void> {
  const code = normalizeCode(raw);
  if (!code) throw new PatronError(400, 'Not a patron code.');
  await store.pipe([['HSET', K.revoked, code, '1']]);
}
