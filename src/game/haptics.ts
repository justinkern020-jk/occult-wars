/**
 * Phone haptics through navigator.vibrate. Android Chrome/Firefox buzz; iOS
 * Safari and most desktops have no vibrate(), so every call is a quiet no-op
 * there. Off with the Settings toggle; reduced-motion keeps only the short ones.
 */
import { prefersReducedMotion, setting } from './settings';

export type HapticKind = 'tick' | 'death' | 'capture' | 'victory' | 'defeat';

/** On/off pulses in ms (vibrate() pattern: buzz, pause, buzz...). */
export const HAPTIC_PATTERNS: Record<HapticKind, number[]> = {
  /** A coin set down or moved. */
  tick: [8],
  /** A unit falls. */
  death: [28],
  /** A gate or seal taken. */
  capture: [55, 40, 70],
  /** Victory: a rising pulse. */
  victory: [40, 60, 40, 60, 90, 80, 160],
  /** Defeat: one long low drone, then a last weak beat. */
  defeat: [420, 120, 140],
};

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

let lastTick = 0;
export function haptic(kind: HapticKind): void {
  if (!hapticsSupported()) return;
  try {
    if (!setting('haptics')) return;
    if (kind === 'tick') {
      // Bursts of AI moves should not rattle the phone.
      const now = Date.now();
      if (now - lastTick < 120) return;
      lastTick = now;
    }
    const long = kind === 'victory' || kind === 'defeat' || kind === 'capture';
    const pattern = long && prefersReducedMotion() ? [HAPTIC_PATTERNS[kind][0]!] : HAPTIC_PATTERNS[kind];
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw before a user gesture: ignore */
  }
}
