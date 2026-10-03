import { describe, expect, it } from 'vitest';
import { memoryStore } from './store.js';
import { beat, cleanActivity, listHands, serverBuild, SEEN_WINDOW_MS } from './table.js';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';

describe('the owner roll', () => {
  it('cleans what a hand says it is doing', () => {
    expect(cleanActivity(null)).toBeNull();
    const a = cleanActivity({ where: 'field', mode: 'training', era: 'first', match: 'abcdefabcdef12', name: 'Ada\u0000 Lovelace', build: 'abc123', seat: true });
    expect(a).toMatchObject({ where: 'field', mode: 'training', name: 'Ada Lovelace', match: 'abcdefabcdef12', seat: true });
    const bad = cleanActivity({ where: '<script>', mode: 'x y', match: 'NOPE', build: 'Z!' })!;
    expect(bad.where).toBe('menu');
    expect(bad.mode).toBe('');
    expect(bad.match).toBe('');
    expect(bad.build).toBe('');
  });

  it('lists every hand with activity, country and time online; never the mark', async () => {
    let t = 1_000_000;
    const store = memoryStore(() => t);
    await beat(store, A, 'US', t, cleanActivity({ where: 'menu', name: 'Ada' }), 'b1');
    t += 30_000;
    await beat(store, A, 'US', t, cleanActivity({ where: 'deck', name: 'Ada' }), 'b1');
    t += 30_000;
    await beat(store, A, 'US', t, cleanActivity({ where: 'field', mode: 'campaign', era: 'first', match: 'abcdefabcdef12', name: 'Ada' }), 'b1');
    await beat(store, B, 'FR', t, null, 'b1'); // an older page: no activity
    const view = await beat(store, B, 'FR', t, null, 'b1');
    expect(view.build).toBe('b1');
    const hands = await listHands(store, t);
    expect(hands).toHaveLength(2);
    const ada = hands.find((h) => h.name === 'Ada')!;
    expect(ada).toMatchObject({ where: 'field', mode: 'campaign', country: 'US', known: true, match: 'abcdefabcdef12' });
    expect(t - ada.since).toBe(60_000);
    const old = hands.find((h) => h.name !== 'Ada')!;
    expect(old.known).toBe(false);
    expect(JSON.stringify(hands)).not.toContain(A);
    // A hand that stops beating drops off, and its record with it.
    t += SEEN_WINDOW_MS + 1;
    await beat(store, B, 'FR', t, cleanActivity({ where: 'deck' }), 'b1');
    const after = await listHands(store, t);
    expect(after.map((h) => h.where)).toEqual(['deck']);
  });

  it('reads the deployed build from the platform', () => {
    expect(serverBuild({ VERCEL_GIT_COMMIT_SHA: 'ABCDEF0123456789' })).toBe('abcdef012345');
    expect(serverBuild({})).toBe('');
  });
});
