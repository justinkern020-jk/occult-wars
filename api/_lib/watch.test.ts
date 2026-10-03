import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, redisStore, setStoreForTests, type Store } from './store.js';
import { FRAME_MAX, LIVE_MS, isOwner, listLive, reportLive, sendCode, viewMatch } from './watch.js';
import { handleWatch } from '../watch.js';
import { handleTable } from '../table.js';
import { handleAccount } from '../account.js';

const ID = 'abcdefghij0123456789';
const KEY = 'k'.repeat(40);
const MARK = 'mmmmmmmmmmmmmmmm';
const summary = {
  mode: 'training',
  era: 'first',
  map: 'Crossroads',
  turn: 3,
  side: 'blue',
  phase: 'main',
  blue: { name: 'Ada', faction: 'fae', leader: 'Titania' },
  red: { name: 'Expert rival', faction: 'witch', leader: 'Baba' },
  over: false,
};

/** A durable store (Upstash REST shape) answered from memory. */
function durable(clock: () => number = Date.now): Store {
  const mem = memoryStore(clock);
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const cmds = JSON.parse(String(init?.body)) as string[][];
    const out = await mem.pipe(cmds);
    return new Response(JSON.stringify(out.map((result) => ({ result }))), { status: 200 });
  }) as unknown as typeof fetch;
  return redisStore('https://example.upstash.io', 'tok', fetcher);
}

