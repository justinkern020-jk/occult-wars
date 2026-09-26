import type { Card } from '../game/types';
import { cardImageUrl } from '../game/maps';

/** Compact hand strip card — Loyalty left, Power right (Cabals). */
export function HandCard({
  card,
  selected,
  disabled,
  onClick,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`hand-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={`${card.name} · Loyalty ${card.cost}${card.power != null ? ` · Power ${card.power}` : ''}`}
    >
      <span className="hand-card-pip hand-card-loyalty" title="Loyalty">
        {card.cost}
      </span>
      <img src={cardImageUrl(card.name)} alt="" draggable={false} />
      <span className="hand-card-name">{card.name}</span>
      {card.kind === 'unit' && card.power != null && (
        <span className="hand-card-pip hand-card-power" title="Power">
          {card.power}
        </span>
      )}
    </button>
  );
}
