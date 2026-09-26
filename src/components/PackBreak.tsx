import { useState } from 'react';
import type { Card } from '../game/types';
import { PACK_COST, breakSeal, type Profile } from '../game/profile';
import { brassClick } from '../game/sfx';
import { CardArt } from './CardArt';
import { CardView } from './CardView';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onBack: () => void;
};

export function PackBreak({ profile, onUpdate, onBack }: Props) {
  const [pulls, setPulls] = useState<Card[] | null>(null);
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Card | null>(null);

  function open() {
    const result = breakSeal(profile);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    brassClick();
    setError(null);
    onUpdate(result.profile);
    setPulls(result.pulls);
    setReveal(0);
    const tick = () => {
      setReveal((r) => {
        if (r + 1 >= result.pulls.length) return result.pulls.length;
        setTimeout(tick, 280);
        return r + 1;
      });
    };
    setTimeout(tick, 200);
  }

  return (
    <section className="pack-break" data-testid="pack-break">
      <p className="plate-kicker">Break a Seal</p>
      <h2>Five assorted plates</h2>
      <p className="lede">
        {PACK_COST} shards · first three lean toward your order and ally. You hold{' '}
        <strong>{profile.alchemicalShards}</strong> shards.
      </p>
      {error && <p className="error-line">{error}</p>}

      {!pulls ? (
        <button
          type="button"
          className="brass-btn brass-btn-solid menu-door"
          data-testid="break-seal"
          disabled={profile.alchemicalShards < PACK_COST}
          onClick={open}
        >
          Break a Seal · {PACK_COST} shards
        </button>
      ) : (
        <div className="pack-reel" data-testid="pack-reel">
          {pulls.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              type="button"
              className={`pack-pull ${i < reveal ? 'is-shown' : 'is-sealed'}`}
              onClick={() => i < reveal && setInspect(c)}
            >
              {i < reveal ? (
                <>
                  <CardArt name={c.name} className="pack-pull-art" />
                  <span>{c.name}</span>
                  <em>{c.rarity}</em>
                </>
              ) : (
                <span className="pack-wax">✦</span>
              )}
            </button>
          ))}
          <button
            type="button"
            className="brass-btn"
            onClick={() => {
              setPulls(null);
              setReveal(0);
            }}
          >
            Another seal
          </button>
        </div>
      )}

      <button type="button" className="brass-btn brass-btn-ghost mt-door" onClick={onBack}>
        Return to the atelier
      </button>

      {inspect && (
        <div className="tarot-pop" role="dialog" onClick={() => setInspect(null)}>
          <div className="tarot-pop-inner" onClick={(e) => e.stopPropagation()}>
            <CardView card={inspect} />
            <button type="button" className="brass-btn" onClick={() => setInspect(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
