import type { Side } from '../game/maps';
import { CardArt } from './CardArt';

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
  moved?: boolean;
  attacked?: boolean;
  sick?: boolean;
  tough?: boolean;
  fast?: boolean;
  shutter?: boolean;
  silenced?: boolean;
  powder?: boolean;
}

/**
 * Battlefield token.
 * Coins match tarot card layout (Loyalty left · Power right).
 */
export function UnitCoin({
  unit,
  selected,
  foe,
  onClick,
  onInspect,
}: {
  unit: BoardUnit;
  selected?: boolean;
  foe?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
}) {
  const hurt = unit.power < unit.maxPower;
  return (
    <button
      type="button"
      className={`stone-coin is-${unit.side} ${foe ? 'coin-foe' : 'coin-mine'} ${selected ? 'stone-picked' : ''} ${unit.sick ? 'is-sick' : ''}`}
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onInspect) return;
        e.preventDefault();
        e.stopPropagation();
        onInspect();
      }}
      onDoubleClick={(e) => {
        if (!onInspect) return;
        e.preventDefault();
        e.stopPropagation();
        onInspect();
      }}
      title={`${unit.name} · Power ${unit.power} · Loyalty ${unit.loyalty} · double-tap to inspect`}
      aria-label={`${unit.name}, Power ${unit.power}, Loyalty ${unit.loyalty}`}
    >
      <CardArt name={unit.name} className="stone-face" />
      <span className="coin-stat coin-loyalty" title="Loyalty · muster cost">
        <abbr>L</abbr>
        {unit.loyalty}
      </span>
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
