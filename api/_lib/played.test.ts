import { describe, expect, it } from 'vitest';
import { memoryStore } from './store.js';
import { beat, recordPlayed } from './table.js';

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';

describe('matches played by hour', () => {
  it('counts finished matches per hour (the prequel as its own line), one per hand per 20s', async () => {
    const s = memoryStore();
    expect((await beat(s, A, null, 1)).played).toEqual({ first: 0, second: 0, old: 0 });
    expect(await recordPlayed(s, A, 'old')).toEqual({ ok: true, counted: true });
    expect(await recordPlayed(s, A, 'old')).toEqual({ ok: true, counted: false });
    expect(await recordPlayed(s, B, 'old')).toEqual({ ok: true, counted: true });
    await recordPlayed(s, 'cccccccccccccccc', 'first');
    expect(await recordPlayed(s, 'dddddddddddddddd', 'nope')).toEqual({ ok: false });
    expect((await beat(s, A, null, 2)).played).toEqual({ first: 1, second: 0, old: 2 });
  });
});
