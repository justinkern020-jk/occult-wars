import { afterEach, describe, expect, it } from 'vitest';
import { memoryStore, redisStore, setStoreForTests, type Store } from './store.js';
import { listAccounts, signUp, takeName } from './accounts.js';
import { handleWatch } from '../_routes/watch.js';

/** A durable store (Upstash REST shape) answered from memory. */
function durable(): Store {
  const mem = memoryStore();
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const cmds = JSON.parse(String(init?.body)) as string[][];
    const out = await mem.pipe(cmds);
    return new Response(JSON.stringify(out.map((result) => ({ result }))), { status: 200 });
  }) as unknown as typeof fetch;
  return redisStore('https://example.upstash.io', 'tok', fetcher);
}

const KEY = 'owner-key-for-the-accounts-tests';
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x/api/watch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

async function seat(store: Store, email: string, name: string | null, at: number) {
  const { user } = await signUp(store, { email, password: 'password-123' }, at);
  if (name) await takeName(store, user, name);
}

describe('owner account roll', () => {
  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OWNER_KEY;
  });

  it('lists every claimed name newest first, in display case, without emails or hashes', async () => {
    const store = durable();
    await seat(store, 'a@x.io', 'Old Hand', 1_000);
    await seat(store, 'b@x.io', 'MiddleOne', 2_000);
    await seat(store, 'c@x.io', null, 3_000); // never took a name: not on the roll
    await seat(store, 'd@x.io', 'newest', 4_000);
    const r = await listAccounts(store);
    expect(r.truncated).toBe(false);
    expect(r.accounts.map((a) => [a.username, a.createdAt])).toEqual([
      ['newest', 4_000],
      ['MiddleOne', 2_000],
      ['Old Hand', 1_000],
    ]);
    const text = JSON.stringify(r);
    for (const bad of ['@x.io', 'hash', 'salt', 'email', 'token']) expect(text).not.toContain(bad);
    expect(r.accounts[0]).toEqual({ username: 'newest', createdAt: 4_000, lastSignInAt: null, country: null });
  });

  it('caps the scan', async () => {
    const store = durable();
    for (let i = 0; i < 5; i++) await seat(store, `p${i}@x.io`, `Name${i}`, i);
    const r = await listAccounts(store, 3);
    expect(r.accounts).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('is owner-only: a bare 404 otherwise', async () => {
    process.env.OWNER_KEY = KEY;
    const store = durable();
    setStoreForTests(store);
    await seat(store, 'e@x.io', 'Visible', 10);
    const anon = await handleWatch(req({ op: 'accounts' }));
    expect(anon.status).toBe(404);
    expect(await anon.json()).toEqual({ ok: false });
    const wrong = await handleWatch(req({ op: 'accounts' }, { 'x-ow-owner-key': 'x'.repeat(40) }));
    expect(wrong.status).toBe(404);
    const ok = await handleWatch(req({ op: 'accounts' }, { 'x-ow-owner-key': KEY }));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { accounts: { username: string }[] };
    expect(body.accounts.map((a) => a.username)).toEqual(['Visible']);
  });
});
