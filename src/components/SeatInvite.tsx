import { useEffect, useRef, useState } from 'react';
import { readSeatState } from '../net/account';
import { useSeat } from '../hooks/useSeat';
import { brassClick } from '../game/sfx';
import {
  declineSeatInvite,
  markSeatOffered,
  markSeated,
  noteSeatMatch,
  shouldOfferSeat,
} from '../game/seatInvite';

type Props = {
  /** Opens the Ledger straight onto its sign-up form. */
  onTakeSeat?: () => void;
  /** False where the plate never lingers (e.g. a Leaden Hour stage): count, never offer. */
  offer?: boolean;
};

/**
 * "Take a seat" on the match-over plate. Mounting = one finished match.
 * Sits below the plate's buttons and fades in after the fortune chest has
 * counted, so it never covers the shard reveal or New sitting / Return.
 */
export function SeatInvite({ onTakeSeat, offer = true }: Props) {
  const { status, seat } = useSeat();
  const [show, setShow] = useState(false);
  const noted = useRef(false);

  useEffect(() => {
    if (noted.current) return;
    noted.current = true;
    const s = noteSeatMatch();
    const now = readSeatState();
    if (now.seat) {
      markSeated();
      return;
    }
    if (offer && onTakeSeat && now.status !== 'shut' && shouldOfferSeat(s)) {
      markSeatOffered();
      setShow(true);
    }
  }, [offer, onTakeSeat]);

  useEffect(() => {
    if (seat) markSeated();
  }, [seat]);

  if (!show || seat || status === 'shut' || !onTakeSeat) return null;

  return (
    <aside className="seat-invite" data-testid="seat-invite" aria-label="Take a seat">
      <p className="seat-invite-kicker">
        <span aria-hidden>§</span> An empty chair
      </p>
      <p className="seat-invite-copy">
        Take a seat at the table. An account keeps your collection, workings and record across
        devices.
      </p>
      <div className="seat-invite-actions">
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="seat-invite-take"
          onClick={() => {
            brassClick();
            onTakeSeat();
          }}
        >
          Take a seat
        </button>
        <button
          type="button"
          className="brass-btn brass-btn-ghost"
          data-testid="seat-invite-later"
          onClick={() => {
            brassClick();
            declineSeatInvite();
            setShow(false);
          }}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
