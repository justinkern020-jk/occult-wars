import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, redisStore, setStoreForTests, type Store } from './store.js';
import { CHALLENGE_MS, SEEN_WINDOW_MS, accept, beat, cancel, issue } from './table.js';
import { handleTable } from '../table.js';
import { handleAccount } from '../account.js';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccc';

/** Upstash REST shape, answered by the memory executor (all args as strings). */
function fakeUpstash(clock: () => number): Store {
  const mem = memoryStore(clock);
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const cmds = JSON.parse(String(init?.body)) as string[][];
    const out = await mem.pipe(cmds);
    return new Response(JSON.stringify(out.map((result) => ({ result }))), { status: 200 });
  }) as unknown as typeof fetch;
  return redisStore('https://example.upstash.io', 'tok', fetcher);
}

for (const [label, make] of [
  ['memory', (clock: () => number) => memoryStore(clock)],
  ['redis-rest', fakeUpstash],
] as const) {
  describe(`table (${label})`, () => {
    let t = 1_000_000;
    let store: Store;
    beforeEach(() => {
      t = 1_000_000;
      store = make(() => t);
    });

    it('counts hands seated in the window and their countries', async () => {
      await beat(store, A, 'US', t);
      await beat(store, B, 'DE', t);
      const v = await beat(store, C, null, t);
      expect(v.playing).toBe(3);
      expect(v.others.sort()).toEqual(['DE', 'US']);
      expect(v.you).toBeNull();
      t += SEEN_WINDOW_MS + 1;
      const later = await beat(store, A, 'US', t);
      expect(later.playing).toBe(1);
      expect(later.others).toEqual([]);
      // Check-ins are a stored tally of distinct marks, not live.
      expect(later.checkins).toEqual([
        { country: 'DE', n: 1 },
        { country: 'US', n: 1 },
      ]);
    });

    it('a mark checks in once per country tally', async () => {
      await beat(store, A, 'US', t);
      await beat(store, A, 'US', t + 1);
      await beat(store, B, 'US', t + 2);
      const v = await beat(store, C, 'CA', t + 3);
      expect(v.checkins).toEqual([
        { country: 'US', n: 2 },
        { country: 'CA', n: 1 },
      ]);
    });

    it('one challenge at a time; first answer sits down', async () => {
      expect((await issue(store, A, 'ROOM', t)).ok).toBe(true);
      expect((await issue(store, B, 'OTHR', t)).ok).toBe(false);
      const seenByB = await beat(store, B, null, t + 1000);
      expect(seenByB.challenge).toMatchObject({ room: 'ROOM', mine: false });
      expect(seenByB.challenge!.left).toBe(CHALLENGE_MS - 1000);
      const seenByA = await beat(store, A, null, t + 1000);
      expect(seenByA.challenge?.mine).toBe(true);
      expect((await accept(store, A, 'ROOM', t + 2000)).ok).toBe(false); // own challenge
      expect((await accept(store, B, 'ROOM', t + 2000)).ok).toBe(true);
      expect((await accept(store, C, 'ROOM', t + 2100)).ok).toBe(false);
      expect((await beat(store, C, null, t + 2200)).challenge).toBeNull();
    });

    it('challenges lapse after sixty seconds and can be called off', async () => {
      await issue(store, A, 'ROOM', t);
      t += CHALLENGE_MS + 5;
      expect((await beat(store, B, null, t)).challenge).toBeNull();
      expect((await accept(store, B, 'ROOM', t)).ok).toBe(false);
      expect((await issue(store, B, 'NEXT', t)).ok).toBe(true);
      await cancel(store, A); // not A's — stays
      expect((await beat(store, C, null, t)).challenge?.room).toBe('NEXT');
      await cancel(store, B);
      expect((await beat(store, C, null, t)).challenge).toBeNull();
    });
  });
}

