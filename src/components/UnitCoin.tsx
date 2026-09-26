import type { KeyboardEvent } from 'react';
import type { Side } from '../game/maps';
import { hasKeyword } from '../game/keywords';
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
  /** Resources / muster cost — NOT combat Power. */
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
 * Coins match tarot card layout (Resources left · Power right).
 * Rendered as a div (not a nested <button>) so tile taps work reliably.
 */
export function UnitCoin({
  unit,
  selected,
  foe,
  sliding,
  onClick,
  onInspect,
}: {
  unit: BoardUnit;
  selected?: boolean;
  foe?: boolean;
  /** Hidden while the glide ghost is traveling onto this tile. */
  sliding?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
}) {
  const hurt = unit.power < unit.maxPower;
  const veiled = hasKeyword(unit, 'veiled');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onClick?.();
    }
  };
  const veilTitle = veiled ? ' · veiled · untargetable' : '';
  return (
    <div
      role="button"
      tabIndex={0}
      className={`stone-coin is-${unit.side} ${foe ? 'coin-foe' : 'coin-mine'} ${selected ? 'stone-picked' : ''} ${unit.sick ? 'is-sick' : ''} ${veiled ? 'is-veiled' : ''} ${sliding ? 'coin-slide-hide' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={onKey}
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
      title={`${unit.name} · Power ${unit.power} · Resources ${unit.loyalty}${veilTitle} · tap to move · double-tap to inspect`}
      aria-label={`${unit.name}, Power ${unit.power}, Resources ${unit.loyalty}${veiled ? ', veiled and untargetable' : ''}`}
    >
      <CardArt name={unit.name} className="stone-face" />
      <span className="coin-stat coin-loyalty" title="Resources · muster cost">
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
      {veiled && (
        <span className="veil-dust" aria-hidden title="Veiled · strikes pass over">
          <span className="veil-haze" />
          <span className="veil-spark s1" />
          <span className="veil-spark s2" />
          <span className="veil-spark s3" />
          <span className="veil-spark s4" />
          <span className="veil-spark s5" />
          <span className="veil-spark s6" />
          <span className="veil-spark s7" />
          <span className="veil-spark s8" />
          <span className="veil-spark s9" />
          <span className="veil-spark s10" />
          <span className="veil-spark s11" />
          <span className="veil-spark s12" />
        </span>
      )}
    </div>
  );
}
