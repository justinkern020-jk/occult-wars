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
import {
  loadoutFromWorking,
  sanitizeFriendLoadout,
  type FriendLoadout,
} from '../net/friendLoadout';
import { cardById } from '../data/catalog';
import type { CustomDeck } from '../game/profile';
import {
  CHALLENGE_CLEARED_EVENT,
  CHALLENGE_POSTED_EVENT,
  cancelChallenge,
  issueChallenge,
} from '../net/table';

export type FriendReadyPayload = {
  room: string;
  role: FriendRole;
  session: FriendSession;
  hostLoadout: FriendLoadout;
  guestLoadout: FriendLoadout;
};

type Props = {
  /** Player's saved Deck Editor lists. */
  customDecks: CustomDeck[];
  /** Sworn first-hour order for loadout faction. */
  allegiance: string | null;
  /** A table challenge to host (issued) or join (answered) on mount. */
  tableChallenge?: { role: FriendRole; room: string } | null;
  onReady: (payload: FriendReadyPayload) => void;
  onBack: () => void;
};

const LOADOUT_RETRY_MS = 300;
const LOADOUT_MAX_ATTEMPTS = 40;

/**
 * Friend Working lobby: Quick Match + 4-letter room Host/Join.
 * Exchanges loadouts over PeerJS before entering the field.
 */
