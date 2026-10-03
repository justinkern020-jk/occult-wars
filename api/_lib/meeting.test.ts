import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, setStoreForTests, type Store } from './store.js';
import {
  IP_PER_10S,
  KEEP,
  TEXT_MAX,
  cleanName,
  cleanText,
  deleteMeeting,
  listMeeting,
  maskProfanity,
  postMeeting,
  spamReason,
  type Poster,
} from './meeting.js';
import { handleMeeting } from '../_routes/meeting.js';
import { handleAccount } from '../_routes/account.js';

const guest = (mark: string, ip = '1.1.1.1'): Poster => ({ owner: false, seatId: null, seatName: null, mark, ip });
const M1 = 'aaaaaaaaaaaaaaaa';
const M2 = 'bbbbbbbbbbbbbbbb';

describe('meeting text', () => {
  it('cleans, caps and masks', () => {
    expect(cleanText('  hi\u0000 \t there \n\n\n\nfriend ')).toBe('hi there \n\nfriend');
    expect(cleanText('x'.repeat(900))).toHaveLength(TEXT_MAX);
    expect(maskProfanity('well fuck that, Shitty luck')).toBe('well f✶✶✶ that, S✶✶✶✶✶ luck');
    expect(maskProfanity('Scunthorpe classic assess')).toBe('Scunthorpe classic assess');
    expect(cleanText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // stored as text, rendered as text
  });
  it('refuses links, shouting and stretched letters (not for the owner)', () => {
    expect(spamReason('visit https://spam.example', false)).toMatch(/Links/);
    expect(spamReason('join discord.gg/abc', false)).toMatch(/Links/);
    expect(spamReason('cheap at freecoins.xyz', false)).toMatch(/Links/);
    expect(spamReason('aaaaaaaaaaaaaaaaaaaa', false)).toBeTruthy();
    expect(spamReason('THIS IS A VERY LOUD MESSAGE INDEED', false)).toMatch(/shout/);
    expect(spamReason('Good game. The Rune Colonel is strong.', false)).toBeNull();
    expect(spamReason('see https://occult-wars.vercel.app', true)).toBeNull();
  });
  it('names: letters and numbers; reserved names refused for guests', () => {
    expect(cleanName('  Ada  Lovelace ')).toBe('Ada Lovelace');
    expect(cleanName('<b>')).toBeNull();
    expect(cleanName('')).toBeNull();
  });
});

describe('meeting store', () => {
  let t = 1_000_000;
  let store: Store;
  beforeEach(() => {
    t = 1_000_000;
    store = memoryStore(() => t);
  });

  it('posts, lists since, rate-limits, keeps the newest', async () => {
    const a = await postMeeting(store, guest(M1), { text: 'hello', name: 'Ada' }, t);
    expect(a).toMatchObject({ id: 1, name: 'Ada', badge: 'guest', text: 'hello' });
    await expect(postMeeting(store, guest(M1), { text: 'again', name: 'Ada' }, t)).rejects.toMatchObject({ status: 429 });
    // Another hand behind the same address may still speak.
    await postMeeting(store, guest(M2), { text: 'hi Ada', name: 'Bo' }, t);
    t += 5_001;
    await postMeeting(store, guest(M1), { text: 'again', name: 'Ada' }, t);
    const all = await listMeeting(store);
    expect(all.msgs.map((m) => m.text)).toEqual(['hello', 'hi Ada', 'again']);
    expect(all.head).toBe(3);
    expect((await listMeeting(store, 2)).msgs.map((m) => m.id)).toEqual([3]);
  });

  it('a shared address has a ceiling', async () => {
    const marks = Array.from({ length: IP_PER_10S + 1 }, (_, i) => String(i).padStart(16, 'c'));
    for (const m of marks.slice(0, IP_PER_10S)) await postMeeting(store, guest(m), { text: 'hi', name: 'Crowd' }, t);
    await expect(postMeeting(store, guest(marks[IP_PER_10S]!), { text: 'hi', name: 'Crowd' }, t)).rejects.toMatchObject({ status: 429 });
  });

  it('guests cannot take lodge names; owner posts as Grand Master', async () => {
    await expect(postMeeting(store, guest(M1), { text: 'hi', name: 'Grand Master' }, t)).rejects.toMatchObject({ status: 400 });
    await expect(postMeeting(store, guest(M1), { text: 'hi', name: 'justin kern' }, t)).rejects.toMatchObject({ status: 400 });
    await expect(postMeeting(store, guest(M1), { text: 'hi', name: '' }, t)).rejects.toMatchObject({ status: 400 });
    const o = await postMeeting(store, { ...guest(M1), owner: true }, { text: 'Welcome', name: '' }, t);
    expect(o).toMatchObject({ name: 'Grand Master', badge: 'owner' });
    const o2 = await postMeeting(store, { ...guest(M1), owner: true }, { text: 'Again', name: '' }, t);
    expect(o2.id).toBe(o.id + 1); // the owner is not rate-limited
  });

  it('keeps only the newest messages; strikes bump the revision', async () => {
    for (let i = 0; i < KEEP + 5; i++) {
      await postMeeting(store, { ...guest(M1), owner: true }, { text: `m${i}`, name: '' }, t);
    }
    const all = await listMeeting(store);
    expect(all.msgs).toHaveLength(KEEP);
    expect(all.msgs[0]!.text).toBe('m5');
    await deleteMeeting(store, all.msgs[0]!.id);
    const after = await listMeeting(store);
    expect(after.msgs).toHaveLength(KEEP - 1);
    expect(after.rev).toBe(all.rev + 1);
  });
});

describe('/api/meeting handler', () => {
  const OWNER_KEY = 'owner-key-for-the-meeting-tests';
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    handleMeeting(
      new Request('https://x/api/meeting', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': headers.ip ?? '9.9.9.9', ...headers },
        body: JSON.stringify(body),
      }),
    );
  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OWNER_KEY;
    delete process.env.OW_ALLOW_MEMORY_ACCOUNTS;
  });

  it('guest, signed-in seat and owner; only the owner strikes', async () => {
    setStoreForTests(memoryStore());
    process.env.OWNER_KEY = OWNER_KEY;
    process.env.OW_ALLOW_MEMORY_ACCOUNTS = '1';
    const g = await call({ op: 'post', mark: M1, text: 'first', name: 'Ada' }, { ip: '1.0.0.1' });
    expect(g.status).toBe(200);
    expect((await call({ op: 'post', mark: 'bad', text: 'x', name: 'Ada' })).status).toBe(400);

    const up = await handleAccount(
      new Request('https://x/api/account', {
        method: 'POST',
        body: JSON.stringify({ op: 'signup', email: 'cy@example.com', password: 'hunter2hunter2', name: 'Cy' }),
      }),
    );
    const { token } = (await up.json()) as { token: string };
    const s = await call(
      { op: 'post', mark: M2, text: 'seated', name: 'Grand Master' },
      { authorization: `Bearer ${token}`, ip: '1.0.0.2' },
    );
    expect(((await s.json()) as { msg: { name: string; badge: string } }).msg).toMatchObject({ name: 'Cy', badge: 'seat' });

    const o = await call({ op: 'post', mark: M1, text: 'From the chair', name: '' }, { 'x-ow-owner-key': OWNER_KEY });
    expect(((await o.json()) as { msg: { badge: string } }).msg.badge).toBe('owner');

    const list = (await (await call({ op: 'list' })).json()) as { msgs: { id: number; badge: string }[]; owner: boolean; rev: number };
    expect(list.owner).toBe(false);
    expect(list.msgs.map((m) => m.badge)).toEqual(['guest', 'seat', 'owner']);
    expect(((await (await call({ op: 'list' }, { 'x-ow-owner-key': OWNER_KEY })).json()) as { owner: boolean }).owner).toBe(true);

    expect((await call({ op: 'delete', id: list.msgs[0]!.id })).status).toBe(404);
    expect((await call({ op: 'delete', id: list.msgs[0]!.id }, { 'x-ow-owner-key': 'wrong-wrong-wrong-wrong' })).status).toBe(404);
    expect((await call({ op: 'delete', id: list.msgs[0]!.id }, { 'x-ow-owner-key': OWNER_KEY })).status).toBe(200);

    // A reader with the old revision gets the whole board again.
    const again = (await (await call({ op: 'list', since: 3, rev: list.rev })).json()) as { full: boolean; msgs: unknown[] };
    expect(again.full).toBe(true);
    expect(again.msgs).toHaveLength(2);
    const quiet = (await (await call({ op: 'list', since: 3, rev: list.rev + 1 })).json()) as { full: boolean; msgs: unknown[] };
    expect(quiet).toMatchObject({ full: false, msgs: [] });
  });
});
