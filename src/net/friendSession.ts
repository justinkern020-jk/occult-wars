/**
 * Friend Working session — room codes + Quick Match.
 *
 * Two transports carry the same FriendMessage protocol:
 * - WebRTC (PeerJS): room host id ow-XXXX; the legacy Quick Match slot pool ow-q-0..31.
 * - The relay (/api/relay, polling through the site's own API) when WebRTC cannot
 *   open within RELAY_AFTER_MS — no UDP, a dead TURN, a locked-down network.
 * The host listens on both; the guest tries WebRTC first, then the relay.
 * Quick Match pairs through the relay's queue (falls back to the slot pool).
 */
import Peer, { type DataConnection, type PeerError } from 'peerjs';
import { outbox, pollInbox, relayCall, relayId, type RelayEnvelope } from './relay';
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
      secondUid?: string;
      aimPos?: { r: number; c: number };
      pick?: number;
      seek?: 'unit' | 'rite';
      discardIndex?: number;
    }
  | { kind: 'callPower'; uid: string; targetUid?: string }
  | { kind: 'endRite' }
  /** Guest typed an in-match code; the host drops the plate into Crimson's hand. */
  | { kind: 'code'; code: 'justin' | 'adept' | 'seth' | 'southhaven' | 'athens' }
  | { kind: 'resign' };

export type FriendLoadoutMessage = {
  v: 1;
  type: 'loadout';
  heroId?: string;
  cards: string[];
  faction?: string;
  /** Name, worn title, ladder rank (optional; older clients omit it). */
  who?: { name?: string; title?: string; rank?: string; nonce?: string };
};

export type FriendMessage =
  | { v: 1; type: 'hello'; role: FriendRole; room: string }
  | { v: 1; type: 'state'; state: FriendMatchState }
  | { v: 1; type: 'intent'; intent: FriendIntent }
  | FriendLoadoutMessage
  | { v: 1; type: 'ping' }
  /** Host → guest: a code sent through the owner's Portal reached the guest's side. */
  | { v: 1; type: 'portal'; code: 'justin' | 'adept' | 'seth' | 'southhaven' | 'athens' }
  | { v: 1; type: 'error'; message: string };

export type FriendHandlers = {
  /** Host only: the room id is claimed on the signalling server. */
  onHosting?: () => void;
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
  /** Which road the link took (null until linked). */
  via?: () => 'p2p' | 'relay' | null;
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Quick Match open-seeker slots. */
export const QUICK_SLOT_COUNT = 32;
export const QUICK_PROBE_MS = 850;

/**
 * STUN + PeerJS's own TURN relays (the PeerJS defaults). The Open Relay
 * "openrelayproject" credentials once listed here were retired by Metered and
 * no longer authenticate, which left peers behind strict NATs with no relay.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
    username: 'peerjs',
    credential: 'peerjsp',
  },
];

/** A guest whose WebRTC link has not opened by now takes the relay. */
export const RELAY_AFTER_MS = 8_000;

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
    case 'loadout':
      if (!Array.isArray(m.cards)) return null;
      return m as unknown as FriendMessage;
    case 'portal':
      if (!['justin', 'adept', 'seth', 'southhaven', 'athens'].includes(String(m.code))) return null;
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

/** The WebRTC data channel itself closed (not just the signalling socket). */
export const CHANNEL_CLOSED = 'Peer closed the channel';

/** Only the newest full state matters while a link is down. */
function queueMsg(pending: FriendMessage[], msg: FriendMessage) {
  if (msg.type === 'state') {
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.type === 'state') pending.splice(i, 1);
  }
  pending.push(msg);
}

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
    handlers.onClose?.(CHANNEL_CLOSED);
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

  peer.on('open', () => {
    handlers.onHosting?.();
  });
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


export type QuickMatchHandle = {
  cancel: () => void;
};

