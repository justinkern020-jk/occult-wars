import { useCallback, useEffect, useState } from 'react';
import {
  AccountError,
  readBook,
  recordLine,
  signIn,
  signOut,
  signUp,
  takeLedgerName,
  type BookRow,
  type Seat,
} from '../net/account';
import { useSeat } from '../hooks/useSeat';
import { brassClick } from '../game/sfx';

type Props = { onBack: () => void };

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The Ledger — an account, a name in the book, a record, the other occultists. */
export function Ledger({ onBack }: Props) {
  const { status, seat } = useSeat();
  const [book, setBook] = useState<BookRow[] | null>(null);
  const [bookNote, setBookNote] = useState('');

  const loadBook = useCallback(() => {
    readBook()
      .then((rows) => {
        setBook(rows);
        setBookNote('');
      })
      .catch((err: unknown) => {
        setBook([]);
        setBookNote(
          err instanceof AccountError && err.shut
            ? 'The book is shut for now.'
            : message(err, 'The book could not be read.'),
        );
      });
  }, []);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  return (
    <section className="ledger" data-testid="ledger">
      <p className="plate-kicker">The closed book</p>
      <h1 className="ledger-title">The Ledger</h1>
      <p className="ledger-lead">
        A name, then a record. Wins and losses at the live table are the standing. Practice is
        kept, but it does not outrank a real sitting.
      </p>

      {status === 'shut' ? (
        <div className="ledger-gate plate" data-testid="ledger-shut">
          <p>
            The book is shut. Accounts open once the ledger store is connected to this table. Your
            progress stays on this device until then.
          </p>
        </div>
      ) : status === 'unknown' ? (
        <div className="ledger-gate plate">
          <p className="ledger-wait">Opening the book.</p>
        </div>
      ) : seat ? (
        <SeatPage seat={seat} onNamed={loadBook} />
      ) : (
        <TakeASeat offline={status === 'offline'} />
      )}

      <div className="ledger-book plate">
        <p className="plate-kicker">Who has a name</p>
        {book == null ? (
          <p className="ledger-wait">Reading the book.</p>
        ) : bookNote ? (
          <p className="ledger-wait">{bookNote}</p>
        ) : book.length === 0 ? (
          <p className="ledger-wait">No occultist has taken a name yet.</p>
        ) : (
          <ol className="ledger-list" data-testid="ledger-book">
            {book.map((row, i) => (
              <li key={row.username}>
                <span className="ledger-rank">{i + 1}</span>
                <span className="ledger-name">{row.username}</span>
                <span className="ledger-score">
                  {row.tableWins}–{row.tableLosses}
                  <small>table</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button
        type="button"
        className="brass-btn"
        onClick={() => {
          brassClick();
          onBack();
        }}
      >
        Return to the atelier
      </button>
    </section>
  );
}

function TakeASeat({ offline }: { offline: boolean }) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState(offline ? 'The ledger could not be reached. Try again.' : '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setNote('');
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(email.trim(), password, name.trim());
      else await signIn(email.trim(), password);
    } catch (err) {
      setNote(message(err, 'The book refused that.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ledger-self plate account-seat" data-testid="take-a-seat">
      <div className="ledger-self-head">
        <p className="plate-kicker">Take a seat</p>
      </div>
      <p className="ledger-wait">
        {mode === 'signup'
          ? 'An account keeps your collection, workings and record across devices.'
          : 'Sign in to bring your page back.'}
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'signup' && (
          <label>
            Name on the account
            <input
              value={name}
              maxLength={40}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="brass-btn brass-btn-solid" disabled={busy}>
          {mode === 'signup' ? 'Create the account' : 'Sign in'}
        </button>
      </form>
      {note ? <p className="account-note">{note}</p> : null}
      <button
        type="button"
        className="account-switch"
        onClick={() => {
          setNote('');
          setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
        }}
      >
        {mode === 'signup' ? 'I already have a seat' : 'Create an account instead'}
      </button>
    </div>
  );
}

function SeatPage({ seat, onNamed }: { seat: Seat; onNamed: () => void }) {
  const [draft, setDraft] = useState(seat.username ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function claim() {
    setNote('');
    setBusy(true);
    try {
      await takeLedgerName(draft);
      onNamed();
    } catch (err) {
      setNote(message(err, 'The book refused that name.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ledger-self plate" data-testid="ledger-seat">
      <div className="ledger-self-head">
        <p className="plate-kicker">Your seat</p>
        <div className="account-who">
          <span className="account-initial" aria-hidden>
            {(seat.displayName || seat.email).charAt(0).toUpperCase()}
          </span>
          <span className="account-name">{seat.displayName || seat.email}</span>
          <button
            type="button"
            className="account-switch"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signOut()
                .catch(() => undefined)
                .finally(() => setBusy(false));
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void claim();
        }}
      >
        <label>
          Name the other occultists will see
          <input value={draft} maxLength={18} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button type="submit" className="brass-btn brass-btn-solid" disabled={busy}>
          {seat.username ? 'Change the name' : 'Take this name'}
        </button>
      </form>
      {note ? <p className="account-note">{note}</p> : null}
      {seat.username ? (
        <dl className="ledger-record">
          <div>
            <dt>Table</dt>
            <dd>
              {seat.tableWins}–{seat.tableLosses}
              <span>{recordPercent(seat.tableWins, seat.tableLosses)}</span>
            </dd>
          </div>
          <div>
            <dt>Practice</dt>
            <dd>
              {seat.practiceWins}–{seat.practiceLosses}
              <span>{recordPercent(seat.practiceWins, seat.practiceLosses)}</span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="ledger-wait">No record until the name is in the book.</p>
      )}
    </div>
  );
}

function recordPercent(w: number, l: number): string {
  const line = recordLine(w, l);
  return line === 'untried' ? line : line.split(' · ')[1];
}
