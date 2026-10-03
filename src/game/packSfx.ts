/**
 * Pack-opening sounds: paper tearing, the wax seal cracking, and a flip per
 * plate (its weight by rarity, a high shimmer for foil). Synthesised in Web
 * Audio (no files); the recorded battle samples from sfx.ts carry the rarer
 * pulls. Fails silently.
 */
import { leaderCallSfx, powerCallSfx, softKnockSfx, spellCastSfx } from './sfx';
import type { Rarity } from './types';

let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ac) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') void ac.resume().catch(() => undefined);
    return ac;
  } catch {
    return null;
  }
}

function noiseBurst(dur: number, freq: number, q: number, gain: number, delay = 0) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    // Paper: crackly, uneven grain.
    const grain = Math.random() < 0.08 ? 1 : 0.35;
    d[i] = (Math.random() * 2 - 1) * grain;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function tone(freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine') {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** The envelope tears and the seal cracks. */
export function tearSealSfx(): void {
  try {
    noiseBurst(0.18, 1800, 0.8, 0.22);
    noiseBurst(0.32, 2600, 0.6, 0.18, 0.12);
    noiseBurst(0.12, 700, 1.5, 0.3, 0.05); // wax crack
  } catch {
    /* silent */
  }
}

/** One plate turns over. */
export function flipSfx(rarity: Rarity, foil: boolean): void {
  try {
    noiseBurst(0.09, 3200, 1.2, 0.08);
    if (rarity === 'patron') leaderCallSfx();
    else if (rarity === 'rare') spellCastSfx();
    else if (rarity === 'uncommon') powerCallSfx();
    else softKnockSfx();
    if (foil) {
      // A thin emerald shimmer: a rising run of high partials.
      [1568, 1976, 2349, 2794, 3136].forEach((f, i) => tone(f, 0.5, 0.025, 0.08 + i * 0.05));
    }
  } catch {
    /* silent */
  }
}