export type QuickMatchHandlers = {
  onStatus?: (status: string) => void;
  onMatched: (session: FriendSession) => void;
  onFailed: (reason: string) => void;
};

/**
 * Legacy Quick Match (WebRTC only): probe ow-q-0..31 as guest; if none
 * answer, claim first free slot as host and wait for a seeker.
 */
export function findQuickMatchP2P(handlers: QuickMatchHandlers): QuickMatchHandle {
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

// ——— Hybrid sessions: WebRTC first, the relay when it cannot open ———

export type LinkOptions = {
  /** Tests / restricted builds: skip WebRTC entirely. */
  p2p?: boolean;
  /** Override RELAY_AFTER_MS (tests). */
  relayAfterMs?: number;
  /** Tests: stand-in WebRTC links. */
  p2pHost?: (handlers: FriendHandlers) => FriendSession;
  p2pJoin?: (handlers: FriendHandlers) => FriendSession;
  /** Override RESCUE_MS (tests). */
  rescueMs?: number;
};

/** A direct link that drops mid-match has this long to come back through the relay. */
export const RESCUE_MS = 25_000;

function parseEnvelopeMsg(env: RelayEnvelope): FriendMessage | null {
  return env.k === 'msg' ? parseFriendMessage(env.m) : null;
}

/** Host a room on both roads: PeerJS id ow-ROOM and the relay's host inbox. */
export function hostFriendSession(
  room: string,
  handlers: FriendHandlers,
  opts: LinkOptions = {},
): FriendSession {
  const code = normalizeRoomCode(room);
  if (!code) throw new Error('Room must be 4 letters');
  const hid = relayId();
  const sink: MsgSink = { current: null };
  let via: 'p2p' | 'relay' | null = null;
  let guestGid: string | null = null;
  let guestOut: ReturnType<typeof outbox> | null = null;
  let destroyed = false;
  let hostingFired = false;
  let opened = false;
  let relayUp = false;
  let p2pDown = opts.p2p === false;
  let p2pError: string | null = null;
  const pending: FriendMessage[] = [];
  let rescueTimer: ReturnType<typeof setTimeout> | null = null;

  const deliver = (msg: FriendMessage) => {
    handlers.onMessage?.(msg);
    sink.current?.(msg);
  };
  /** The direct link dropped mid-match: wait for the guest on the relay. */
  const rescue = (reason: string) => {
    via = null;
    try {
      p2p?.destroy();
    } catch {
      /* ignore */
    }
    p2p = null;
    void relayCall<{ fresh?: boolean }>({ op: 'host', room: code, hid }).then((r) => {
      if (destroyed) return;
      if (r && r.ok) {
        relayUp = true;
        if (r.fresh) inbox?.reset();
      }
      inbox?.start();
      inbox?.setPace('wait');
    });
    if (rescueTimer) clearTimeout(rescueTimer);
    rescueTimer = setTimeout(() => {
      if (via === null && !destroyed) handlers.onClose?.(reason);
    }, opts.rescueMs ?? RESCUE_MS);
  };
  const fireHosting = () => {
    if (hostingFired || destroyed) return;
    hostingFired = true;
    handlers.onHosting?.();
  };
  const fireOpen = () => {
    if (opened || destroyed) return;
    opened = true;
    handlers.onOpen?.();
  };
  const flushPending = () => {
    while (pending.length) send(pending.shift()!);
  };
  const failBoth = () => {
    // Neither road could open a room: report the WebRTC reason.
    if (p2pDown && !relayUp && !destroyed && !opened) {
      handlers.onError?.(p2pError ?? 'Could not open the room.');
    }
  };

  let p2p: FriendSession | null = null;
  if (opts.p2p !== false) {
    const p2pHandlers: FriendHandlers = {
      onHosting: fireHosting,
      onOpen: () => {
        if (via === 'relay') return;
        via = 'p2p';
        // Keep a slow ear on the relay all match: a guest whose direct link drops comes back there.
        inbox?.setPace('rest');
        flushPending();
        fireOpen();
      },
      onMessage: (msg) => {
        if (via === 'p2p') deliver(msg);
      },
      onClose: (reason) => {
        // Only the data channel closing counts; a lost signalling socket leaves the link up.
        if (via === 'p2p' && reason === CHANNEL_CLOSED) rescue(reason);
      },
      onError: (err) => {
        if (err === 'PEER_ID_TAKEN') {
          // Someone else hosts this room: let go of the relay side too.
          inbox?.stop();
          if (relayUp) void relayCall({ op: 'leave', room: code, hid });
          relayUp = false;
          handlers.onError?.(err);
          return;
        }
        if (via === 'p2p') {
          handlers.onError?.(err);
          return;
        }
        if (via === null) {
          // The WebRTC road is closed; the relay may still carry the match.
          p2pDown = true;
          p2pError = err;
          failBoth();
        }
      },
    };
    p2p = opts.p2pHost ? opts.p2pHost(p2pHandlers) : hostOnPeerId(peerIdForRoom(code), code, p2pHandlers);
  }

  let inbox: ReturnType<typeof pollInbox> | null = null;
  inbox = pollInbox(
    code,
    'h',
    (env) => {
      if (destroyed) return;
      if (env.k === 'syn') {
        if (guestGid && env.gid !== guestGid && via === 'relay') return;
        guestGid = env.gid;
        guestOut = outbox(code, `g:${env.gid}`);
        guestOut.send({ k: 'ack', gid: env.gid });
        if (via !== 'relay') {
          // The guest gave up on WebRTC: the relay carries the match.
          const wasP2P = via === 'p2p';
          via = 'relay';
          if (rescueTimer) clearTimeout(rescueTimer);
          try {
            p2p?.destroy();
          } catch {
            /* ignore */
          }
          p2p = null;
          inbox?.setPace('link');
          flushPending();
          if (!wasP2P) fireOpen();
        }
        return;
      }
      if (env.gid !== guestGid || via !== 'relay') return;
      if (env.k === 'msg') {
        const msg = parseEnvelopeMsg(env);
        if (msg) deliver(msg);
      } else if (env.k === 'bye') {
        handlers.onClose?.('Your partner left the table.');
      }
    },
    { hid },
  );

  void relayCall<{ taken?: boolean }>({ op: 'host', room: code, hid }).then((r) => {
    if (destroyed) return;
    if (r && r.ok) {
      relayUp = true;
      fireHosting();
      inbox?.start();
      return;
    }
    if (r && r.taken && opts.p2p === false) {
      handlers.onError?.('PEER_ID_TAKEN');
      return;
    }
    // Relay unreachable (or a stale claim): WebRTC alone, as before.
    failBoth();
  });

  function send(msg: FriendMessage) {
    if (via === 'p2p' && p2p) p2p.send(msg);
    else if (via === 'relay' && guestOut && guestGid) guestOut.send({ k: 'msg', gid: guestGid, m: msg });
    else queueMsg(pending, msg);
  }

  return {
    role: 'host',
    room: code,
    send,
    via: () => via,
    setOnMessage(fn) {
      sink.current = fn;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rescueTimer) clearTimeout(rescueTimer);
      inbox?.stop();
      if (via === 'relay' && guestOut && guestGid) void guestOut.now({ k: 'bye', gid: guestGid });
      if (relayUp) void relayCall({ op: 'leave', room: code, hid });
      try {
        p2p?.destroy();
      } catch {
        /* ignore */
      }
      sink.current = null;
    },
  };
}

