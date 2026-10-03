import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../game/types';
import { cardById } from '../data/catalog';
import { plainRules } from '../game/plainRules';
import { CardView } from './CardView';

/**
 * Hover (mouse) or long-press (touch) any element carrying
 * `data-peek-card="<card id>"` (hand plates, board coins, collection and
 * working plates) to see the plate enlarged with its rules in plain English,
 * keyword meanings, and the quote beneath. Purely a reading layer: it never
 * takes a click, so double-click / tap inspect keep working underneath.
 */
const HOVER_MS = 340;
const PRESS_MS = 430;

type Peek = { card: Card; power?: number; rect: DOMRect; touch: boolean };

function peekTarget(t: EventTarget | null): HTMLElement | null {
  return t instanceof Element ? (t.closest('[data-peek-card]') as HTMLElement | null) : null;
}

function readPeek(el: HTMLElement, touch: boolean): Peek | null {
  const card = cardById(el.dataset.peekCard ?? '');
  if (!card) return null;
  const p = el.dataset.peekPower;
  return {
    card,
    power: p != null && p !== '' ? Number(p) : undefined,
    rect: el.getBoundingClientRect(),
    touch,
  };
}

export function CardPeekLayer() {
  const [peek, setPeek] = useState<Peek | null>(null);
  const hoverEl = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  /** After a long-press peek, swallow the click / context menu the release makes. */
  const swallowUntil = useRef(0);

  useEffect(() => {
    const clear = () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clear();
      hoverEl.current = null;
      setPeek(null);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const el = peekTarget(e.target);
      if (el === hoverEl.current) return;
      hide();
      if (!el) return;
      hoverEl.current = el;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (hoverEl.current !== el || !el.isConnected) return;
        setPeek(readPeek(el, false));
      }, HOVER_MS);
    };
    const onOut = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !hoverEl.current) return;
      const to = e.relatedTarget as Node | null;
      if (to && hoverEl.current.contains(to)) return;
      hide();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        hide();
        return;
      }
      const el = peekTarget(e.target);
      hide();
      if (!el) return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (!press.current || !el.isConnected) return;
        const p = readPeek(el, true);
        if (!p) return;
        swallowUntil.current = Number.POSITIVE_INFINITY;
        setPeek(p);
      }, PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
        press.current = null;
        if (swallowUntil.current === Number.POSITIVE_INFINITY) swallowUntil.current = 0;
        hide();
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      press.current = null;
      clear();
      if (swallowUntil.current === Number.POSITIVE_INFINITY) {
        swallowUntil.current = performance.now() + 450;
        setPeek(null);
      }
    };
    const swallow = (e: Event) => {
      if (performance.now() < swallowUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKey = () => hide();
    const onScroll = () => {
      if (!press.current) hide();
    };
    window.addEventListener('pointerover', onOver, true);
    window.addEventListener('pointerout', onOut, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('click', swallow, true);
    window.addEventListener('contextmenu', swallow, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);
    return () => {
      clear();
      window.removeEventListener('pointerover', onOver, true);
      window.removeEventListener('pointerout', onOut, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('contextmenu', swallow, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!peek) return null;
  return createPortal(<PeekPanel peek={peek} />, document.body);
}

function PeekPanel({ peek }: { peek: Peek }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const r = plainRules(peek.card);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const a = peek.rect;
    const gap = 14;
    let left: number;
    let top: number;
    if (a.right + gap + w <= vw - 8) left = a.right + gap;
    else if (a.left - gap - w >= 8) left = a.left - gap - w;
    else left = (vw - w) / 2;
    if (left === (vw - w) / 2) {
      // No room beside: sit above or below the plate, away from the finger.
      top = a.top - gap - h >= 8 ? a.top - gap - h : a.bottom + gap;
    } else {
      top = a.top + a.height / 2 - h / 2;
    }
    top = Math.max(8, Math.min(top, vh - h - 8));
    left = Math.max(8, Math.min(left, vw - w - 8));
    setPos({ left, top });
  }, [peek]);

  return (
    <div
      ref={ref}
      className={`card-peek${peek.touch ? ' is-touch' : ''}`}
      role="tooltip"
      data-testid="card-peek"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="card-peek-face">
        <CardView card={peek.card} power={peek.power} compact />
      </div>
      <div className="card-peek-rules">
        <h4 className="card-peek-name">{peek.card.name}</h4>
        <p className="card-peek-basics">{r.basics}</p>
        {peek.power != null && peek.card.power != null && peek.power !== peek.card.power && (
          <p className="card-peek-live">
            On the field now at Power {peek.power} (printed {peek.card.power}).
          </p>
        )}
        {r.rules.length > 0 && (
          <div className="card-peek-does">
            <h5>What it does</h5>
            <p>{r.rules.join(' ')}</p>
          </div>
        )}
        {r.keywords.length > 0 && (
          <ul className="card-peek-kw">
            {r.keywords.map((k) => (
              <li key={k.key}>
                {k.glyph ? <abbr>{k.glyph}</abbr> : null}
                <strong>{k.name}:</strong> {k.text}
              </li>
            ))}
          </ul>
        )}
        {r.terms.length > 0 && (
          <p className="card-peek-terms">
            {r.terms.map((t, i) => (
              <span key={t.term}>
                {i > 0 ? ' · ' : ''}
                <em>{t.term}</em>: {t.meaning}
              </span>
            ))}
          </p>
        )}
        {r.lore.length > 0 && <p className="card-peek-lore">{r.lore.join(' ')}</p>}
        {r.quote && (
          <blockquote className="card-peek-quote">
            <p>“{r.quote.text}”</p>
            {r.quote.by && <footer>— {r.quote.by}</footer>}
          </blockquote>
        )}
      </div>
    </div>
  );
}
