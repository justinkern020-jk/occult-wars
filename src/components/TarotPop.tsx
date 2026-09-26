import { useEffect, useRef } from 'react';
import type { Card } from '../game/types';
import { CardView } from './CardView';

/** Ignore backdrop / Esc / Close for this long after mount (avoids click-through). */
const CLOSE_ARM_MS = 500;

/** Full-screen inspect / unlock reveal — tap backdrop, Close, or Esc to dismiss. */
export function TarotPop({
  card,
  power,
  onClose,
  caption,
  closeOnBackdrop = true,
}: {
  card: Card;
  power?: number;
  onClose: () => void;
  caption?: string;
  /** When false, only Close / Esc dismiss (after arm). Default true. */
  closeOnBackdrop?: boolean;
}) {
  const closeArmed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeArmed.current = false;
    const t = window.setTimeout(() => {
      closeArmed.current = true;
    }, CLOSE_ARM_MS);
    return () => window.clearTimeout(t);
  }, [card.id]);

  const tryClose = () => {
    if (!closeArmed.current) return;
    onCloseRef.current();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!closeArmed.current) return;
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="tarot-pop"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      data-testid="tarot-pop"
      onClick={closeOnBackdrop ? tryClose : undefined}
    >
      <article
        className="tarot-pop-card"
        onClick={(e) => e.stopPropagation()}
      >
        <CardView card={card} power={power} />
        {caption && <p className="tarot-pop-caption">{caption}</p>}
        <button
          type="button"
          className="tarot-pop-close"
          data-testid="tarot-pop-close"
          onClick={tryClose}
        >
          Close
        </button>
        <p className="tarot-pop-hint">
          {closeOnBackdrop ? 'Tap outside or press Esc' : 'Press Close or Esc'}
        </p>
      </article>
    </div>
  );
}
