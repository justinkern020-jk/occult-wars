import type { Card } from '../game/types';
import { CardArt } from './CardArt';

/** Compact hand strip card — Loyalty left, Power right (Cabals). */
export function HandCard({
  card,
  selected,
  disabled,
  onClick,
  onInspect,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
}) {
  return (
    <button
      type="button"
      className={`hand-card kind-${card.kind} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onInspect?.();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        onInspect?.();
      }}
      title={`${card.name} · Loyalty ${card.cost}${card.power != null ? ` · Power ${card.power}` : ''} · ${card.kind}`}
    >
      <span className="hand-card-pip hand-card-loyalty" title="Loyalty">
        {card.cost}
      </span>
      <CardArt name={card.name} />
      <span className="hand-card-name">{card.name}</span>
      <span className="hand-card-kind">{card.kind}</span>
      {card.kind === 'unit' && card.power != null && (
        <span className="hand-card-pip hand-card-power" title="Power">
          {card.power}
        </span>
      )}
    </button>
  );
}
