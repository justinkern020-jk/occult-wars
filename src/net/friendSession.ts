/**
 * PeerJS Friend Working session — room codes + Quick Match slot pool.
 * Room host id: ow-XXXX. Quick Match slots: ow-q-0 .. ow-q-31.
 */
import Peer, { type DataConnection, type PeerError } from 'peerjs';
import type { Card } from '../game/types';
import type { Side } from '../game/maps';
import type { ControlGrid } from '../game/control';
import type { BoardUnit } from '../components/UnitCoin';
import type { VictoryKind } from '../game/scoring';

export type FriendRole = 'host' | 'guest';

export type FriendMatchState = {
  mapId: string;
  loyalty: { blue: number; red: number };
  domination: { blue: number; red: number };
  turn: number;
  side: Side;
  phase: 'main' | 'melee' | 'over';
  matchOver: { winner: Side; kind: VictoryKind } | null;
  log: string[];
  deck: { blue: Card[]; red: Card[] };
  hand: { blue: Card[]; red: Card[] };
  discard: { blue: Card[]; red: Card[] };
  board: (BoardUnit | null)[][];
  control: ControlGrid;
  leaderUsed: { blue: boolean; red: boolean };
  cryptidSight: string | null;
  blueFaction: string;
  redFaction: string;
};

export type FriendIntent =
  | { kind: 'deploy'; r: number; c: number; handIndex: number }
  | { kind: 'move'; uid: string; r: number; c: number }
  | { kind: 'strike'; atkUid: string; defR: number; defC: number }
  | {
      kind: 'cast';
      handIndex: number;
      targetUid?: string;
      aimPos?: { r: number; c: number };
    }
  | {
      kind: 'useLeader';
      targetUid?: string;
      aimPos?: { r: number; c: number };
    }
  | { kind: 'callPower'; uid: string; targetUid?: string }
  | { kind: 'endRite' }
  | { kind: 'resign' };

export type FriendMessage =
  | { v: 1; type: 'hello'; role: FriendRole; room: string }
  | { v: 1; type: 'state'; state: FriendMatchState }
  | { v: 1; type: 'intent'; intent: FriendIntent }
  | { v: 1; type: 'ping' }
  | { v: 1; type: 'error'; message: string };

export type FriendHandlers = {
  onOpen?: () => void;
  onMessage?: (msg: FriendMessage) => void;
  onClose?: (reason?: string) => void;
  onError?: (err: string) => void;
};

export type FriendSession = {
  send: (msg: FriendMessage) => void;
  destroy: () => void;
  /** Register/replace the in-match message handler (Battlefield). */
  setOnMessage: (fn: ((msg: FriendMessage) => void) | null) => void;
  role: FriendRole;
  room: string;
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Quick Match open-seeker slots. */
export const QUICK_SLOT_COUNT = 32;
export const QUICK_PROBE_MS = 850;

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/** Normalize user input to a 4-letter room code (or null if invalid). */
export function normalizeRoomCode(raw: string): string | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
  if (cleaned.length !== 4) return null;
  return cleaned;
}

export function randomRoomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return s;
}

export function peerIdForRoom(room: string): string {
  const r = normalizeRoomCode(room);
  if (!r) throw new Error('Room must be 4 letters');
  return `ow-${r}`;
}

export function peerIdForQuickSlot(slot: number): string {
  if (slot < 0 || slot >= QUICK_SLOT_COUNT || !Number.isInteger(slot)) {
    throw new Error('Invalid quick slot');
  }
  return `ow-q-${slot}`;
}

/** Room label shown in UI / hello messages for a quick slot. */
export function quickRoomLabel(slot: number): string {
  return `Q${String(slot).padStart(2, '0')}`;
}

export function parseFriendMessage(raw: unknown): FriendMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.v !== 1 || typeof m.type !== 'string') return null;
  switch (m.type) {
    case 'hello':
    case 'state':
    case 'intent':
    case 'ping':
    case 'error':
      return m as unknown as FriendMessage;
    default:
      return null;
  }
}

function peerOptions() {
  return {
    debug: 0 as const,
    config: { iceServers: ICE_SERVERS },
  };
}

function makeSendQueue(getConn: () => DataConnection | null) {
  const queue: FriendMessage[] = [];
  return {
    send(msg: FriendMessage) {
      const conn = getConn();
      if (conn && conn.open) {
        try {
          conn.send(msg);
        } catch {
          queue.push(msg);
        }
        return;
      }
      queue.push(msg);
    },
    flush() {
      const conn = getConn();
      if (!conn || !conn.open) return;
      while (queue.length) {
        const next = queue.shift()!;
        try {
          conn.send(next);
        } catch {
          queue.unshift(next);
          break;
        }
      }
    },
  };
}

type MsgSink = { current: ((msg: FriendMessage) => void) | null };

