/**
 * Dynamic battle music: a low choir-and-strings layer (D minor, the key of
 * the match bed) laid over battlefield-souls and faded in with a Web Audio
 * gain when the match tips: either side near Domination, the late rites, or
 * a great unit falling. Loops gaplessly from a decoded buffer; loaded on the
 * first match only. Silent off the field, when muted, or when the Settings
 * toggle is off.
 */
import { currentMusicBed, isSoundMuted, sharedAudioContext } from './sfx';
import { setting } from './settings';

const SRC_OGG = '/assets/audio/music/battle-choir.ogg';
const SRC_MP3 = '/assets/audio/music/battle-choir.mp3';
/** Full swell, against the bed's HTMLAudio volume of 0.32. */
const PEAK = 0.34;

let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let src: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;
let level = 0;
let surgeUntil = 0;
let surgeTimer = 0;

function pickSrc(): string {
  try {
    const a = document.createElement('audio');
    return a.canPlayType('audio/ogg; codecs="vorbis"') ? SRC_OGG : SRC_MP3;
  } catch {
    return SRC_MP3;
  }
}

function load(c: AudioContext): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer);
  if (!loading) {
    loading = fetch(pickSrc())
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(
        (ab) =>
          new Promise<AudioBuffer>((res, rej) => {
            // Safari still wants the callback form.
            c.decodeAudioData(ab, res, rej);
          }),
      )
      .then((b) => (buffer = b))
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

function allowed(): boolean {
  return currentMusicBed() === 'match' && !isSoundMuted() && setting('choir');
}

function ensureRunning(c: AudioContext): void {
  if (src || !buffer) return;
  gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(c.destination);
  src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain);
  src.start();
}

function apply(): void {
  const c = sharedAudioContext();
  if (!c) return;
  const surge = performance.now() < surgeUntil ? 0.85 : 0;
  const want = allowed() ? Math.max(level, surge) : 0;
  if (want <= 0 && !src) return;
  if (want > 0 && !buffer) {
    void load(c).then(() => apply());
    return;
  }
  ensureRunning(c);
  if (!gain) return;
  const now = c.currentTime;
  const target = want * PEAK;
  const cur = gain.gain.value;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(cur, now);
  // Swell in over ~3 s, ebb away over ~7 s.
  gain.gain.setTargetAtTime(target, now, target > cur ? 1.0 : 2.4);
}

/** 0 = the bed alone, 1 = full choir. Call as the match state changes. */
export function setBattleIntensity(next: number): void {
  const v = Math.max(0, Math.min(1, next));
  if (Math.abs(v - level) < 0.02) return;
  level = v;
  apply();
}

/** A great unit fell: the choir rises for a while, then settles back. */
export function surgeBattleChoir(ms = 16_000): void {
  surgeUntil = performance.now() + ms;
  apply();
  window.clearTimeout(surgeTimer);
  surgeTimer = window.setTimeout(apply, ms + 50);
}

/** The field closed: stop the layer (it restarts with the next swell). */
export function stopBattleChoir(): void {
  level = 0;
  surgeUntil = 0;
  window.clearTimeout(surgeTimer);
  const c = sharedAudioContext();
  const s = src;
  const g = gain;
  src = null;
  gain = null;
  if (!s || !g || !c) return;
  g.gain.cancelScheduledValues(c.currentTime);
  g.gain.setTargetAtTime(0, c.currentTime, 0.6);
  window.setTimeout(() => {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
    g.disconnect();
  }, 3000);
}

/** How tense the field is: near Domination, late rites, the match decided. */
export function intensityFor(input: {
  domination: { blue: number; red: number };
  domWin: number;
  turn: number;
  over: boolean;
}): number {
  if (input.over) return 0;
  const lead = Math.max(input.domination.blue, input.domination.red) / Math.max(1, input.domWin);
  // Silent until a side is two-thirds of the way, full near the line.
  const dom = Math.max(0, Math.min(1, (lead - 0.62) / 0.3));
  // The late rites: from rite 12 (both chairs) the dread starts to gather.
  const late = Math.max(0, Math.min(0.6, (input.turn - 12) / 14));
  return Math.max(dom, late);
}
