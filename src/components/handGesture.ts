/**
 * How a press on a hand plate is read. Pure, so the rules are unit-tested.
 *
 * Draggable plates carry `touch-action: none`: iOS Safari does not honour
 * `pan-x` reliably (WebKit bug 232545), so an upward drag on a `pan-x` plate
 * could start a page scroll, fire `pointercancel` and drop the muster drag.
 * The hand therefore pans itself on touch, the same way it already does for a
 * mouse, and only an up/down motion lifts a plate.
 */
export const GESTURE_SLOP = 8;

export type Gesture = 'wait' | 'drag' | 'scroll';

/**
 * - under the slop: still a tap (or a long-press peek);
 * - sideways (|dx| > |dy|) in a hand that slides: scroll the hand;
 * - anything else (up, down, or sideways in a hand that fits): drag the plate.
 */
export function classifyGesture(dx: number, dy: number, slides: boolean, slop = GESTURE_SLOP): Gesture {
  if (Math.hypot(dx, dy) < slop) return 'wait';
  if (slides && Math.abs(dx) > Math.abs(dy)) return 'scroll';
  return 'drag';
}

/** Velocity (px/ms, + = content moves right) from the last few move samples. */
export function releaseVelocity(samples: { t: number; x: number }[], windowMs = 90): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  let first = samples[samples.length - 2]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i]!.t > windowMs) break;
    first = samples[i]!;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/**
 * Momentum after a touch swipe: one frame of travel and the decayed velocity.
 * Stops when the speed falls under `minV` px/ms.
 */
export function momentumStep(v: number, dtMs: number, friction = 0.0035, minV = 0.02): { dx: number; v: number } {
  const dx = v * dtMs;
  const nv = v * Math.exp(-friction * dtMs);
  return { dx, v: Math.abs(nv) < minV ? 0 : nv };
}

/** Clamp a scroll position to the row's range. */
export function clampScroll(x: number, max: number): number {
  return Math.min(Math.max(0, max), Math.max(0, x));
}
