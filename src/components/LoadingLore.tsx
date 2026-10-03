/**
 * One short real occult fact or attested quotation on aged paper: inline on the
 * splash, or as a brief veil while a match or era loads (until its map art is
 * in, held at least a beat so it can be read, tap to lift).
 */
import { useEffect, useState } from 'react';
import { nextLoreLine } from '../game/loadingLore';
import { prefersReducedMotion } from '../game/settings';

export function LorePaper({ className = '' }: { className?: string }) {
  const [line] = useState(nextLoreLine);
  return (
    <figure className={`lore-paper ${className}`} data-testid="lore-paper">
      <span className="lore-paper-kicker" aria-hidden>
        {line.kind === 'quote' ? 'From the stacks' : 'Of record'}
      </span>
      {line.kind === 'quote' ? (
        <blockquote className="lore-paper-text">“{line.text}”</blockquote>
      ) : (
        <p className="lore-paper-text">{line.text}</p>
      )}
      <figcaption className="lore-paper-by">— {line.by}</figcaption>
    </figure>
  );
}

type VeilProps = {
  /** Art to wait for (the map plate); the veil lifts once it is decoded. */
  src?: string;
  minMs?: number;
  maxMs?: number;
  label?: string;
};

export function LoadingLoreVeil({ src, minMs = 1400, maxMs = 3400, label = 'The field is laid…' }: VeilProps) {
  const [phase, setPhase] = useState<'on' | 'fading' | 'off'>('on');
  useEffect(() => {
    let loaded = !src;
    let held = false;
    let done = false;
    const lift = () => {
      if (done) return;
      done = true;
      setPhase(prefersReducedMotion() ? 'off' : 'fading');
    };
    const tryLift = () => {
      if (loaded && held) lift();
    };
    if (src) {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded = true;
        tryLift();
      };
      img.src = src;
    }
    const t1 = window.setTimeout(() => {
      held = true;
      tryLift();
    }, minMs);
    const t2 = window.setTimeout(lift, maxMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [src, minMs, maxMs]);
  useEffect(() => {
    if (phase !== 'fading') return;
    const t = window.setTimeout(() => setPhase('off'), 450);
    return () => window.clearTimeout(t);
  }, [phase]);
  if (phase === 'off') return null;
  return (
    <div
      className={`lore-veil${phase === 'fading' ? ' lore-veil-fading' : ''}`}
      data-testid="lore-veil"
      role="status"
      aria-live="polite"
      onClick={() => setPhase('off')}
    >
      <LorePaper />
      <p className="lore-veil-label">{label}</p>
    </div>
  );
}
