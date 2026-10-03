import { notePack } from '../game/achievements';
import { useState } from 'react';
import type { Card } from '../game/types';
import { PACK_COST, breakSeal, type Profile } from '../game/profile';
import { brassClick } from '../game/sfx';
import { CardArt } from './CardArt';
import { TarotPop } from './TarotPop';
import { PackOpening, type PackItem } from './PackOpening';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onBack: () => void;
};

export function PackBreak({ profile, onUpdate, onBack }: Props) {
  const [pulls, setPulls] = useState<Card[] | null>(null);
  const [pullFoil, setPullFoil] = useState<boolean[]>([]);
  /** The sealed envelope being opened (the reel shows once it is put away). */
  const [opening, setOpening] = useState<PackItem[] | null>(null);
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
    onUpdate(notePack(result.profile, 'seal'));
    setPulls(result.pulls);
    setPullFoil(result.foil);
    // The reel behind the envelope is already turned: Skip / Keep shows it whole.
    setReveal(result.pulls.length);
    setOpening(result.pulls.map((card, i) => ({ card, foil: !!result.foil[i] })));
  }

  return (
    <section className="pack-break plate-screen" data-testid="pack-break">
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
        <div className="pack-reel" data-testid="pack-reel" style={opening ? { display: "none" } : undefined}>
          {pulls.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              type="button"
              className={`pack-pull ${i < reveal ? 'is-shown' : 'is-sealed'}${pullFoil[i] ? ' is-foil' : ''}`}
              onClick={() => i < reveal && setInspect(c)}
            >
              {i < reveal ? (
                <>
                  <CardArt name={c.name} className="pack-pull-art" />
                  <span>{c.name}</span>
                  <em>{pullFoil[i] ? `foil · ${c.rarity}` : c.rarity}</em>
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
        <TarotPop
          card={inspect}
          foil={!!pulls && pullFoil[pulls.indexOf(inspect)]}
          onClose={() => setInspect(null)}
        />
      )}
      {opening && (
        <PackOpening items={opening} label="Five assorted plates" onClose={() => setOpening(null)} />
      )}
    </section>
  );
}
