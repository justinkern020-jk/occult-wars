import type { CSSProperties, KeyboardEvent } from 'react';
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
  /** Once-each-rite activated ability already called. */
  used?: boolean;
  /** Once-in-a-sitting activated ability already called. */
  once?: boolean;
  /** Turns remaining this unit cannot move (Arrest). */
  arrest?: number;
  /** Lasting power earned in play (already counted in power; tooltip only). */
  gained?: number;
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
  canStep,
  onClick,
  onInspect,
  clash,
  hits,
}: {
  unit: BoardUnit;
  selected?: boolean;
  foe?: boolean;
  /** Hidden while the glide ghost is traveling onto this tile. */
  sliding?: boolean;
  /** Soft pulse: this unit can still move this rite (before you tap it). */
  canStep?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  /** Melee clash nudge toward (dx, dy) px; key restarts the animation. */
  clash?: { key: number; dx: number; dy: number } | null;
  /** Floating damage numbers over this coin. */
  hits?: { id: string; text: string }[];
}) {
  const hurt = unit.power < unit.maxPower;
  const gained = unit.gained ?? 0;
  const veiled = hasKeyword(unit, 'veiled');
  const fast = hasKeyword(unit, 'fast');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onClick?.();
    }
  };
  const veilTitle = veiled ? ' · Untargetable' : '';
  return (
    <div
      key={clash ? `clash-${clash.key}` : undefined}
      role="button"
      tabIndex={0}
      className={`stone-coin is-${unit.side} ${foe ? 'coin-foe' : 'coin-mine'} ${selected ? 'stone-picked' : ''} ${unit.sick ? 'is-sick' : ''} ${veiled ? 'is-veiled' : ''} ${sliding ? 'coin-slide-hide' : ''} ${canStep && !selected ? 'can-step' : ''} ${clash ? 'coin-clash' : ''}`}
      style={
        clash
          ? ({ '--dx': `${clash.dx}px`, '--dy': `${clash.dy}px`, animationDelay: '0s' } as CSSProperties)
          : undefined
      }
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
      title={`${unit.name} · Power ${unit.power} · Resources ${unit.loyalty}${fast ? ' · Fast Attack' : ''}${veilTitle}${canStep && !selected ? ' · ready to move' : ''} · tap to move · double-tap to inspect`}
      aria-label={`${unit.name}, Power ${unit.power}, Resources ${unit.loyalty}${fast ? ', Fast Attack' : ''}${veiled ? ', Untargetable' : ''}`}
    >
      <CardArt name={unit.name} className="stone-face" />
      <span className="coin-stat coin-loyalty" title="Resources · muster cost">
        <abbr>L</abbr>
        {unit.loyalty}
      </span>
      <span className="coin-power-slot">
        <span
          className={`coin-stat coin-power ${hurt ? 'coin-hurt' : ''}`}
          title={
            gained > 0
              ? `Power ${unit.power} · vitality and damage (includes +${gained} earned in play)`
              : 'Power · vitality and damage'
          }
        >
          <abbr>P</abbr>
          {/* Earned power is already part of power: show the total only. */}
          {unit.power}
        </span>
      </span>
      {hits?.map((h) => (
        <span key={h.id} className="coin-dmg-float" aria-hidden>
          {h.text}
        </span>
      ))}
      {fast && (
        <span
          className="coin-fast-dagger"
          title="Fast Attack · strikes first in melee"
          aria-label="Fast Attack"
        >
          <img src="/assets/icons/fast-dagger.svg" alt="" aria-hidden />
        </span>
      )}
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