/** Join a room: WebRTC first; the relay if no link opens within RELAY_AFTER_MS. */
export function joinFriendSession(
  room: string,
  handlers: FriendHandlers,
  opts: LinkOptions = {},
): FriendSession {
  const code = normalizeRoomCode(room);
  if (!code) throw new Error('Room must be 4 letters');
  const gid = relayId();
  const sink: MsgSink = { current: null };
  let via: 'p2p' | 'relay' | null = null;
  let destroyed = false;
  let opened = false;
  let relaying = false;
  let rescuing = false;
  let lastP2PError: string | null = null;
  const pending: FriendMessage[] = [];
  const hostOut = outbox(code, 'h');
  let inbox: ReturnType<typeof pollInbox> | null = null;
  let synTimer: ReturnType<typeof setTimeout> | null = null;

  const deliver = (msg: FriendMessage) => {
    handlers.onMessage?.(msg);
    sink.current?.(msg);
  };
  const fireOpen = () => {
    if (opened || destroyed) return;
    opened = true;
    handlers.onOpen?.();
  };
  const flushPending = () => {
    while (pending.length) send(pending.shift()!);
  };

  let p2p: FriendSession | null = null;
  const fallbackTimer = setTimeout(() => toRelay(), opts.relayAfterMs ?? RELAY_AFTER_MS);
  if (opts.p2p !== false) {
    const p2pHandlers: FriendHandlers = {
      onOpen: () => {
        if (via !== null || relaying) return;
        via = 'p2p';
        clearTimeout(fallbackTimer);
        flushPending();
        fireOpen();
      },
      onMessage: (msg) => {
        if (via === 'p2p') deliver(msg);
      },
      onClose: (reason) => {
        if (via === 'p2p') {
          // The direct link dropped mid-match: come back through the relay.
          if (reason === CHANNEL_CLOSED) {
            via = null;
            relaying = false;
            rescuing = true;
            lastP2PError = reason;
            toRelay();
          }
        } else if (via === null) {
          lastP2PError = reason ?? null;
          toRelay();
        }
      },
      onError: (err) => {
        if (via === 'p2p') handlers.onError?.(err);
        else if (via === null) {
          lastP2PError = err;
          toRelay();
        }
      },
    };
    p2p = opts.p2pJoin ? opts.p2pJoin(p2pHandlers) : joinOnPeerId(peerIdForRoom(code), code, p2pHandlers);
  } else {
    clearTimeout(fallbackTimer);
    queueMicrotask(() => toRelay());
  }

  function toRelay() {
    if (destroyed || via !== null || relaying) return;
    relaying = true;
    clearTimeout(fallbackTimer);
    try {
      p2p?.destroy();
    } catch {
      /* ignore */
    }
    p2p = null;
    inbox = pollInbox(code!, `g:${gid}`, (env) => {
      if (destroyed) return;
      if (env.k === 'ack' && via === null) {
        via = 'relay';
        if (synTimer) clearTimeout(synTimer);
        inbox?.setPace('link');
        flushPending();
        fireOpen();
        return;
      }
      if (via !== 'relay') return;
      if (env.k === 'msg') {
        const msg = parseEnvelopeMsg(env);
        if (msg) deliver(msg);
      } else if (env.k === 'bye') {
        handlers.onClose?.('The host left the table.');
      }
    });
    inbox.start();
    let tries = 0;
    const knock = async () => {
      if (destroyed || via !== null) return;
      tries += 1;
      const r = await hostOut.now({ k: 'syn', gid });
      if (destroyed || via !== null) return;
      if (r && r.ok) {
        // Delivered: the ack comes back through our inbox. Knock again if it is slow.
        synTimer = setTimeout(knock, 6_000);
        return;
      }
      if (tries >= (rescuing ? 16 : 8)) {
        inbox?.stop();
        if (rescuing) {
          handlers.onClose?.('Lost the link to the host.');
          return;
        }
        handlers.onError?.(
          r && r.nohost
            ? 'No host is waiting in that room'
            : lastP2PError ?? 'Could not reach the room',
        );
        return;
      }
      synTimer = setTimeout(knock, 1_500);
    };
    void knock();
  }

  function send(msg: FriendMessage) {
    if (via === 'p2p' && p2p) p2p.send(msg);
    else if (via === 'relay') hostOut.send({ k: 'msg', gid, m: msg });
    else queueMsg(pending, msg);
  }

  return {
    role: 'guest',
    room: code,
    send,
    via: () => via,
    setOnMessage(fn) {
      sink.current = fn;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(fallbackTimer);
      if (synTimer) clearTimeout(synTimer);
      inbox?.stop();
      if (via === 'relay') void hostOut.now({ k: 'bye', gid });
      try {
        p2p?.destroy();
      } catch {
        /* ignore */
      }
      sink.current = null;
    },
  };
}