function wireConnection(
  conn: DataConnection,
  handlers: FriendHandlers,
  sink: MsgSink,
  queue: ReturnType<typeof makeSendQueue>,
  onOpenOnce: () => void,
) {
  conn.on('open', () => {
    queue.flush();
    onOpenOnce();
  });
  conn.on('data', (data) => {
    const msg = parseFriendMessage(data);
    if (!msg) return;
    handlers.onMessage?.(msg);
    sink.current?.(msg);
  });
  conn.on('close', () => {
    handlers.onClose?.('Peer closed the channel');
  });
  conn.on('error', (err) => {
    handlers.onError?.(err.message || 'Connection error');
  });
}

function buildSession(
  role: FriendRole,
  room: string,
  peer: Peer,
  getConn: () => DataConnection | null,
  setConn: (c: DataConnection | null) => void,
  sink: MsgSink,
  queue: ReturnType<typeof makeSendQueue>,
): FriendSession {
  return {
    role,
    room,
    send: queue.send,
    setOnMessage(fn) {
      sink.current = fn;
    },
    destroy() {
      try {
        getConn()?.close();
      } catch {
        /* ignore */
      }
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      setConn(null);
      sink.current = null;
    },
  };
}

/** Host on an arbitrary PeerJS id (room code or quick slot). */
export function hostOnPeerId(
  peerId: string,
  roomLabel: string,
  handlers: FriendHandlers,
): FriendSession {
  let conn: DataConnection | null = null;
  let opened = false;
  const sink: MsgSink = { current: null };
  const queue = makeSendQueue(() => conn);
  const peer = new Peer(peerId, peerOptions());

  peer.on('connection', (c) => {
    if (conn && conn.open) {
      c.close();
      return;
    }
    conn = c;
    wireConnection(c, handlers, sink, queue, () => {
      if (opened) return;
      opened = true;
      handlers.onOpen?.();
    });
    if (c.open) {
      queue.flush();
      if (!opened) {
        opened = true;
        handlers.onOpen?.();
      }
    }
  });
  peer.on('error', (err: PeerError<string>) => {
    const msg = err.message || String(err);
    if (/unavailable-id|is taken/i.test(msg) || err.type === 'unavailable-id') {
      handlers.onError?.('PEER_ID_TAKEN');
    } else {
      handlers.onError?.(msg);
    }
  });
  peer.on('disconnected', () => {
    handlers.onClose?.('Host peer disconnected');
  });

  return buildSession(
    'host',
    roomLabel,
    peer,
    () => conn,
    (c) => {
      conn = c;
    },
    sink,
    queue,
  );
}

/** Guest connects to an arbitrary host PeerJS id. */
export function joinOnPeerId(
  hostPeerId: string,
  roomLabel: string,
  handlers: FriendHandlers,
): FriendSession {
  let conn: DataConnection | null = null;
  let opened = false;
  const sink: MsgSink = { current: null };
  const queue = makeSendQueue(() => conn);
  const peer = new Peer(peerOptions());

  peer.on('open', () => {
    conn = peer.connect(hostPeerId, { reliable: true });
    wireConnection(conn, handlers, sink, queue, () => {
      if (opened) return;
      opened = true;
      handlers.onOpen?.();
    });
  });
  peer.on('error', (err) => {
    handlers.onError?.(err.message || String(err));
  });
  peer.on('disconnected', () => {
    handlers.onClose?.('Guest peer disconnected');
  });

  return buildSession(
    'guest',
    roomLabel,
    peer,
    () => conn,
    (c) => {
      conn = c;
    },
    sink,
    queue,
  );
}

export function hostFriendSession(
  room: string,
  handlers: FriendHandlers,
): FriendSession {
  const code = normalizeRoomCode(room);
  if (!code) throw new Error('Room must be 4 letters');
  return hostOnPeerId(peerIdForRoom(code), code, handlers);
}

export function joinFriendSession(
  room: string,
  handlers: FriendHandlers,
): FriendSession {
  const code = normalizeRoomCode(room);
  if (!code) throw new Error('Room must be 4 letters');
  return joinOnPeerId(peerIdForRoom(code), code, handlers);
}

export type QuickMatchHandle = {
  cancel: () => void;
};

export type QuickMatchHandlers = {
  onStatus?: (status: string) => void;
  onMatched: (session: FriendSession) => void;
  onFailed: (reason: string) => void;
};

/**
 * Quick Match: probe ow-q-0..31 as guest; if none answer, claim first free
 * slot as host and wait for a seeker.
 */
