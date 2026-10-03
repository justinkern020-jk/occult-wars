import { useEffect, useState, useSyncExternalStore } from 'react';
import { readSecretCounts, SECRET_LABEL, SECRET_ORDER, type SecretCounts } from '../net/secrets';
import { readPlayedCount, readVisitCount } from '../game/visits';
import { PortalDoor } from './Portal';
import { beatNow, countryName, readTableSnapshot, subscribeTable } from '../net/table';

type Props = {
  onClose: () => void;
};

/** Live tally from /api/table plus this device's sittings (grok "Besides you"). */
export function BattleCountModal({ onClose }: Props) {
  const first = readVisitCount('first');
  const second = readVisitCount('second');
  const old = readVisitCount('old');
  const mine = {
    first: readPlayedCount('first'),
    second: readPlayedCount('second'),
    old: readPlayedCount('old'),
  };
  const snap = useSyncExternalStore(subscribeTable, readTableSnapshot, readTableSnapshot);
  const [secrets, setSecrets] = useState<SecretCounts | null | 'wait'>('wait');
  useEffect(() => {
    let live = true;
    void readSecretCounts().then((c) => {
      if (live) setSecrets(c);
    });
    return () => {
      live = false;
    };
  }, []);

  // Read the table while the book is open.
  useEffect(() => {
    beatNow();
    const t = window.setInterval(beatNow, 6_000);
    return () => window.clearInterval(t);
  }, []);

  const wait = snap.status === 'wait' && !snap.view;
  const shut = snap.status === 'shut' && !snap.view;
  const view = snap.view;
  const playing = view ? view.playing : null;
  const others = playing == null ? null : Math.max(0, playing - 1);
  const names = (view?.others ?? []).map(countryName).filter((c) => c !== 'Unknown');
  const where = wait
    ? '…'
    : shut
      ? '—'
      : others === 0
        ? 'No one else is seated'
        : names.length > 0
          ? [...new Set(names)].join(', ')
          : 'Not known yet';
  const checkins = view?.checkins ?? [];

  return (
    <div
      className="battle-count-overlay"
      data-testid="battle-count"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-count-title"
    >
      <div className="battle-count-plate plate">
        <p className="plate-kicker">The closed book</p>
        <h1 id="battle-count-title" className="battle-count-title">
          Besides you
        </h1>

        <dl className="battle-count-grid">
          <div className="battle-count-stat battle-count-stat-wide">
            <dt>Playing now</dt>
            <dd data-testid="battle-count-playing">{wait ? '…' : shut ? '—' : playing}</dd>
          </div>
          <div className="battle-count-stat battle-count-stat-wide">
            <dt>Besides you</dt>
            <dd data-testid="battle-count-others">{wait ? '…' : shut ? '—' : others}</dd>
          </div>
          <div className="battle-count-stat battle-count-stat-wide">
            <dt>Their country</dt>
            <dd data-testid="battle-count-country" className="battle-count-where">
              {where}
            </dd>
          </div>
          <div className="battle-count-stat">
            <dt>First Hour sittings</dt>
            <dd data-testid="battle-count-first">{first}</dd>
          </div>
          <div className="battle-count-stat">
            <dt>Second Hour sittings</dt>
            <dd data-testid="battle-count-second">{second}</dd>
          </div>
          <div className="battle-count-stat">
            <dt>Sealed Century sittings</dt>
            <dd data-testid="battle-count-old">{old}</dd>
          </div>
        </dl>

        <section className="battle-count-played" data-testid="battle-count-played">
          <h2>Matches played</h2>
          <ul>
            {(
              [
                ['first', 'First Hour'],
                ['second', 'Second Hour'],
                ['old', 'Sealed Century (prequel)'],
              ] as const
            ).map(([era, label]) => {
              const all = view?.played?.[era];
              return (
                <li key={era} data-testid={`battle-count-played-${era}`}>
                  <span>{label}:</span>{' '}
                  <b>{all == null ? (wait ? '…' : '—') : all.toLocaleString()} played</b>
                  <small> · yours {mine[era].toLocaleString()}</small>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="battle-count-played battle-count-secrets" data-testid="battle-count-secrets">
          <h2>Secrets uncovered</h2>
          <ul>
            {SECRET_ORDER.map((id) => {
              const n = secrets === 'wait' ? null : secrets?.[id];
              return (
                <li key={id} data-testid={`battle-count-secret-${id}`}>
                  <span>{SECRET_LABEL[id]}:</span>{' '}
                  <b>
                    {n == null ? (secrets === 'wait' ? '…' : '—') : n.toLocaleString()}{' '}
                    {n === 1 ? 'player' : 'players'}
                  </b>
                </li>
              );
            })}
          </ul>
        </section>

        {shut ? (
          <p className="battle-count-shut" data-testid="battle-count-remote">
            At the table · The tally is shut.
          </p>
        ) : wait ? (
          <p className="battle-count-live" data-testid="battle-count-remote">
            Counting the hands at the table.
          </p>
        ) : (
          <p className="battle-count-live" data-testid="battle-count-remote">
            {playing === 1
              ? 'You are the only one seated. The count includes you.'
              : `${playing} hands are seated, counting yours. ${others} ${
                  others === 1 ? 'other hand is' : 'other hands are'
                } at the table.`}
          </p>
        )}

        <section className="battle-count-analytics" data-testid="battle-count-analytics">
          <h2>Countries checked in</h2>
          {wait ? (
            <p>Reading the stored list.</p>
          ) : checkins.length === 0 ? (
            <p>No country has checked in yet.</p>
          ) : (
            <ol>
              {checkins.map((c) => (
                <li key={c.country}>
                  <span>{countryName(c.country)}</span>
                  <b>{c.n}</b>
                </li>
              ))}
            </ol>
          )}
        </section>

        <PortalDoor />

        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="battle-count-close"
          onClick={onClose}
        >
          Close the book
        </button>
      </div>
    </div>
  );
}
