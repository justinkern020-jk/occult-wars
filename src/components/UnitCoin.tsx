import type { Side } from '../game/maps';
import { cardImageUrl } from '../game/maps';

export interface BoardUnit {
  uid: string;
  cardId: string;
  name: string;
  side: Side;
  /** Current Cabals dual Power (vitality + damage). */
  power: number;
  /** Printed Power (for hurt styling). */
  maxPower: number;
  /** Loyalty / muster cost — NOT combat Power. */
  loyalty: number;
  keywords: string[];
  /** Acted this rite (one step). */
  moved?: boolean;
  attacked?: boolean;
}

/**
 * Battlefield token.
 * Coins match tarot card layout (Loyalty left · Power right) so board
 * and hand never look "backwards" relative to each other.
 */
export function UnitCoin({
  unit,
  selected,
  foe,
  onClick,
}: {
  unit: BoardUnit;
  selected?: boolean;
  foe?: boolean;
  onClick?: () => void;
}) {
  const hurt = unit.power < unit.maxPower;
  return (
    <button
      type="button"
      className={`stone-coin is-${unit.side} ${foe ? 'coin-foe' : 'coin-mine'} ${selected ? 'stone-picked' : ''}`}
      onClick={onClick}
      title={`${unit.name} · Power ${unit.power} · Loyalty ${unit.loyalty}`}
      aria-label={`${unit.name}, Power ${unit.power}, Loyalty ${unit.loyalty}`}
    >
      <img
        src={cardImageUrl(unit.name)}
        alt=""
        className="stone-face"
        draggable={false}
        onError={(e) => {
          (e.target as HTMLImageElement).style.opacity = '0.25';
        }}
      />
      {/* Loyalty (cost/oath bank) — left, matches card cost pip */}
      <span className="coin-stat coin-loyalty" title="Loyalty · muster cost">
        <abbr>L</abbr>
        {unit.loyalty}
      </span>
      {/* Power (dual combat) — right, matches card Power pip */}
      <span
        className={`coin-stat coin-power ${hurt ? 'coin-hurt' : ''}`}
        title="Power · vitality and damage"
      >
        <abbr>P</abbr>
        {unit.power}
      </span>
    </button>
  );
}
