import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, setStoreForTests } from './store.js';
import { checkCode, listCodes, mintCodes, normalizeCode, redeemCode, revokeCode } from './patron.js';
import { handlePatron } from '../_routes/patron.js';
import { handleWatch } from '../_routes/watch.js';

const OWNER_KEY = 'owner-key-for-the-patron-tests';

describe('patron codes', () => {
  beforeEach(() => {
    process.env.OW_ALLOW_MEMORY_ACCOUNTS = '1';
    delete process.env.PATRON_SECRET;
  });
  afterEach(() => {
    delete process.env.OW_ALLOW_MEMORY_ACCOUNTS;
    delete process.env.OWNER_KEY;
    setStoreForTests(null);
  });

  it('mints signed codes that check, and forged ones that do not', async () => {
    const store = memoryStore();
    const [code] = await mintCodes(store, 1, 'for Seth');
    expect(code).toMatch(/^PATRON-[2-9A-HJ-NP-Z]{6}-[2-9A-HJ-NP-Z]{8}$/);
    expect(await checkCode(store, code)).toBe(code);
    expect(await checkCode(store, code!.toLowerCase().replace(/-/g, ' '))).toBe(code);
    const forged = code!.slice(0, -1) + (code!.endsWith('Z') ? 'Y' : 'Z');
    expect(await checkCode(store, forged)).toBeNull();
    expect(await checkCode(store, 'PATRON-AAAAAA-BBBBBBBB')).toBeNull();
    expect(normalizeCode('nonsense')).toBe('');
  });

  it('counts redemptions, lists with notes, and revokes', async () => {
    const store = memoryStore();
    const [a, b] = await mintCodes(store, 2, 'stream giveaway');
    await redeemCode(store, a);
    await redeemCode(store, a);
    await revokeCode(store, b);
    await expect(redeemCode(store, b)).rejects.toThrow(/not one of ours/);
    const rows = await listCodes(store);
    expect(rows.find((r) => r.code === a)).toMatchObject({ used: 2, revoked: false, note: 'stream giveaway' });
    expect(rows.find((r) => r.code === b)).toMatchObject({ revoked: true });
  });

  it('a PATRON_SECRET keeps codes valid across stores', async () => {
    process.env.PATRON_SECRET = 'a-long-patron-secret-for-tests';
    const [code] = await mintCodes(memoryStore(), 1, '');
    expect(await checkCode(memoryStore(), code)).toBe(code);
  });

  it('redeem door is public; minting is owner-only through the Portal', async () => {
    const store = memoryStore();
    setStoreForTests(store);
    process.env.OWNER_KEY = OWNER_KEY;
    const post = (fn: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
      fn(new Request('https://x/api/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
    expect((await post(handleWatch, { op: 'patronMint', n: 1 })).status).toBe(404);
    const minted = (await (await post(handleWatch, { op: 'patronMint', n: 1, note: 'x' }, { 'x-ow-owner-key': OWNER_KEY })).json()) as { minted: string[] };
    expect(minted.minted).toHaveLength(1);
    const ok = await post(handlePatron, { op: 'redeem', code: minted.minted[0] });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true);
    expect((await post(handlePatron, { op: 'redeem', code: 'PATRON-222222-22222222' })).status).toBe(400);
  });
});
