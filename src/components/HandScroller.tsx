import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { GESTURE_SLOP, classifyGesture, clampScroll, momentumStep, releaseVelocity } from './handGesture';

type Props = {
  /** The scrolling row (shared with the parent, which scrolls a chosen card into view). */
  rowRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
};

type Metrics = { overflow: boolean; left: number; width: number; atStart: boolean; atEnd: boolean };

const NONE: Metrics = { overflow: false, left: 0, width: 100, atStart: true, atEnd: true };

function measure(el: HTMLElement | null): Metrics {
  if (!el) return NONE;
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 2) return NONE;
  const width = Math.max(12, (el.clientWidth / el.scrollWidth) * 100);
  const k = Math.min(1, Math.max(0, el.scrollLeft / max));
  return {
    overflow: true,
    width,
    left: k * (100 - width),
    atStart: el.scrollLeft <= 2,
    atEnd: el.scrollLeft >= max - 2,
  };
}

/**
 * The hand strip as a slider. The row scrolls by:
 * - a horizontal swipe or mouse/pen drag (on a draggable plate the row pans itself, with
 *   momentum on touch, because those plates are `touch-action: none` so an upward drag
 *   can never turn into a page scroll; elsewhere the browser's native pan does it);
 * - the mouse wheel (vertical wheel → horizontal scroll while the hand overflows);
 * - the gold-and-emerald slider under the hand (drag the thumb, or tap the rail to jump);
 * - edge arrows when there is more hand off to one side.
 * A vertical drag or a tap is left alone for the plate (select, drag up to muster, long-press peek).
 */
