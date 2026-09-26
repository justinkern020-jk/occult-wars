import { useCallback, useEffect, useRef, useState } from 'react';
import { brassClick } from '../game/sfx';
import {
  findQuickMatch,
  hostFriendSession,
  joinFriendSession,
  normalizeRoomCode,
  randomRoomCode,
  type FriendRole,
  type FriendSession,
  type QuickMatchHandle,
} from '../net/friendSession';

export type FriendReadyPayload = {
  room: string;
  role: FriendRole;
  session: FriendSession;
};

type Props = {
  onReady: (payload: FriendReadyPayload) => void;
  onBack: () => void;
};

/**
 * Friend Working lobby: Quick Match + 4-letter room Host/Join.
 * PeerJS only — no SDP paste.
 */
export function FriendWorking({ onReady, onBack }: Props) {
  const [room, setRoom] = useState(randomRoomCode);
  const [role, setRole] = useState<FriendRole | null>(null);
  const [status, setStatus] = useState(
    'Find a match automatically, or host/join with a 4-letter room code.',
  );
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linked, setLinked] = useState(false);
  const sessionRef = useRef<FriendSession | null>(null);
  const quickRef = useRef<QuickMatchHandle | null>(null);
  const readySent = useRef(false);
  const handedOff = useRef(false);

  const cleanup = useCallback(() => {
    if (handedOff.current) return;
    quickRef.current?.cancel();
    quickRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    readySent.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  function finishReady(session: FriendSession) {
    if (readySent.current) return;
    readySent.current = true;
    handedOff.current = true;
    sessionRef.current = null;
    quickRef.current = null;
    setLinked(true);
    setSearching(false);
    setBusy(false);
    setStatus(
      session.role === 'host'
        ? `Connected · you are Azure (host). Room ${session.room}.`
        : `Connected · you are Crimson (guest). Room ${session.room}.`,
    );
    onReady({ room: session.room, role: session.role, session });
  }

  function beginQuickMatch() {
    brassClick();
    cleanup();
    handedOff.current = false;
    setFailed(false);
    setLinked(false);
    setBusy(true);
    setSearching(true);
    setRole(null);
    setStatus('Searching…');
    const handle = findQuickMatch({
      onStatus: (s) => {
        if (!handedOff.current) setStatus(s);
      },
      onMatched: (session) => {
        finishReady(session);
      },
      onFailed: (reason) => {
        setBusy(false);
        setSearching(false);
        setFailed(true);
        setStatus(reason);
      },
    });
    quickRef.current = handle;
  }

  function cancelSearch() {
    brassClick();
    quickRef.current?.cancel();
    quickRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setSearching(false);
    setBusy(false);
    setRole(null);
    setFailed(false);
    setStatus(
      'Find a match automatically, or host/join with a 4-letter room code.',
    );
  }

  function beginHost() {
    brassClick();
    const code = normalizeRoomCode(room);
    if (!code) {
      setStatus('Room needs exactly 4 letters (A–Z).');
      return;
    }
    cleanup();
    handedOff.current = false;
    setFailed(false);
    setLinked(false);
    setSearching(false);
    setBusy(true);
    setRole('host');
    setRoom(code);
    setStatus(`Waiting for guest… share code ${code}`);
    try {
      const session = hostFriendSession(code, {
        onOpen: () => finishReady(session),
        onError: (err) => {
          setBusy(false);
          setFailed(true);
          const msg =
            err === 'PEER_ID_TAKEN'
              ? 'That room code is already hosted. Pick another or join as guest.'
              : err;
          setStatus(
            `Could not host (${msg}). Corporate firewalls sometimes block peers — try Quick Match, Pass the Grimoire, or another network.`,
          );
        },
        onClose: (reason) => {
          if (!readySent.current) {
            setBusy(false);
            setStatus(reason || 'Channel closed before a guest joined.');
          }
        },
      });
      sessionRef.current = session;
    } catch (err) {
      setBusy(false);
      setFailed(true);
      setStatus(
        `Could not start host (${err instanceof Error ? err.message : 'error'}). Try Pass the Grimoire instead.`,
      );
    }
  }

  function beginGuest() {
    brassClick();
    const code = normalizeRoomCode(room);
    if (!code) {
      setStatus('Enter the host’s 4-letter room code first.');
      return;
    }
    cleanup();
    handedOff.current = false;
    setFailed(false);
    setLinked(false);
    setSearching(false);
    setBusy(true);
    setRole('guest');
    setRoom(code);
    setStatus(`Connecting to room ${code}…`);
    try {
      const session = joinFriendSession(code, {
        onOpen: () => finishReady(session),
        onError: (err) => {
          setBusy(false);
          setFailed(true);
          setStatus(
            `Could not join (${err}). Confirm the host is waiting, or try Quick Match / Pass the Grimoire.`,
          );
        },
        onClose: (reason) => {
          if (!readySent.current) {
            setBusy(false);
            setFailed(true);
            setStatus(reason || 'Connection closed. Ask the host to re-host.');
          }
        },
      });
      sessionRef.current = session;
    } catch (err) {
      setBusy(false);
      setFailed(true);
      setStatus(
        `Could not join (${err instanceof Error ? err.message : 'error'}). Try Pass the Grimoire instead.`,
      );
    }
  }

  return (
    <section className="friend-working" data-testid="friend-working">
      <p className="plate-kicker">Friend Working</p>
      <h2>Find a friend</h2>
      <p className="lede">
        Quick Match pairs you with anyone searching. Or share a 4-letter room
        for a private sitting. Host plays Azure; guest plays Crimson.
      </p>

      <div className="friend-roles friend-roles-quick">
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="friend-quick"
          disabled={busy || linked}
          onClick={beginQuickMatch}
        >
          Find a match
        </button>
        {searching && (
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            data-testid="friend-cancel-search"
            onClick={cancelSearch}
          >
            Cancel search
          </button>
        )}
      </div>

      <p className="friend-divider">— or private room —</p>

      <label className="room-code">
        Room
        <input
          value={room}
          maxLength={4}
          disabled={busy || linked}
          data-testid="friend-room-input"
          onChange={(e) =>
            setRoom(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z]/g, '')
                .slice(0, 4),
            )
          }
        />
      </label>

      <div className="friend-roles">
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="friend-host"
          disabled={busy || linked}
          onClick={beginHost}
        >
          Host the field
        </button>
        <button
          type="button"
          className="brass-btn"
          data-testid="friend-guest"
          disabled={busy || linked}
          onClick={beginGuest}
        >
          Join as guest
        </button>
      </div>

      <p className="friend-status" data-testid="friend-status">
        {status}
      </p>

      {failed && (
        <p className="friend-fallback" data-testid="friend-fallback">
          Peers blocked? Use <strong>Pass the Grimoire</strong> on one device
          instead — same working, two chairs.
        </p>
      )}

      {role && !linked && !searching && (
        <button
          type="button"
          className="brass-btn brass-btn-ghost"
          onClick={() => {
            brassClick();
            cleanup();
            handedOff.current = false;
            setRole(null);
            setBusy(false);
            setFailed(false);
            setLinked(false);
            setStatus(
              'Find a match automatically, or host/join with a 4-letter room code.',
            );
          }}
        >
          Cancel
        </button>
      )}

      <button
        type="button"
        className="brass-btn brass-btn-ghost mt-door"
        onClick={() => {
          cleanup();
          onBack();
        }}
      >
        Return
      </button>
    </section>
  );
}
