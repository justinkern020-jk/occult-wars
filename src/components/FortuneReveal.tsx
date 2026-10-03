import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { spellCastSfx } from '../game/sfx';

type Props = {
  /** Shards this match paid. */
  gain: number;
  /** The purse after the payout. */
  total: number;
  won: boolean;
};

const COUNT_MS = 1400;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The fortune chest on the match-over plate: shards count up from 0, a chime, the new purse. */
export function FortuneReveal({ gain, total, won }: Props) {
  const still = useMemo(() => reducedMotion(), []);
  const [shown, setShown] = useState(still ? gain : 0);
  const done = shown >= gain;

  useEffect(() => {
    if (still || gain <= 0) return;
    let raf = 0;
    const start = performance.now() + 350;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / COUNT_MS));
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(gain * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gain, still]);

  useEffect(() => {
    if (!done || gain <= 0) return;
    try {
      spellCastSfx();
    } catch {
      /* audio locked */
    }
  }, [done, gain]);

  const sparks = useMemo(
    () =>
      Array.from({ length: won ? 16 : 7 }, (_, i) => ({
        x: 8 + ((i * 37) % 84),
        d: (i * 0.23) % 1.9,
        s: 0.75 + ((i * 13) % 6) / 10,
        g: i % 3 === 0,
      })),
    [won],
  );

  return (
    <div
      className={`fortune ${won ? 'is-win' : 'is-loss'} ${done ? 'is-done' : ''}`}
      data-testid="fortune-reveal"
    >
      <div className="fortune-art">
        <img src="/assets/images/fortune_chest.jpg" alt="" aria-hidden draggable={false} />
        {!still && (
          <span className="fortune-sparks" aria-hidden>
            {sparks.map((p, i) => (
              <i
                key={i}
                className={p.g ? 'spark-emerald' : 'spark-coin'}
                style={{ '--x': `${p.x}%`, '--d': `${p.d}s`, '--s': p.s } as CSSProperties}
              />
            ))}
          </span>
        )}
      </div>
      <p className="fortune-line">
        <span className="fortune-gain" data-testid="fortune-gain" aria-live="polite">
          +{shown}
        </span>{' '}
        alchemical shards
      </p>
      <p className="fortune-total" data-testid="fortune-total">
        Your purse: {(done ? total : total - gain + shown).toLocaleString()}
      </p>
    </div>
  );
}
