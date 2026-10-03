/**
 * Card dressing for the polish batch: cheap CSS motion layers over the art
 * of rare / patron / leader plates (candle flicker, drifting fog, a pair of
 * eyes in the dark, coil sparks, falling frost), and the foil sheen that
 * follows the pointer (or the tilt of a phone, where the browser allows it).
 * All motion is CSS (transform / opacity) and stops under
 * prefers-reduced-motion.
 */
import { useCallback, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from '../game/types';

export type ArtMotif = 'candle' | 'fog' | 'eyes' | 'sparks' | 'frost';

/** Uncommon plates that still get a motion layer (their art asks for it). */
const SIGNATURE = new Set(['galvanic_hound', 'the_grave_candle', 'will_of_the_marsh', 'trench_radio']);

const SPARKS =
  /galvanic|coil|dynamo|cathode|\bray\b|discharge|lightning|radium|engine|spark|wardenclyffe|ozone|overload|broadcast|x-ray|automaton|menlo|vril|foo fighter|radio|tank|airship|zeppelin/i;
const CANDLE =
  /candle|lamp|flame|fire|cinder|athanor|hearth|kupala|stove|retort|crucible|light|aurora|kiss|laughing|widowed|saint|cantor|seer|medium|voice/i;
const FROST = /frost|winter|hoarfrost|snow/i;
const EYES =
  /eye|stare|hound|shuck|mothman|devil|monk|hag|upir|wight|revenant|dullahan|sasquatch|ape|leshy|vodyanoy|pike|toad|wyrm|jack|night-mare|sluagh|each-uisge|afanc|bear|bell witch|presence|passenger/i;

/** Which motion layer a plate wears (null = still art). */
export function artMotif(card: Pick<Card, 'id' | 'name' | 'rarity' | 'kind' | 'keywords'>): ArtMotif | null {
  const grand = card.rarity === 'rare' || card.rarity === 'patron' || card.kind === 'hero';
  if (!grand && !SIGNATURE.has(card.id)) return null;
  const n = card.name;
  if (SPARKS.test(n)) return 'sparks';
  if (FROST.test(n)) return 'frost';
  if (card.keywords.includes('cryptid') || EYES.test(n)) return 'eyes';
  if (CANDLE.test(n)) return 'candle';
  return 'fog';
}

/** The motion layer itself: a few absolutely-placed spans over the art. */
export function ArtMotion({ card }: { card: Pick<Card, 'id' | 'name' | 'rarity' | 'kind' | 'keywords'> }) {
  const motif = artMotif(card);
  if (!motif) return null;
  return (
    <span className={`art-motion art-${motif}`} aria-hidden data-motif={motif}>
      {motif === 'sparks' && (
        <>
          <i className="spark s1" />
          <i className="spark s2" />
          <i className="spark s3" />
          <i className="spark s4" />
          <i className="arc" />
        </>
      )}
      {motif === 'candle' && (
        <>
          <i className="candle-glow" />
          <i className="ember e1" />
          <i className="ember e2" />
        </>
      )}
      {motif === 'fog' && (
        <>
          <i className="fog f1" />
          <i className="fog f2" />
        </>
      )}
      {motif === 'eyes' && (
        <>
          <i className="fog f1" />
          <i className="eye-pair" />
        </>
      )}
      {motif === 'frost' && (
        <>
          <i className="flake k1" />
          <i className="flake k2" />
          <i className="flake k3" />
          <i className="fog f2" />
        </>
      )}
    </span>
  );
}

/** The foil layer (sheen + glints). Place inside a positioned art window. */
export function FoilSheen() {
  return (
    <>
      <span className="foil-holo" aria-hidden />
      <span className="foil-mark" aria-hidden title="Foil">
        Foil
      </span>
    </>
  );
}

/* ── Tilt: pointer on desktop, device orientation on phones (where allowed) ── */

let orientBound = false;
let orientUsers = 0;
function onOrient(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  const x = Math.max(-1, Math.min(1, e.gamma / 35));
  const y = Math.max(-1, Math.min(1, (e.beta - 40) / 35));
  const root = document.documentElement.style;
  root.setProperty('--foil-ox', x.toFixed(3));
  root.setProperty('--foil-oy', y.toFixed(3));
}
function bindOrient() {
  if (orientBound || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  orientBound = true;
  window.addEventListener('deviceorientation', onOrient, { passive: true });
}
function unbindOrient() {
  if (!orientBound) return;
  orientBound = false;
  window.removeEventListener('deviceorientation', onOrient);
}
/** iOS asks permission from a gesture; ask once, quietly. */
let askedOrient = false;
function askOrient() {
  if (askedOrient || typeof window === 'undefined') return;
  askedOrient = true;
  const DOE = (window as unknown as {
    DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
  }).DeviceOrientationEvent;
  if (DOE?.requestPermission) {
    DOE.requestPermission()
      .then((r) => {
        if (r === 'granted' && orientUsers > 0) bindOrient();
      })
      .catch(() => undefined);
  }
}

/**
 * Pointer-follow handlers for a foil element: sets --mx / --my (0..1) and
 * --rx / --ry (tilt, degrees) on the element. `tilt` false = sheen only
 * (hand cards, which also drag).
 */
export function useFoilPointer(active: boolean, tilt = true) {
  useEffect(() => {
    if (!active) return;
    orientUsers++;
    const DOE = (window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceOrientationEvent;
    if (DOE && !DOE.requestPermission) bindOrient();
    return () => {
      orientUsers--;
      if (orientUsers <= 0) unbindOrient();
    };
  }, [active]);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!active) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', x.toFixed(3));
      el.style.setProperty('--my', y.toFixed(3));
      if (tilt && e.pointerType === 'mouse') {
        el.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
      }
      el.classList.add('foil-live');
    },
    [active, tilt],
  );
  const onPointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!active) return;
      const el = e.currentTarget;
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
      el.classList.remove('foil-live');
    },
    [active],
  );
  const onPointerDown = useCallback(() => {
    if (active) askOrient();
  }, [active]);
  return active ? { onPointerMove, onPointerLeave, onPointerDown } : {};
}