export function HandScroller({ rowRef, className = 'hand-row', children }: Props) {
  const [m, setM] = useState<Metrics>(NONE);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef<{
    id: number;
    x: number;
    y: number;
    start: number;
    mode: 'wait' | 'scroll' | 'off';
    touch: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);
  const glide = useRef<number | null>(null);
  const swallowClick = useRef(false);

  const update = useCallback(() => setM(measure(rowRef.current)), [rowRef]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null;
    mo?.observe(el, { childList: true });
    window.addEventListener('resize', update);
    // Wheel: a vertical wheel slides the hand while it overflows (non-passive so the page stays put).
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      const next = Math.min(max, Math.max(0, el.scrollLeft + d));
      if (next === el.scrollLeft) return; // at an end: let the page scroll
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (glide.current != null) cancelAnimationFrame(glide.current);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', update);
      el.removeEventListener('wheel', onWheel);
    };
  }, [rowRef, update]);

  function stopGlide() {
    if (glide.current != null) {
      cancelAnimationFrame(glide.current);
      glide.current = null;
    }
  }

  /**
   * A sideways drag on the row scrolls it: mouse/pen anywhere, touch only where the
   * browser's own pan is switched off (a draggable plate). Up/down is left to the plate.
   */
  function onRowPointerDown(e: ReactPointerEvent<HTMLElement>) {
    stopGlide();
    if (e.button !== 0 || !rowRef.current || !m.overflow) return;
    const touch = e.pointerType === 'touch';
    // A swipe that starts on an edge arrow still slides the hand.
    if (touch && !(e.target as HTMLElement).closest?.('.hand-card.is-draggable, .hand-arrow')) return; // native pan
    pan.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: rowRef.current.scrollLeft,
      mode: 'wait',
      touch,
      samples: [{ t: e.timeStamp, x: e.clientX }],
    };
  }
  function onRowPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const p = pan.current;
    const el = rowRef.current;
    if (!p || p.id !== e.pointerId || !el || p.mode === 'off') return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.mode === 'wait') {
      const g = classifyGesture(dx, dy, true, GESTURE_SLOP);
      if (g === 'wait') return;
      if (g === 'drag') {
        p.mode = 'off'; // up/down: the plate's own drag (muster) takes it
        return;
      }
      p.mode = 'scroll';
      swallowClick.current = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    p.samples.push({ t: e.timeStamp, x: e.clientX });
    if (p.samples.length > 8) p.samples.shift();
    el.scrollLeft = p.start - dx;
  }
  function onRowPointerEnd(e: ReactPointerEvent<HTMLElement>) {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    pan.current = null;
    if (p.mode !== 'scroll') return;
    // The click the release makes must not select a plate.
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    const el = rowRef.current;
    if (!p.touch || !el || e.type === 'pointercancel') return;
    // A flick keeps the hand gliding, like the native pan it stands in for.
    let v = -releaseVelocity(p.samples);
    let last = performance.now();
    const tick = (now: number) => {
      const step = momentumStep(v, Math.min(48, now - last));
      last = now;
      const max = el.scrollWidth - el.clientWidth;
      const next = clampScroll(el.scrollLeft + step.dx, max);
      el.scrollLeft = next;
      v = step.v;
      glide.current = v && next > 0 && next < max ? requestAnimationFrame(tick) : null;
    };
    if (Math.abs(v) > 0.05) glide.current = requestAnimationFrame(tick);
  }

  function scrollByPage(dir: -1 | 1) {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.75), behavior: 'smooth' });
  }

  /** Slider: drag the thumb, or press the rail to jump there and keep dragging. */
  function onTrackPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const el = rowRef.current;
    if (!track || !el || e.button !== 0) return;
    e.preventDefault();
    const rect = track.getBoundingClientRect();
    const thumbW = (m.width / 100) * rect.width;
    const thumbX = rect.left + (m.left / 100) * rect.width;
    const onThumb = e.clientX >= thumbX && e.clientX <= thumbX + thumbW;
    const grab = onThumb ? e.clientX - thumbX : thumbW / 2;
    const max = el.scrollWidth - el.clientWidth;
    const place = (x: number) => {
      const span = rect.width - thumbW;
      const k = span > 0 ? Math.min(1, Math.max(0, (x - grab - rect.left) / span)) : 0;
      el.scrollLeft = k * max;
    };
    place(e.clientX);
    track.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => place(ev.clientX);
    const up = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
  }

  function onTrackKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const el = rowRef.current;
    if (!el) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      scrollByPage(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      scrollByPage(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      e.preventDefault();
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  }

  /** The edge arrows pass a sideways swipe on to the row; a plain tap still pages. */
  const arrowSwipe = {
    onPointerDown: onRowPointerDown,
    onPointerMove: onRowPointerMove,
    onPointerUp: onRowPointerEnd,
    onPointerCancel: onRowPointerEnd,
  };
  function arrowClick(dir: -1 | 1) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    scrollByPage(dir);
  }

  const pct = m.width >= 100 ? 0 : Math.round((m.left / (100 - m.width)) * 100);

  return (
    <div
      className={`hand-scroller${m.overflow ? ' is-overflowing' : ''}${m.atStart ? ' at-start' : ''}${m.atEnd ? ' at-end' : ''}`}
      data-testid="hand-scroller"
    >
      <div className="hand-scroller-view">
        <div
          className={`${className} hand-row-slide`}
          ref={rowRef}
          onScroll={update}
          onPointerDown={onRowPointerDown}
          onPointerMove={onRowPointerMove}
          onPointerUp={onRowPointerEnd}
          onPointerCancel={onRowPointerEnd}
          onClickCapture={(e) => {
            if (swallowClick.current) {
              e.preventDefault();
              e.stopPropagation();
              swallowClick.current = false;
            }
          }}
        >
          {children}
        </div>
        {m.overflow && (
          <>
            <button
              type="button"
              className="hand-arrow hand-arrow-left"
              data-testid="hand-arrow-left"
              aria-label="Slide the hand left"
              hidden={m.atStart}
              {...arrowSwipe}
              onClick={() => arrowClick(-1)}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className="hand-arrow hand-arrow-right"
              data-testid="hand-arrow-right"
              aria-label="Slide the hand right"
              hidden={m.atEnd}
              {...arrowSwipe}
              onClick={() => arrowClick(1)}
            >
              <span aria-hidden>›</span>
            </button>
          </>
        )}
      </div>
      {m.overflow && (
        <div
          ref={trackRef}
          className="hand-slider"
          data-testid="hand-slider"
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Slide through the hand"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          tabIndex={0}
          onPointerDown={onTrackPointerDown}
          onKeyDown={onTrackKey}
        >
          <span className="hand-slider-rail" aria-hidden />
          <span
            className="hand-slider-thumb"
            aria-hidden
            style={{ left: `${m.left}%`, width: `${m.width}%` }}
          />
        </div>
      )}
    </div>
  );
}
