import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '../game/types';
import { CardArt } from './CardArt';

/** Compact hand strip card — Loyalty left, Power right (Cabals). */
export function HandCard({
  card,
  selected,
  disabled,
  onClick,
  onInspect,
  onDragDeployStart,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  /** Units only: begin pointer drag to muster onto a legal tile. */
  onDragDeployStart?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const pressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  function clearPress() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  const canDrag = !!onDragDeployStart && card.kind === 'unit' && !disabled;

  return (
    <button
      type="button"
      className={`hand-card kind-${card.kind} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${canDrag ? 'is-draggable' : ''}`}
      disabled={disabled}
      onClick={(e) => {
        if (dragged.current) {
          e.preventDefault();
          dragged.current = false;
          return;
        }
        onClick?.();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onInspect?.();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        clearPress();
        onInspect?.();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragged.current = false;
        startPos.current = { x: e.clientX, y: e.clientY };
        if (onInspect) {
          clearPress();
          pressTimer.current = window.setTimeout(() => {
            pressTimer.current = null;
            startPos.current = null;
            onInspect();
          }, 520);
        }
        if (canDrag) {
          (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (!startPos.current) return;
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        if (Math.hypot(dx, dy) < 10) return;
        clearPress();
        if (canDrag && !dragged.current) {
          dragged.current = true;
          startPos.current = null;
          onDragDeployStart?.(e);
        }
      }}
      onPointerUp={() => {
        clearPress();
        startPos.current = null;
      }}
      onPointerLeave={clearPress}
      onPointerCancel={() => {
        clearPress();
        startPos.current = null;
      }}
      title={`${card.name} · Loyalty ${card.cost}${card.power != null ? ` · Power ${card.power}` : ''} · ${card.kind}${canDrag ? ' · drag to muster' : ''} · double-tap to inspect`}
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
