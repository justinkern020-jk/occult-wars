import { afterEach, describe, expect, it } from 'vitest';
import { handleRelay } from '../../api/_routes/relay';
import { memoryStore, setStoreForTests } from '../../api/_lib/store';
import { setRelayFetchForTests } from './relay';
import { CHANNEL_CLOSED, findQuickMatch, hostFriendSession, joinFriendSession, type FriendHandlers, type FriendMessage, type FriendSession } from './friendSession';

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

describe('a direct link that drops mid-match', () => {
  afterEach(() => {
    setRelayFetchForTests(null);
    setStoreForTests(null);
  });

  it('comes back through the relay without a second open, and moves keep flowing', async () => {
    wire();
    // A stand-in WebRTC pair that opens at once and can be cut.
    let hostSide: FriendHandlers | null = null;
    let guestSide: FriendHandlers | null = null;
    let up = false;
    const fakeSession = (role: 'host' | 'guest', other: () => FriendHandlers | null): FriendSession => ({
      role,
      room: 'DROP',
      send: (m) => {
        if (up) other()?.onMessage?.(m);
      },
      setOnMessage: () => {},
      destroy: () => {},
    });
    const p2pHost = (h: FriendHandlers) => {
      hostSide = h;
      queueMicrotask(() => h.onHosting?.());
      return fakeSession('host', () => guestSide);
    };
    const p2pJoin = (h: FriendHandlers) => {
      guestSide = h;
      up = true;
      queueMicrotask(() => {
        hostSide?.onOpen?.();
        h.onOpen?.();
      });
      return fakeSession('guest', () => hostSide);
    };
    const cut = () => {
      up = false;
      hostSide?.onClose?.(CHANNEL_CLOSED);
      guestSide?.onClose?.(CHANNEL_CLOSED);
    };
    const gotHost: FriendMessage[] = [];
    const gotGuest: FriendMessage[] = [];
    let hostOpens = 0;
    let guestOpens = 0;
    let closed = '';
    let hosting = false;
    const host = hostFriendSession(
      'DROP',
      { onHosting: () => (hosting = true), onOpen: () => hostOpens++, onMessage: (m) => gotHost.push(m), onClose: (r) => (closed = r ?? 'x') },
      { p2pHost },
    );
    await until(() => hosting);
    await new Promise((r) => setTimeout(r, 200));
    const guest = joinFriendSession(
      'DROP',
      { onOpen: () => guestOpens++, onMessage: (m) => gotGuest.push(m), onClose: (r) => (closed = r ?? 'x') },
      { p2pJoin },
    );
    await until(() => hostOpens === 1 && guestOpens === 1);
    expect([host.via?.(), guest.via?.()]).toEqual(['p2p', 'p2p']);
    guest.send({ v: 1, type: 'intent', intent: { kind: 'endRite' } });
    await until(() => gotHost.length === 1);
    cut();
    // Sent while the link is down: queued, then carried by the relay.
    host.send({ v: 1, type: 'ping' });
    guest.send({ v: 1, type: 'intent', intent: { kind: 'resign' } });
    await until(() => host.via?.() === 'relay' && guest.via?.() === 'relay', 15000);
    await until(() => gotHost.length === 2 && gotGuest.length === 1, 10000);
    expect(gotHost[1]).toEqual({ v: 1, type: 'intent', intent: { kind: 'resign' } });
    expect(gotGuest[0]).toEqual({ v: 1, type: 'ping' });
    expect([hostOpens, guestOpens, closed]).toEqual([1, 1, '']);
    host.destroy();
    guest.destroy();
  }, 30000);
});