export function FriendWorking({
  customDecks,
  allegiance,
  tableChallenge = null,
  onReady,
  onBack,
}: Props) {
  const [deckId, setDeckId] = useState(() => customDecks[0]?.id ?? '');
  const selectedDeck =
    customDecks.find((d) => d.id === deckId) ?? customDecks[0];
  const localLoadout = loadoutFromWorking(selectedDeck, allegiance);

  const [room, setRoom] = useState(randomRoomCode);
  const [role, setRole] = useState<FriendRole | null>(null);
  const defaultStatus =
    'Choose which Deck Editor list to bring, then find a match or host/join with a 4-letter room code.';
  const [status, setStatus] = useState(defaultStatus);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [linked, setLinked] = useState(false);
  const sessionRef = useRef<FriendSession | null>(null);
  const quickRef = useRef<QuickMatchHandle | null>(null);
  const readySent = useRef(false);
  const handedOff = useRef(false);
  const handshakeTimer = useRef<number | null>(null);
  const localLoadoutRef = useRef(localLoadout);
  localLoadoutRef.current = localLoadout;
  /** A challenge of ours is on the table and not yet answered. */
  const challengeOut = useRef(false);

  const clearHandshakeTimer = useCallback(() => {
    if (handshakeTimer.current != null) {
      window.clearInterval(handshakeTimer.current);
      handshakeTimer.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (handedOff.current) return;
    clearHandshakeTimer();
    quickRef.current?.cancel();
    quickRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    readySent.current = false;
  }, [clearHandshakeTimer]);

  const clearChallenge = useCallback(() => {
    if (!challengeOut.current) return;
    challengeOut.current = false;
    void cancelChallenge();
    window.dispatchEvent(new CustomEvent(CHALLENGE_CLEARED_EVENT));
  }, []);

  useEffect(
    () => () => {
      cleanup();
      clearChallenge();
    },
    [cleanup, clearChallenge],
  );

  // Table challenge: host the room we posted, or join the room we answered.
  const challengeKey = tableChallenge ? `${tableChallenge.role}:${tableChallenge.room}` : '';
  useEffect(() => {
    if (!tableChallenge) return;
    if (tableChallenge.role === 'host') beginHost(tableChallenge.room, true);
    else beginGuest(tableChallenge.room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeKey]);

  function finishReady(
    session: FriendSession,
    hostLoadout: FriendLoadout,
    guestLoadout: FriendLoadout,
  ) {
    if (readySent.current) return;
    readySent.current = true;
    handedOff.current = true;
    if (challengeOut.current) {
      // Answered — the table already struck it off; just drop the banner.
      challengeOut.current = false;
      window.dispatchEvent(new CustomEvent(CHALLENGE_CLEARED_EVENT));
    }
    clearHandshakeTimer();
    session.setOnMessage(null);
    sessionRef.current = null;
    quickRef.current = null;
    setLinked(true);
    setSearching(false);
    setBusy(false);
    setStatus(
      session.role === 'host'
        ? `Connected · you are Azure (host). Room ${session.room}. Workings exchanged.`
        : `Connected · you are Crimson (guest). Room ${session.room}. Workings exchanged.`,
    );
    onReady({
      room: session.room,
      role: session.role,
      session,
      hostLoadout,
      guestLoadout,
    });
  }

  function beginHandshake(session: FriendSession) {
    if (readySent.current) return;
    setStatus(
      session.via?.() === 'relay'
        ? 'Linked through the relay — exchanging Deck Editor workings…'
        : 'Linked — exchanging Deck Editor workings…',
    );
    setSearching(false);
    setBusy(true);

    const local = sanitizeFriendLoadout(localLoadoutRef.current);
    let peer: FriendLoadout | null = null;
    let attempts = 0;

    const sendLocal = () => {
      session.send({
        v: 1,
        type: 'loadout',
        heroId: local.heroId,
        cards: local.cards,
        faction: local.faction,
      });
    };

    const tryFinish = () => {
      if (readySent.current || !peer) return;
      clearHandshakeTimer();
      if (session.role === 'host') {
        finishReady(session, local, peer);
      } else {
        finishReady(session, peer, local);
      }
    };

    session.setOnMessage((msg) => {
      if (msg.type !== 'loadout') return;
      peer = sanitizeFriendLoadout(msg);
      // Echo ours so a peer that missed the first send still gets it.
      sendLocal();
      tryFinish();
    });

    sendLocal();
    clearHandshakeTimer();
    handshakeTimer.current = window.setInterval(() => {
      if (readySent.current) {
        clearHandshakeTimer();
        return;
      }
      attempts += 1;
      sendLocal();
      if (attempts >= LOADOUT_MAX_ATTEMPTS) {
        clearHandshakeTimer();
        setBusy(false);
        setFailed(true);
        setStatus(
          'Timed out exchanging workings. Ask your partner to retry, or use Pass the Grimoire.',
        );
        try {
          session.destroy();
        } catch {
          /* ignore */
        }
        sessionRef.current = null;
      }
    }, LOADOUT_RETRY_MS);
  }

  function beginQuickMatch() {
    brassClick();
    clearChallenge();
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
        sessionRef.current = session;
        setRole(session.role);
        beginHandshake(session);
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
    clearHandshakeTimer();
    quickRef.current?.cancel();
    quickRef.current = null;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setSearching(false);
    setBusy(false);
    setRole(null);
    setFailed(false);
    setStatus(
      defaultStatus,
    );
  }

  function beginHost(forRoom?: string, challenge = false) {
    brassClick();
    const code = normalizeRoomCode(forRoom ?? room);
    if (!code) {
      setStatus('Room needs exactly 4 letters (A–Z).');
      return;
    }
    if (!challenge) clearChallenge();
    cleanup();
    handedOff.current = false;
    setFailed(false);
    setLinked(false);
    setSearching(false);
    setBusy(true);
    setRole('host');
    setRoom(code);
    setStatus(
      challenge
        ? `Issuing a challenge to everyone playing… room ${code}`
        : `Waiting for guest… share code ${code}`,
    );
    const postFailed = () => {
      if (!challenge) return;
      window.dispatchEvent(new CustomEvent(CHALLENGE_POSTED_EVENT, { detail: { ok: false } }));
    };
    try {
      let session!: FriendSession;
      session = hostFriendSession(code, {
        onHosting: () => {
          if (!challenge) return;
          challengeOut.current = true;
          void issueChallenge(code).then((ok) => {
            if (readySent.current) return;
            if (!ok) {
              challengeOut.current = false;
              postFailed();
              setStatus('One challenge is already out. Wait for it to finish.');
              return;
            }
            window.dispatchEvent(
              new CustomEvent(CHALLENGE_POSTED_EVENT, { detail: { ok: true, room: code } }),
            );
            setStatus(`Challenge issued. Waiting for another occultist. Room ${code}.`);
          });
        },
        onOpen: () => beginHandshake(session),
        onError: (err) => {
          postFailed();
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
            clearHandshakeTimer();
            setBusy(false);
            setStatus(reason || 'Channel closed before a guest joined.');
          }
        },
      });
      sessionRef.current = session;
    } catch (err) {
      postFailed();
      setBusy(false);
      setFailed(true);
      setStatus(
        `Could not start host (${err instanceof Error ? err.message : 'error'}). Try Pass the Grimoire instead.`,
      );
    }
  }

  function beginGuest(forRoom?: string) {
    brassClick();
    const code = normalizeRoomCode(forRoom ?? room);
    if (!code) {
      setStatus('Enter the host’s 4-letter room code first.');
      return;
    }
    clearChallenge();
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
      let session!: FriendSession;
      session = joinFriendSession(code, {
        onOpen: () => beginHandshake(session),
        onError: (err) => {
          setBusy(false);
          setFailed(true);
          setStatus(
            `Could not join (${err}). Confirm the host is waiting, or try Quick Match / Pass the Grimoire.`,
          );
        },
        onClose: (reason) => {
          if (!readySent.current) {
            clearHandshakeTimer();
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
        for a private sitting. Host plays Azure; guest plays Crimson. Each
        player chooses which Deck Editor list to bring before matching.
      </p>

      {customDecks.length === 0 ? (
        <p className="friend-deck-empty" data-testid="friend-deck-empty">
          Save a working in the Deck Editor before Friend Working.
        </p>
      ) : (
        <label className="friend-deck-picker">
          Your working
          <select
            data-testid="friend-deck-select"
            value={selectedDeck?.id ?? ''}
            disabled={busy || linked}
            onChange={(e) => setDeckId(e.target.value)}
          >
            {customDecks.map((d) => {
              const hero = cardById(d.heroId)?.name ?? 'Hero';
              return (
                <option key={d.id} value={d.id}>
                  {d.name} — {hero}
                </option>
              );
            })}
          </select>
        </label>
      )}

      <div className="friend-roles friend-roles-quick">
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="friend-quick"
          disabled={busy || linked || customDecks.length === 0}
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
          disabled={busy || linked || customDecks.length === 0}
          onClick={() => beginHost()}
        >
          Host the field
        </button>
        <button
          type="button"
          className="brass-btn"
          data-testid="friend-guest"
          disabled={busy || linked || customDecks.length === 0}
          onClick={() => beginGuest()}
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
            clearChallenge();
            cleanup();
            handedOff.current = false;
            setRole(null);
            setBusy(false);
            setFailed(false);
            setLinked(false);
            setStatus(
              defaultStatus,
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
          clearChallenge();
          cleanup();
          onBack();
        }}
      >
        Return
      </button>
    </section>
  );
}
