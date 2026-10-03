import { afterEach, describe, expect, it } from 'vitest';
import { memoryStore, setStoreForTests } from './store.js';
import { recordFound, secretCounts, secretFinders } from './secrets.js';
import { handleTable } from '../_routes/table.js';
import { handleWatch } from '../_routes/watch.js';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const OWNER = 'a-very-long-owner-secret';

function tableReq(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('https://x/api/table', { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('secrets uncovered', () => {
  afterEach(() => {
    setStoreForTests(null);
    delete process.env.OWNER_KEY;
  });

  it('counts each hand once per secret, first find kept', async () => {
    const s = memoryStore();
    expect(await recordFound(s, 'athens', A, 'Ada', null, 10)).toBe(true);
    expect(await recordFound(s, 'athens', A, 'Ada again', null, 20)).toBe(false);
    expect(await recordFound(s, 'athens', B, 'Bea', 'bea', 30)).toBe(true);
    expect(await recordFound(s, 'seth', B, '<b>x</b>', null, 40)).toBe(true);
    const c = await secretCounts(s);
    expect(c).toMatchObject({ athens: 2, seth: 1, second: 0, justin: 0, southhaven: 0, battlecount: 0 });
    const f = await secretFinders(s);
    expect(f.athens).toEqual([
      { name: 'Ada', account: null, at: 10 },
      { name: 'Bea', account: 'bea', at: 30 },
    ]);
    expect(f.seth[0]!.name).toBe('(no name)');
  });

  it('over the route: public counts, owner finds skipped, finders for the owner only', async () => {
    setStoreForTests(memoryStore());
    process.env.OWNER_KEY = OWNER;
    const found = await handleTable(tableReq({ op: 'found', mark: A, secret: 'justin', name: 'Ada' }));
    expect(await found.json()).toEqual({ ok: true, counted: true });
    const mine = await handleTable(
      tableReq({ op: 'found', mark: B, secret: 'justin', name: 'Justin' }, { 'x-ow-owner-key': OWNER }),
    );
    expect(await mine.json()).toMatchObject({ owner: true, counted: false });
    expect((await handleTable(tableReq({ op: 'found', mark: A, secret: 'nope' }))).status).toBe(400);
    const counts = (await (await handleTable(tableReq({ op: 'secrets', mark: A }))).json()) as {
      counts: Record<string, number>;
    };
    expect(counts.counts.justin).toBe(1);
    const watch = (h: Record<string, string>) =>
      handleWatch(new Request('https://x/api/watch', { method: 'POST', headers: h, body: JSON.stringify({ op: 'secrets' }) }));
    expect((await watch({})).status).toBe(404);
    const owner = (await (await watch({ 'x-ow-owner-key': OWNER })).json()) as {
      finders: Record<string, { name: string }[]>;
    };
    expect(owner.finders.justin!.map((r) => r.name)).toEqual(['Ada']);
  });
});
