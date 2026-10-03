/**
 * Leader barks: short period lines on a leader's power, at victory and at
 * defeat. Spoken by a neural text-to-speech voice (edge-tts, en-GB) and run
 * through a gramophone chain (narrow band, soft clipping, a small room and
 * shellac crackle). Subtitled; off with Settings > Leader voices or the
 * device mute.
 */
import { isSoundMuted } from './sfx';
import { setting } from './settings';

export type BarkKind = 'power' | 'foe' | 'victory' | 'defeat';

export const BARKS: Record<BarkKind, { id: string; text: string }[]> = {
  power: [
    { id: 'power_1', text: 'By the old names, rise.' },
    { id: 'power_2', text: 'The circle answers me.' },
    { id: 'power_3', text: 'Now. Strike now.' },
    { id: 'power_4', text: 'Let the lamps gutter.' },
    { id: 'power_5', text: 'Hear me, and obey.' },
    { id: 'power_6', text: 'The rite is mine.' },
  ],
  foe: [
    { id: 'foe_1', text: 'You meddle in things unseen.' },
    { id: 'foe_2', text: 'Kneel.' },
    { id: 'foe_3', text: 'The dark takes notice.' },
    { id: 'foe_4', text: 'Your candles are burning low.' },
  ],
  victory: [
    { id: 'victory_1', text: 'The circle is closed. We hold the field.' },
    { id: 'victory_2', text: 'So ends the working.' },
    { id: 'victory_3', text: 'Mark it in the ledger. Victory.' },
  ],
  defeat: [
    { id: 'defeat_1', text: 'The lamps go dark.' },
    { id: 'defeat_2', text: 'We are undone.' },
    { id: 'defeat_3', text: 'Remember me in the ledger.' },
  ],
};

export const BARK_EVENT = 'ow:bark';
export type BarkDetail = { text: string; foe: boolean; ms: number };

let playing: HTMLAudioElement | null = null;
const last: Partial<Record<BarkKind, string>> = {};

function pick(kind: BarkKind) {
  const pool = BARKS[kind];
  const choices = pool.length > 1 ? pool.filter((b) => b.id !== last[kind]) : pool;
  const b = choices[Math.floor(Math.random() * choices.length)] ?? pool[0];
  last[kind] = b.id;
  return b;
}

/** Speak a bark (victory and defeat wait for their stinger). */
export function leaderBark(kind: BarkKind): void {
  if (typeof window === 'undefined' || !setting('voice') || isSoundMuted()) return;
  // A leader mid-sentence is not interrupted by another power.
  if (playing && !playing.ended && !playing.paused && (kind === 'power' || kind === 'foe')) return;
  const b = pick(kind);
  const delay = kind === 'victory' || kind === 'defeat' ? 1500 : 120;
  window.setTimeout(() => {
    try {
      playing?.pause();
      const a = new Audio(`/assets/audio/voice/${b.id}.mp3`);
      a.volume = 0.85;
      playing = a;
      void a.play().catch(() => undefined);
      window.dispatchEvent(
        new CustomEvent<BarkDetail>(BARK_EVENT, { detail: { text: b.text, foe: kind === 'foe', ms: 3200 } }),
      );
    } catch {
      /* no audio */
    }
  }, delay);
}
