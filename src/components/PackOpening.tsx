/**
 * A purchase arrives as a sealed envelope: tear it (drag across) or tap the
 * wax seal, then the plates turn over one by one, the rarest last, each with
 * its rarity glow and a sound. Skip turns them all at once.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Card, Rarity } from '../game/types';
import { createPortal } from 'react-dom';
import { CardView } from './CardView';
import { TarotPop } from './TarotPop';
import { flipSfx, tearSealSfx } from '../game/packSfx';
import { unlockAudio } from '../game/sfx';

export type PackItem = { card: Card; foil: boolean };

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, patron: 3 };
const FLIP_MS = 720;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Rarest last (a foil outranks a plain copy of the same rarity); stable otherwise. */
export function revealOrder(items: PackItem[]): PackItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort(
      (a, b) =>
        RANK[a.it.card.rarity] + (a.it.foil ? 0.5 : 0) - (RANK[b.it.card.rarity] + (b.it.foil ? 0.5 : 0)) ||
        a.i - b.i,
    )
    .map((x) => x.it);
}

type Props = {
  items: PackItem[];
  /** "Five assorted plates", "The sealed counter"… */
  label: string;
  /** Wax colour: crimson for the seals, emerald for the counters. */
  wax?: 'crimson' | 'emerald';
  onClose: () => void;
};

export function PackOpening({ items, label, wax = 'crimson', onClose }: Props) {
  const order = useMemo(() => revealOrder(items), [items]);
  const [stage, setStage] = useState<'sealed' | 'torn' | 'reveal'>('sealed');
  const [shown, setShown] = useState(0);
  const [inspect, setInspect] = useState<PackItem | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [tearX, setTearX] = useState(0);
  const timer = useRef<number | null>(null);
  const rm = useMemo(reducedMotion, []);
  const done = shown >= order.length;

  function tear() {
    if (stage !== 'sealed') return;
    unlockAudio();
    tearSealSfx();
    setStage('torn');
    window.setTimeout(() => setStage('reveal'), rm ? 50 : 650);
  }

  // Turn the next plate over on a slow beat.
  useEffect(() => {
    if (stage !== 'reveal' || done) return;
    timer.current = window.setTimeout(
      () => {
        const it = order[shown];
        if (it) flipSfx(it.card.rarity, it.foil);
        setShown((n) => n + 1);
      },
      // The last (rarest) plate waits a breath longer.
      shown === 0 ? 260 : shown === order.length - 1 ? FLIP_MS + 420 : FLIP_MS,
    );
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [stage, shown, done, order]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inspect) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (done) onClose();
        else skip();
      } else if ((e.key === 'Enter' || e.key === ' ') && stage === 'sealed') {
        e.preventDefault();
        tear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function skip() {
    if (stage === 'sealed') {
      unlockAudio();
      tearSealSfx();
    }
    setStage('reveal');
    if (!done) {
      const best = order[order.length - 1];
      if (best) flipSfx(best.card.rarity, best.foil);
    }
    setShown(order.length);
  }

  const best = order[order.length - 1];
  const view = (
    <div
      className={`pack-open${rm ? ' is-still' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Opening: ${label}`}
      data-testid="pack-open"
      data-stage={stage}
    >
      <p className="pack-open-kicker">{label}</p>
      {stage !== 'reveal' ? (
        <div
          className={`pack-envelope wax-${wax}${stage === 'torn' ? ' is-torn' : ''}`}
          data-testid="pack-envelope"
          style={{ '--tear': `${tearX}` } as CSSProperties}
          onPointerDown={(e) => {
            // The seal is a button of its own: let its click through.
            if ((e.target as HTMLElement).closest?.('.pack-seal')) return;
            drag.current = { x: e.clientX, y: e.clientY };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = Math.abs(e.clientX - drag.current.x);
            const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width || 300;
            const t = Math.min(1, dx / (w * 0.55));
            setTearX(t);
            if (t >= 1) {
              drag.current = null;
              tear();
            }
          }}
          onPointerUp={(e) => {
            const start = drag.current;
            drag.current = null;
            if (stage !== 'sealed') return;
            setTearX(0);
            // A plain tap on the envelope opens it too.
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) tear();
          }}
        >
          <span className="pack-envelope-back" aria-hidden />
          <span className="pack-envelope-flap" aria-hidden />
          <span className="pack-envelope-tear" aria-hidden />
          <span className="pack-envelope-count" aria-hidden>
            {items.length === 1 ? 'one plate' : `${items.length} plates`}
          </span>
          <button
            type="button"
            className="pack-seal"
            data-testid="pack-seal"
            aria-label="Break the wax seal"
            onClick={(e) => {
              e.stopPropagation();
              tear();
            }}
          >
            <span className="pack-seal-half l" aria-hidden />
            <span className="pack-seal-half r" aria-hidden />
            <span className="pack-seal-sigil" aria-hidden>
              ✠
            </span>
          </button>
        </div>
      ) : (
        <div className={`pack-fan n-${order.length}`} data-testid="pack-fan">
          {order.map((it, i) => {
            const up = i < shown;
            return (
              <button
                key={`${it.card.id}-${i}`}
                type="button"
                className={`pack-slot rarity-${it.card.rarity}${up ? ' is-up' : ''}${it.foil ? ' is-foil-pull' : ''}${
                  up && i === order.length - 1 && i > 0 ? ' is-last' : ''
                }`}
                data-testid={up ? 'pack-slot-up' : 'pack-slot-down'}
                aria-label={up ? `${it.card.name}${it.foil ? ' (foil)' : ''}, ${it.card.rarity}` : 'A plate, face down'}
                onClick={() => {
                  if (up) setInspect(it);
                  else if (i === shown) {
                    if (timer.current != null) window.clearTimeout(timer.current);
                    flipSfx(it.card.rarity, it.foil);
                    setShown(i + 1);
                  }
                }}
              >
                <span className="pack-slot-inner">
                  <span className="pack-slot-back" aria-hidden>
                    <span className="pack-slot-sigil">✠</span>
                  </span>
                  <span className="pack-slot-face">
                    <CardView card={it.card} compact foil={it.foil} />
                    <span className="pack-slot-rarity">
                      {it.foil ? `Foil · ${it.card.rarity}` : it.card.rarity}
                    </span>
                  </span>
                </span>
                {up && <span className="pack-slot-glow" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
      <p className="pack-open-hint" aria-live="polite">
        {stage === 'sealed'
          ? 'Drag across the envelope to tear it, or tap the seal.'
          : done
            ? best
              ? `The best of it: ${best.card.name}${best.foil ? ', in foil' : ''}. Tap a plate to read it.`
              : ''
            : 'The plates turn…'}
      </p>
      <div className="pack-open-actions">
        {!done && (
          <button type="button" className="brass-btn brass-btn-ghost" data-testid="pack-skip" onClick={skip}>
            Skip
          </button>
        )}
        {done && (
          <button type="button" className="brass-btn brass-btn-solid" data-testid="pack-done" onClick={onClose}>
            Keep them
          </button>
        )}
      </div>
      {inspect && <TarotPopFoil item={inspect} onClose={() => setInspect(null)} />}
    </div>
  );
  // On <body>: no screen's stacking context can sit above the envelope.
  return typeof document === 'undefined' ? view : createPortal(view, document.body);
}

/** TarotPop for a pulled copy (foil shows in the big face too). */
function TarotPopFoil({ item, onClose }: { item: PackItem; onClose: () => void }) {
  return <TarotPop card={item.card} foil={item.foil} onClose={onClose} />;
}
