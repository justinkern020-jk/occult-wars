import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  CHALLENGE_CLEARED_EVENT,
  CHALLENGE_POSTED_EVENT,
  TABLE_CHALLENGE_EVENT,
  acceptChallenge,
  cancelChallenge,
  getTableState,
  onTableState,
  readTableSnapshot,
  subscribeTable,
  type TableChallengeDetail,
} from '../net/table';
import { randomRoomCode } from '../net/friendSession';
import { brassClick } from '../game/sfx';

/** Grace after the sixty seconds for a guest that answered to finish linking. */
const LINK_GRACE_MS = 15_000;

export function dispatchTableChallenge(detail: TableChallengeDetail): void {
  window.dispatchEvent(new CustomEvent(TABLE_CHALLENGE_EVENT, { detail }));
}

/**
 * "N playing" pill + "Issue a challenge" (ported from grok.me). The pill sits
 * top-right, or docks into the field's shell bar (#playing-dock). A challenge
 * from another hand interrupts with "A knock at the table" unless this hand is
 * already seated in a two-hand match.
 */
export function PlayingNow() {
  const snap = useSyncExternalStore(subscribeTable, readTableSnapshot, readTableSnapshot);
  const tableState = useSyncExternalStore(onTableState, getTableState, getTableState);
  const [mine, setMine] = useState<{ room: string; until: number } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [note, setNote] = useState('');
  const [offer, setOffer] = useState<string | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const dismissed = useRef(new Set<string>());
  const [, bump] = useState(0);

  const view = snap.view;
  const open = view?.challenge ?? null;
  const theirs = open && !open.mine ? open : null;

  // Find the field dock when the shell bar mounts / unmounts.
  useEffect(() => {
    const find = () => {
      const el = document.getElementById('playing-dock');
      setDock((prev) => (prev === el ? prev : el));
    };
    find();
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // FriendWorking reports whether the hosted challenge reached the table.
  useEffect(() => {
    const posted = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; room?: string }>).detail;
      setIssuing(false);
      if (d?.ok && d.room) {
        setMine({ room: d.room, until: Date.now() + 60_000 });
        setNote('');
      } else {
        setMine(null);
        setNote('The challenge did not go out.');
      }
    };
    const cleared = () => {
      setIssuing(false);
      setMine(null);
    };
    window.addEventListener(CHALLENGE_POSTED_EVENT, posted);
    window.addEventListener(CHALLENGE_CLEARED_EVENT, cleared);
    return () => {
      window.removeEventListener(CHALLENGE_POSTED_EVENT, posted);
      window.removeEventListener(CHALLENGE_CLEARED_EVENT, cleared);
    };
  }, []);

  // Nobody answered in time: call it off and return the host to the atelier.
  useEffect(() => {
    if (!mine) return;
    const t = window.setTimeout(
      () => {
        setMine(null);
        setNote('Challenge denied.');
        void cancelChallenge();
        dispatchTableChallenge({ action: 'cancel' });
      },
      Math.max(0, mine.until - Date.now()) + LINK_GRACE_MS,
    );
    return () => window.clearTimeout(t);
  }, [mine]);

  // The host never reached the table (peer blocked, or still swearing an order).
  useEffect(() => {
    if (!issuing) return;
    const t = window.setTimeout(() => {
      setIssuing(false);
      setNote((n) => n || 'The challenge did not go out.');
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [issuing]);

  // Someone else's challenge knocks — unless seated in a live match.
  useEffect(() => {
    if (!theirs || tableState === 'live' || dismissed.current.has(theirs.room)) return;
    setOffer((prev) => prev ?? theirs.room);
  }, [theirs, tableState]);

  useEffect(() => {
    if (!offer) return;
    if (tableState === 'live') {
      setOffer(null);
      return;
    }
    const left = theirs && theirs.room === offer ? theirs.left : 0;
    const t = window.setTimeout(() => {
      dismissed.current.add(offer);
      setOffer(null);
      setNote('Challenge denied.');
    }, Math.min(60_000, Math.max(0, left)));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, tableState]);

  // The knock vanished from the table (taken, lapsed or called off).
  useEffect(() => {
    if (offer && snap.status === 'open' && (!theirs || theirs.room !== offer)) {
      dismissed.current.add(offer);
      setOffer(null);
    }
  }, [offer, theirs, snap.status]);

  function issue() {
    brassClick();
    if (mine || issuing || theirs) {
      setNote('One challenge at a time.');
      return;
    }
    setNote('');
    setIssuing(true);
    dispatchTableChallenge({ action: 'issue', room: randomRoomCode() });
  }

  function callOff() {
    brassClick();
    setMine(null);
    setIssuing(false);
    void cancelChallenge();
    dispatchTableChallenge({ action: 'cancel' });
  }

  function play() {
    const room = offer;
    if (!room) return;
    brassClick();
    setNote('');
    void acceptChallenge(room).then((ok) => {
      dismissed.current.add(room);
      setOffer(null);
      bump((n) => n + 1);
      if (!ok) {
        setNote('That occultist has already sat down.');
        return;
      }
      dispatchTableChallenge({ action: 'accept', room });
    });
  }

  function notNow() {
    brassClick();
    if (offer) dismissed.current.add(offer);
    setOffer(null);
  }

  const playing = snap.status === 'open' && view ? view.playing : null;
  const label =
    playing == null
      ? snap.status === 'shut'
        ? 'The table is shut'
        : 'Counting who is playing'
      : `${playing} ${playing === 1 ? 'person' : 'people'} playing now`;

  const pill = (
    <div
      className={dock ? 'playing-now is-docked' : 'playing-now'}
      data-testid="playing-now"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className={`playing-now-dot${snap.status === 'shut' ? ' is-shut' : ''}`} aria-hidden />
      <span className="playing-now-count" data-testid="playing-now-count">
        {playing ?? (snap.status === 'shut' ? '—' : '…')}
      </span>
      <span>playing</span>
      <button
        type="button"
        className="playing-now-challenge"
        data-testid="issue-challenge"
        disabled={!!mine || issuing || !!theirs || snap.status === 'shut'}
        onClick={issue}
      >
        {mine || issuing ? 'Challenge issued' : theirs ? 'A challenge is out' : 'Issue a challenge'}
      </button>
      {note ? <span className="playing-now-note">{note}</span> : null}
    </div>
  );

  return (
    <>
      {dock ? createPortal(pill, dock) : pill}
      {mine && (
        <div className="challenge-issued" data-testid="challenge-issued" role="status">
          <p>Challenge issued. They have 60 seconds to accept.</p>
          <button type="button" className="brass-btn brass-btn-ghost" onClick={callOff}>
            Call it off
          </button>
        </div>
      )}
      {offer && tableState !== 'live' && (
        <div
          className="challenge-interrupt"
          data-testid="challenge-interrupt"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-interrupt-title"
        >
          <div className="challenge-interrupt-plate plate">
            <p className="plate-kicker">A knock at the table</p>
            <h2 id="challenge-interrupt-title" className="challenge-interrupt-title">
              Another occultist asks if you want to play.
            </h2>
            <div className="challenge-interrupt-actions">
              <button
                type="button"
                className="brass-btn brass-btn-solid"
                data-testid="challenge-play"
                onClick={play}
              >
                Play
              </button>
              <button
                type="button"
                className="brass-btn brass-btn-ghost"
                data-testid="challenge-dismiss"
                onClick={notNow}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
