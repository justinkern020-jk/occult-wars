import type { Card } from '../game/types';
import { CardView } from './CardView';

/** Full-screen inspect veil — tap backdrop or the card to dismiss. */
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
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CardView card={card} power={power} />
        {caption && <p className="tarot-pop-caption">{caption}</p>}
        <p className="tarot-pop-hint">Tap to dismiss</p>
      </article>
    </div>
  );
}
