/** The Ladder: this month's live-table standings, Initiate to Magus. */
import { useEffect, useState } from 'react';
import { readLadder, seasonLabel, useMyRank, type LadderRow } from '../net/ranked';

export function RankBadge({ row, compact = false }: { row: LadderRow | null; compact?: boolean }) {
  if (!row) return null;
  return (
    <span className={`rank-badge${compact ? ' is-compact' : ''}`} data-testid="rank-badge" title={`${row.pts} ladder points`}>
      <span className="rank-sigil" aria-hidden>
        ☉
      </span>
      {row.rank}
      {!compact && <small> · {row.pts} pts</small>}
    </span>
  );
}

export function Ladder({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ season: string; rows: LadderRow[] } | null>(null);
  const [note, setNote] = useState('');
  const me = useMyRank();
  useEffect(() => {
    window.scrollTo(0, 0);
    readLadder()
      .then(setData)
      .catch((e: Error & { shut?: boolean }) => setNote(e.shut ? 'The ladder is shut until the ledger store is connected.' : e.message));
  }, []);
  return (
    <section className="honours ladder" data-testid="ladder">
      <header className="codex-head">
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return to the atelier
        </button>
        <div>
          <p className="plate-kicker">The live tables · {data ? seasonLabel(data.season) : 'this season'}</p>
          <h1 className="codex-title">The Ladder</h1>
          <p className="codex-count">Initiate to Magus. Friend Working sittings between two seated hands.</p>
        </div>
      </header>
      <div className="honours-worn plate">
        {me ? (
          <p className="honours-name">
            Your standing: <RankBadge row={me} /> <small className="ladder-wl">{me.w}W · {me.l}L</small>
          </p>
        ) : (
          <p className="honours-name">Take a seat in the Ledger to climb the ladder.</p>
        )}
        <p className="ladder-rules">
          A win is +25, a loss −15 (never below your division). Three divisions to a grade, 100 points each. Both
          chairs must finish and agree; practice and the AI never count. The ladder starts afresh each month.
        </p>
      </div>
      {note && <p className="ledger-wait">{note}</p>}
      {data && data.rows.length === 0 && <p className="ledger-wait">No sitting has been settled this month yet.</p>}
      {data && data.rows.length > 0 && (
        <ol className="ladder-list" data-testid="ladder-list">
          {data.rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className={i < 3 ? `is-top is-top-${i + 1}` : ''}>
              <span className="ladder-place">{i + 1}</span>
              <span className="ladder-name">{r.name}</span>
              <RankBadge row={r} compact />
              <span className="ladder-pts">{r.pts}</span>
              <span className="ladder-wl">
                {r.w}W · {r.l}L
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