/**
 * Quick Match through the relay's queue: take the oldest waiting room as its
 * guest, or open one and wait. Both then link like a room code (WebRTC, then
 * the relay). If the relay cannot be reached, the legacy slot pool is used.
 */
export function findQuickMatch(
  handlers: QuickMatchHandlers,
  opts: LinkOptions = {},
): QuickMatchHandle {
  let cancelled = false;
  let session: FriendSession | null = null;
  let legacy: QuickMatchHandle | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;
  let hostRoomCode: string | null = null;
  let matched = false;

  const stopBeat = () => {
    if (beat) clearInterval(beat);
    beat = null;
  };
  const fail = (reason: string) => {
    if (cancelled) return;
    cancelled = true;
    stopBeat();
    try {
      session?.destroy();
    } catch {
      /* ignore */
    }
    session = null;
    handlers.onFailed(reason);
  };
  const matchedNow = (s: FriendSession) => {
    if (cancelled || matched) return;
    matched = true;
    stopBeat();
    handlers.onStatus?.('Match found — opening the field…');
    handlers.onMatched(s);
  };

  (async () => {
    handlers.onStatus?.('Searching…');
    const gid = relayId();
    const r = await relayCall<{ role?: FriendRole; room?: string }>({ op: 'quick', gid });
    if (cancelled) return;
    if (!r || !r.ok || !r.room || (r.role !== 'host' && r.role !== 'guest')) {
      legacy = findQuickMatchP2P(handlers);
      return;
    }
    const code = r.room;
    if (r.role === 'guest') {
      handlers.onStatus?.('A partner is waiting — linking…');
      let s!: FriendSession;
      s = joinFriendSession(
        code,
        {
          onOpen: () => matchedNow(s),
          onError: () => {
            if (!matched) fail('That partner slipped away — search again.');
          },
          onClose: () => {
            if (!matched) fail('That partner slipped away — search again.');
          },
        },
        opts,
      );
      session = s;
      return;
    }
    hostRoomCode = code;
    handlers.onStatus?.('No partner yet — waiting for the next occultist…');
    let s!: FriendSession;
    s = hostFriendSession(
      code,
      {
        onOpen: () => matchedNow(s),
        onError: (err) => {
          if (!matched) fail(err === 'PEER_ID_TAKEN' ? 'Search again — that room was taken.' : err);
        },
      },
      opts,
    );
    session = s;
    let claimedAt: number | null = null;
    beat = setInterval(() => {
      if (cancelled || matched) return;
      void relayCall<{ waiting?: boolean }>({ op: 'quickbeat', room: code, hid: gid }).then((b) => {
        if (!b || cancelled || matched) return;
        if (b.waiting) {
          claimedAt = null;
          return;
        }
        // Someone claimed the room; if they never arrive, stand in the queue again.
        claimedAt ??= Date.now();
        if (Date.now() - claimedAt > 20_000) {
          claimedAt = null;
          void relayCall({ op: 'quickagain', room: code, hid: gid });
        }
      });
    }, 10_000);
  })();

  return {
    cancel() {
      cancelled = true;
      stopBeat();
      legacy?.cancel();
      if (hostRoomCode && !matched) void relayCall({ op: 'quickcancel', room: hostRoomCode });
      try {
        session?.destroy();
      } catch {
        /* ignore */
      }
      session = null;
    },
  };
}
