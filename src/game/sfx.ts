/** Brass clicks, clash SFX, victory/defeat stingers (Web Audio + mp3). */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function beep(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.04,
  delay = 0,
) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function brassClick() {
  beep(440, 0.04, 'triangle', 0.03);
  beep(660, 0.03, 'sine', 0.02, 0.02);
}

export function clashSfx() {
  const n = 1 + Math.floor(Math.random() * 3);
  const a = new Audio(`/assets/audio/swords/clash-${n}.mp3`);
  a.volume = 0.45;
  void a.play().catch(() => {
    beep(180, 0.08, 'sawtooth', 0.05);
    beep(90, 0.12, 'square', 0.03, 0.05);
  });
}

export function victoryStinger() {
  beep(220, 0.4, 'sine', 0.03);
  beep(277, 0.35, 'triangle', 0.018, 0.08);
  beep(440, 0.5, 'sine', 0.028, 0.22);
  beep(659, 0.42, 'sine', 0.016, 0.38);
  beep(880, 0.55, 'triangle', 0.012, 0.5);
}

export function defeatStinger() {
  beep(220, 0.5, 'sine', 0.04);
  beep(196, 0.55, 'triangle', 0.03, 0.15);
  beep(147, 0.7, 'sine', 0.035, 0.35);
}

export function playChronicle(id: string) {
  const a = new Audio(`/assets/audio/chronicle/${id}.mp3`);
  a.volume = 0.55;
  void a.play().catch(() => {
    /* TTS / silent fallback */
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(id.replace(/_/g, ' '));
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  });
}

export function speakLine(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