export function findQuickMatch(handlers: QuickMatchHandlers): QuickMatchHandle {
  let cancelled = false;
  let active: FriendSession | null = null;
  let probePeer: Peer | null = null;

  const fail = (reason: string) => {
    if (cancelled) return;
    cancelled = true;
    try {
      active?.destroy();
    } catch {
      /* ignore */
    }
    active = null;
    try {
      probePeer?.destroy();
    } catch {
      /* ignore */
    }
    probePeer = null;
    handlers.onFailed(reason);
  };

  const succeed = (session: FriendSession) => {
    if (cancelled) {
      session.destroy();
      return;
    }
    active = session;
    handlers.onMatched(session);
  };

  const destroyProbe = () => {
    try {
      probePeer?.destroy();
    } catch {
      /* ignore */
    }
    probePeer = null;
  };

  /** Try connect to one quick slot; resolves true if connected. */
  function probeSlot(slot: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (cancelled) {
        resolve(false);
        return;
      }
      handlers.onStatus?.(`Searching… slot ${slot + 1}/${QUICK_SLOT_COUNT}`);
      destroyProbe();
      const hostId = peerIdForQuickSlot(slot);
      const peer = new Peer(peerOptions());
      probePeer = peer;
      let settled = false;

      const done = (ok: boolean, session?: FriendSession) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (ok && session) {
          // Keep session; don't destroy probe peer owned by session.
          probePeer = null;
          succeed(session);
          resolve(true);
          return;
        }
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        if (probePeer === peer) probePeer = null;
        resolve(false);
      };

      const timer = window.setTimeout(() => done(false), QUICK_PROBE_MS);

      peer.on('open', () => {
        if (cancelled) {
          done(false);
          return;
        }
        const sink: MsgSink = { current: null };
        let conn: DataConnection | null = null;
        const queue = makeSendQueue(() => conn);
        const sessionHandlers: FriendHandlers = {
          onOpen: () => {
            /* wired below */
          },
        };
        conn = peer.connect(hostId, { reliable: true });
        let opened = false;
        const session = buildSession(
          'guest',
          quickRoomLabel(slot),
          peer,
          () => conn,
          (c) => {
            conn = c;
          },
          sink,
          queue,
        );
        wireConnection(conn, sessionHandlers, sink, queue, () => {
          if (opened || cancelled) return;
          opened = true;
          done(true, session);
        });
        conn.on('error', () => done(false));
        conn.on('close', () => {
          if (!opened) done(false);
        });
      });
      peer.on('error', () => done(false));
    });
  }

  async function claimHostSlot(): Promise<void> {
    for (let slot = 0; slot < QUICK_SLOT_COUNT; slot++) {
      if (cancelled) return;
      handlers.onStatus?.(
        `No partner yet — waiting as host (slot ${slot + 1}/${QUICK_SLOT_COUNT})…`,
      );
      const taken = await tryHostSlot(slot);
      if (taken === 'matched') return;
      if (taken === 'cancelled') return;
      // 'taken' → try next slot
    }
    fail(
      'Couldn’t find a partner — try Host with a code or Pass the Grimoire.',
    );
  }

  function tryHostSlot(
    slot: number,
  ): Promise<'matched' | 'taken' | 'cancelled'> {
    return new Promise((resolve) => {
      if (cancelled) {
        resolve('cancelled');
        return;
      }
      const peerId = peerIdForQuickSlot(slot);
      const label = quickRoomLabel(slot);
      let settled = false;

      const session = hostOnPeerId(peerId, label, {
        onOpen: () => {
          if (settled || cancelled) return;
          settled = true;
          active = session;
          handlers.onStatus?.('Match found — opening the field…');
          succeed(session);
          resolve('matched');
        },
        onError: (err) => {
          if (settled) return;
          if (err === 'PEER_ID_TAKEN') {
            settled = true;
            try {
              session.destroy();
            } catch {
              /* ignore */
            }
            resolve('taken');
            return;
          }
          // Other errors while waiting — keep waiting unless cancelled.
          handlers.onStatus?.(`Waiting… (${err})`);
        },
        onClose: () => {
          if (!settled && !cancelled) {
            handlers.onStatus?.('Channel closed while waiting — still searching…');
          }
        },
      });
      active = session;

      // Peer open without error means we own the slot and are waiting.
      // hostOnPeerId doesn't expose peer open — PEER_ID_TAKEN comes via onError.
      // If id is free, we sit until guest connects (onOpen of data channel).
    });
  }

  (async () => {
    try {
      handlers.onStatus?.('Searching…');
      for (let slot = 0; slot < QUICK_SLOT_COUNT; slot++) {
        if (cancelled) return;
        const hit = await probeSlot(slot);
        if (hit) {
          handlers.onStatus?.('Match found — opening the field…');
          return;
        }
      }
      if (cancelled) return;
      destroyProbe();
      await claimHostSlot();
    } catch (err) {
      fail(
        err instanceof Error
          ? err.message
          : 'Couldn’t find a partner — try Host with a code or Pass the Grimoire.',
      );
    }
  })();

  return {
    cancel() {
      cancelled = true;
      try {
        active?.destroy();
      } catch {
        /* ignore */
      }
      active = null;
      destroyProbe();
    },
  };
}