const watchReq = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x/api/watch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('portal store', () => {
  let t = 5_000_000;
  let store: Store;
  beforeEach(() => {
    t = 5_000_000;
    store = memoryStore(() => t);
  });

  it('lists live matches and lets them lapse', async () => {
    const r = await reportLive(store, { id: ID, key: KEY, summary }, t);
    expect(r).toEqual({ ok: true, watched: false, cmds: [] });
    const live = await listLive(store, t);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: ID, turn: 3, era: 'first', blue: { name: 'Ada' } });
    t += LIVE_MS + 1;
    expect(await listLive(store, t)).toEqual([]);
  });

  it('only the first reporter holds a match id', async () => {
    await reportLive(store, { id: ID, key: KEY, summary }, t);
    await expect(
      reportLive(store, { id: ID, key: 'z'.repeat(40), summary }, t),
    ).rejects.toMatchObject({ status: 403 });
    await expect(reportLive(store, { id: 'bad', key: KEY, summary }, t)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('watching asks for frames; codes queue once to the reporter', async () => {
    await reportLive(store, { id: ID, key: KEY, summary }, t);
    const v = await viewMatch(store, ID);
    expect(v.summary?.id).toBe(ID);
    expect(v.frame).toBeNull();
    const r = await reportLive(store, { id: ID, key: KEY, summary, frame: { turn: 3 } }, t);
    expect(r.watched).toBe(true);
    expect((await viewMatch(store, ID)).frame).toEqual({ turn: 3 });

    const a = await sendCode(store, { id: ID, side: 'red', code: 'seth' }, t);
    const b = await sendCode(store, { id: ID, side: 'blue', code: 'adept' }, t);
    expect(b.n).toBeGreaterThan(a.n);
    const got = await reportLive(store, { id: ID, key: KEY, summary }, t);
    expect(got.cmds.map((c) => [c.side, c.code])).toEqual([
      ['red', 'seth'],
      ['blue', 'adept'],
    ]);
    // Delivered once.
    expect((await reportLive(store, { id: ID, key: KEY, summary }, t)).cmds).toEqual([]);
  });

  it('refuses unknown codes, sides and closed matches', async () => {
    await reportLive(store, { id: ID, key: KEY, summary }, t);
    await expect(sendCode(store, { id: ID, side: 'red', code: 'battle count' }, t)).rejects.toMatchObject({ status: 400 });
    await expect(sendCode(store, { id: ID, side: 'green', code: 'seth' }, t)).rejects.toMatchObject({ status: 400 });
    await expect(
      sendCode(store, { id: 'zzzzzzzzzzzzzzzzzzzz', side: 'red', code: 'seth' }, t),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses oversized frames', async () => {
    await expect(
      reportLive(store, { id: ID, key: KEY, summary, frame: { log: ['x'.repeat(FRAME_MAX + 10)] } }, t),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe('portal gate', () => {
  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OW_ALLOW_MEMORY_ACCOUNTS;
    delete process.env.OWNER_EMAILS;
    delete process.env.OWNER_KEY;
  });

  it('owner key opens the door only while no durable account store exists', async () => {
    const env = { OWNER_KEY: 'a-very-long-owner-secret' };
    const mem = memoryStore();
    const with_ = watchReq({}, { 'x-ow-owner-key': env.OWNER_KEY });
    expect(await isOwner(with_, mem, env)).toBe(true);
    expect(await isOwner(watchReq({}, { 'x-ow-owner-key': 'a-very-long-owner-secreT' }), mem, env)).toBe(false);
    expect(await isOwner(watchReq({}), mem, env)).toBe(false);
    expect(await isOwner(with_, mem, { OWNER_KEY: 'short' })).toBe(false);
    expect(await isOwner(with_, durable(), env)).toBe(false);
  });

  it('a signed-in owner seat opens it on a durable store; others get a bare 404', async () => {
    setStoreForTests(durable());
    process.env.OWNER_EMAILS = 'Owner@Example.com';
    const up = async (email: string) => {
      const res = await handleAccount(
        new Request('https://x/api/account', {
          method: 'POST',
          body: JSON.stringify({ op: 'signup', email, password: 'hunter2hunter2' }),
        }),
      );
      return ((await res.json()) as { token: string }).token;
    };
    const owner = await up('owner@example.com');
    const other = await up('someone@example.com');
    expect(owner).toMatch(/^[0-9a-f]{64}$/);

    const no = await handleWatch(watchReq({ op: 'gate' }, { authorization: `Bearer ${other}` }));
    expect(no.status).toBe(200);
    expect(await no.json()).toEqual({ ok: false });
    const noList = await handleWatch(watchReq({ op: 'list' }, { authorization: `Bearer ${other}` }));
    expect(noList.status).toBe(404);
    expect(await noList.json()).toEqual({ ok: false });
    expect((await handleWatch(watchReq({ op: 'list' }))).status).toBe(404);
    expect((await handleWatch(watchReq({ op: 'view', id: ID }))).status).toBe(404);
    expect((await handleWatch(new Request('https://x/api/watch'))).status).toBe(404);

    const auth = { authorization: `Bearer ${owner}` };
    expect(await (await handleWatch(watchReq({ op: 'gate' }, auth))).json()).toMatchObject({ ok: true });

    // A match reports over /api/table; the owner lists, views and sends a code.
    const live = await handleTable(
      new Request('https://x/api/table', {
        method: 'POST',
        body: JSON.stringify({ op: 'live', mark: MARK, id: ID, key: KEY, summary }),
      }),
    );
    expect(await live.json()).toMatchObject({ ok: true, watched: false, cmds: [] });
    const list = (await (await handleWatch(watchReq({ op: 'list' }, auth))).json()) as {
      matches: { id: string }[];
    };
    expect(list.matches.map((m) => m.id)).toEqual([ID]);
    expect((await handleWatch(watchReq({ op: 'view', id: ID }, auth))).status).toBe(200);
    const sent = await handleWatch(watchReq({ op: 'code', id: ID, side: 'red', code: 'seth' }, auth));
    expect(sent.status).toBe(200);
    // Not the owner: cannot send.
    expect((await handleWatch(watchReq({ op: 'code', id: ID, side: 'red', code: 'seth' }))).status).toBe(404);

    const back = (await (
      await handleTable(
        new Request('https://x/api/table', {
          method: 'POST',
          body: JSON.stringify({ op: 'live', mark: MARK, id: ID, key: KEY, summary }),
        }),
      )
    ).json()) as { watched: boolean; cmds: { side: string; code: string }[] };
    expect(back.watched).toBe(true);
    expect(back.cmds.map((c) => [c.side, c.code])).toEqual([['red', 'seth']]);
  });
});