describe('/api/table handler', () => {
  beforeEach(() => setStoreForTests(memoryStore()));
  afterEach(() => setStoreForTests(null));

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    handleTable(
      new Request('https://x/api/table', {
        method: 'POST',
        body: JSON.stringify(body),
        headers,
      }),
    );

  it('reads the visitor country from the Vercel header', async () => {
    const res = await post({ op: 'beat', mark: A }, { 'x-vercel-ip-country': 'gb' });
    const v = await res.json();
    expect(v).toMatchObject({ ok: true, playing: 1, you: 'GB', store: 'memory' });
  });

  it('rejects bad marks and rooms', async () => {
    expect((await post({ op: 'beat', mark: 'nope' })).status).toBe(400);
    expect((await post({ op: 'issue', mark: A, room: 'abc' })).status).toBe(400);
  });

  it('issue → accept over HTTP', async () => {
    expect(await (await post({ op: 'issue', mark: A, room: 'WXYZ' })).json()).toEqual({ ok: true });
    expect(await (await post({ op: 'accept', mark: B, room: 'WXYZ' })).json()).toEqual({ ok: true });
  });
});

describe('/api/account handler', () => {
  let jar = '';
  const call = async (method: 'GET' | 'POST', body?: unknown, query = '') => {
    const res = await handleAccount(
      new Request(`https://x/api/account${query}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: jar ? { cookie: jar } : {},
      }),
    );
    const set = res.headers.get('set-cookie');
    if (set) jar = set.split(';')[0]!;
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OW_ALLOW_MEMORY_ACCOUNTS;
    jar = '';
  });

  it('stays shut on instance memory', async () => {
    setStoreForTests(memoryStore());
    const r = await call('GET', undefined, '?op=book');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, shut: true });
    const w = await call('POST', { op: 'signup', email: 'a@b.co', password: 'hunter2hunter2' });
    expect(w.status).toBe(503);
    expect(w.body.shut).toBe(true);
  });

  it('seat, name, record, book and cloud profile', async () => {
    setStoreForTests(memoryStore());
    process.env.OW_ALLOW_MEMORY_ACCOUNTS = '1';
    expect((await call('GET')).body.seat).toBeNull();
    const up = await call('POST', { op: 'signup', email: 'Ada@Example.com', password: 'hunter2hunter2', name: 'Ada' });
    expect(up.status).toBe(200);
    expect(jar.startsWith('ow_session=')).toBe(true);
    expect((await call('POST', { op: 'signup', email: 'ada@example.com', password: 'xxxxxxxxx' })).status).toBe(409);
    expect(((await call('GET')).body.seat as { email: string }).email).toBe('ada@example.com');

    const named = await call('POST', { op: 'name', username: 'Ada Lovelace' });
    expect((named.body.seat as { username: string }).username).toBe('Ada Lovelace');
    await call('POST', { op: 'record', won: true, table: true });
    await call('POST', { op: 'record', won: false, table: false });
    const me = (await call('GET')).body.seat as Record<string, number>;
    expect([me.tableWins, me.tableLosses, me.practiceWins, me.practiceLosses]).toEqual([1, 0, 0, 1]);
    expect((await call('GET', undefined, '?op=book')).body.book).toEqual([
      { username: 'Ada Lovelace', tableWins: 1, tableLosses: 0 },
    ]);

    expect((await call('POST', { op: 'profile', profile: { version: 1, username: 'Ada' } })).body.ok).toBe(true);
    expect((await call('GET', undefined, '?op=profile')).body.profile).toEqual({ version: 1, username: 'Ada' });

    await call('POST', { op: 'signout' });
    expect((await call('GET')).body.seat).toBeNull();
    expect((await call('POST', { op: 'signin', email: 'ada@example.com', password: 'wrong-wrong' })).status).toBe(401);
    expect((await call('POST', { op: 'signin', email: 'ada@example.com', password: 'hunter2hunter2' })).status).toBe(200);

    // A second seat cannot take the same name.
    const keep = jar;
    jar = '';
    await call('POST', { op: 'signup', email: 'bo@example.com', password: 'hunter2hunter2' });
    expect((await call('POST', { op: 'name', username: 'ada lovelace' })).status).toBe(409);
    jar = keep;
  });
});
