import { afterEach, describe, expect, it } from 'vitest';
import { handleRelay } from '../../api/_routes/relay';
import { memoryStore, setStoreForTests } from '../../api/_lib/store';
import { setRelayFetchForTests } from './relay';
import { findQuickMatch, hostFriendSession, joinFriendSession, type FriendMessage, type FriendSession } from './friendSession';

function wire() {
  setStoreForTests(memoryStore());
  setRelayFetchForTests(((url: string, init?: RequestInit) =>
    handleRelay(new Request(`https://x${url}`, init))) as unknown as typeof fetch);
}

const until = async (ok: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('relay-carried Friend Working (no WebRTC)', () => {
  afterEach(() => {
    setRelayFetchForTests(null);
    setStoreForTests(null);
  });

  it('a room links through the relay and moves flow both ways in order', async () => {
    wire();
    const gotHost: FriendMessage[] = [];
    const gotGuest: FriendMessage[] = [];
    let hosting = false;
    let hostOpen = false;
    let guestOpen = false;
    const host = hostFriendSession('RELY', { onHosting: () => (hosting = true), onOpen: () => (hostOpen = true), onMessage: (m) => gotHost.push(m) }, { p2p: false });
    await until(() => hosting);
    let guestClosed = '';
    const guest = joinFriendSession('RELY', { onOpen: () => (guestOpen = true), onMessage: (m) => gotGuest.push(m), onClose: (r) => (guestClosed = r ?? 'closed') }, { p2p: false });
    await until(() => hostOpen && guestOpen);
    expect(host.via?.()).toBe('relay');
    expect(guest.via?.()).toBe('relay');
    guest.send({ v: 1, type: 'intent', intent: { kind: 'endRite' } });
    guest.send({ v: 1, type: 'intent', intent: { kind: 'resign' } });
    host.send({ v: 1, type: 'ping' });
    await until(() => gotHost.length >= 2 && gotGuest.length >= 1);
    expect(gotHost.map((m) => (m.type === 'intent' ? m.intent.kind : m.type))).toEqual(['endRite', 'resign']);
    expect(gotGuest[0]).toEqual({ v: 1, type: 'ping' });
    // The host leaving reaches the guest.
    host.destroy();
    await until(() => guestClosed !== '');
    expect(guestClosed).toMatch(/host left/i);
    guest.destroy();
  }, 20000);

  it('a guest with no host gets a clear error', async () => {
    wire();
    let err = '';
    const g = joinFriendSession('NONE', { onError: (e) => (err = e) }, { p2p: false });
    await until(() => err !== '', 18000);
    expect(err).toMatch(/No host/);
    g.destroy();
  }, 20000);

  it('Quick Match pairs two seekers through the queue', async () => {
    wire();
    const got: FriendSession[] = [];
    const a = findQuickMatch({ onMatched: (s) => got.push(s), onFailed: (r) => { throw new Error(r); } }, { p2p: false });
    await new Promise((r) => setTimeout(r, 300));
    const b = findQuickMatch({ onMatched: (s) => got.push(s), onFailed: (r) => { throw new Error(r); } }, { p2p: false });
    await until(() => got.length === 2, 10000);
    expect(got.map((s) => s.role).sort()).toEqual(['guest', 'host']);
    expect(got[0].room).toBe(got[1].room);
    a.cancel();
    b.cancel();
    for (const s of got) s.destroy();
  }, 20000);
});
