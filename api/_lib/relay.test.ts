import { describe, expect, it } from 'vitest';
import { memoryStore } from './store.js';
import { hostRoom, leaveRoom, pullItems, pushItems, quickBeat, quickMatch } from './relay.js';
import { route } from '../[fn].js';

const HID = 'aaaaaaaaaaaaaaaa';
const HID2 = 'bbbbbbbbbbbbbbbb';
const GID = 'cccccccccccccccc';

describe('relay', () => {
  it('one host per room; a fresh claim empties the inbox; leave frees it', async () => {
    const s = memoryStore();
    expect(await hostRoom(s, 'ABCD', HID)).toEqual({ ok: true });
    expect(await hostRoom(s, 'ABCD', HID)).toEqual({ ok: true });
    expect(await hostRoom(s, 'ABCD', HID2)).toEqual({ ok: false, taken: true });
    await pushItems(s, 'ABCD', 'h', [{ k: 'syn', gid: GID }]);
    await leaveRoom(s, 'ABCD', HID);
    expect(await pushItems(s, 'ABCD', 'h', [{ k: 'syn', gid: GID }])).toEqual({ ok: false, nohost: true });
    expect(await hostRoom(s, 'ABCD', HID2)).toEqual({ ok: true });
    expect((await pullItems(s, 'ABCD', 'h', 0, HID2)).items).toEqual([]);
  });

  it('carries envelopes in order from a cursor', async () => {
    const s = memoryStore();
    await hostRoom(s, 'WXYZ', HID);
    await pushItems(s, 'WXYZ', 'h', [{ k: 'syn', gid: GID }, { k: 'msg', gid: GID, m: { v: 1, type: 'ping' } }]);
    const a = await pullItems(s, 'WXYZ', 'h', 0, HID);
    expect(a.items.map((x) => (x as { k: string }).k)).toEqual(['syn', 'msg']);
    expect(a.next).toBe(2);
    await pushItems(s, 'WXYZ', `g:${GID}`, [{ k: 'ack', gid: GID }]);
    expect((await pullItems(s, 'WXYZ', `g:${GID}`, 0)).items).toEqual([{ k: 'ack', gid: GID }]);
    expect((await pullItems(s, 'WXYZ', 'h', 2, HID)).items).toEqual([]);
  });

  it('rejects bad rooms, boxes and floods', async () => {
    const s = memoryStore();
    await expect(pushItems(s, 'abcd', 'h', [{}])).rejects.toThrow();
    await expect(pushItems(s, 'ABCD', 'x', [{}])).rejects.toThrow();
    await expect(pushItems(s, 'ABCD', `g:${GID}`, [])).rejects.toThrow();
  });

  it('quick match pairs the second seeker with the first room, once', async () => {
    const s = memoryStore();
    const a = await quickMatch(s, GID);
    expect(a.role).toBe('host');
    expect(await quickBeat(s, a.room, GID)).toEqual({ ok: true, waiting: true });
    const b = await quickMatch(s, HID);
    expect(b).toEqual({ ok: true, role: 'guest', room: a.room });
    expect(await quickBeat(s, a.room, GID)).toEqual({ ok: true, waiting: false });
    const c = await quickMatch(s, HID2);
    expect(c.role).toBe('host');
    expect(c.room).not.toBe(a.room);
  });

  it('is served at /api/relay', async () => {
    const res = await route(
      new Request('https://x/api/relay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'pull', room: 'QQQQ', box: 'h', from: 0 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, items: [] });
  });
});
