import { useEffect } from 'react';
import type { Card } from '../game/types';
import { CardView } from './CardView';

/** Full-screen inspect / unlock reveal — tap backdrop, Close, or Esc to dismiss. */
export function TarotPop({
  card,
  power,
  onClose,
  caption,
}: {
  card: Card;
  power?: number;
  onClose: () => void;
  caption?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="tarot-pop"
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      data-testid="tarot-pop"
      onClick={onClose}
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
          onClick={onClose}
        >
          Close
        </button>
        <p className="tarot-pop-hint">Tap outside or press Esc</p>
      </article>
    </div>
  );
}
