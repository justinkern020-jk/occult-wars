import { readVisitCount } from '../game/visits';

type Props = {
  onClose: () => void;
};

/** Local sittings + shut remote tally — grok "Besides you" without server API. */
export function BattleCountModal({ onClose }: Props) {
  const first = readVisitCount('first');
  const second = readVisitCount('second');

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
          <div className="battle-count-stat">
            <dt>First Hour sittings</dt>
            <dd data-testid="battle-count-first">{first}</dd>
          </div>
          <div className="battle-count-stat">
            <dt>Second Hour sittings</dt>
            <dd data-testid="battle-count-second">{second}</dd>
          </div>
        </dl>

        <p className="battle-count-shut" data-testid="battle-count-remote">
          Other hands · The tally is shut.
        </p>

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
