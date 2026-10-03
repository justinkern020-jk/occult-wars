/** Brass clicks, clash/gunshot SFX, stingers; moonlight menu + Soulsborne match bed. */

export type MusicBed = 'none' | 'menu' | 'match';

let ctx: AudioContext | null = null;
let unlockBound = false;
let bed: MusicBed = 'none';
let bedStop: (() => void) | null = null;
let bedGen = 0;
const liveOsc: OscillatorNode[] = [];

function getAC(): AudioContext | null {
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

/** Resume AudioContext; call from any user gesture. Safe to call often. */
export function unlockAudio(): void {
  const c = getAC();
  if (!c) return;
  if (c.state === 'suspended') {
    void c.resume().catch(() => {});
  }
}

function bindUnlockOnce(): void {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const kick = () => {
    unlockAudio();
    // If a bed was requested while suspended, restart it now.
    if (bed !== 'none' && !bedStop) {
      const want = bed;
      bed = 'none';
      setMusicBed(want);
    }
  };
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('keydown', kick, { passive: true });
  window.addEventListener('touchstart', kick, { passive: true });
}

bindUnlockOnce();

function beep(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.1,
  delay = 0,
) {
  const c = getAC();
  if (!c) return;
  unlockAudio();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function brassClick() {
  unlockAudio();
  beep(440, 0.05, 'triangle', 0.1);
  beep(660, 0.04, 'sine', 0.07, 0.02);
}

export function clashSfx() {
  unlockAudio();
  const n = 1 + Math.floor(Math.random() * 3);
  const a = new Audio(`/assets/audio/swords/clash-${n}.mp3`);
  a.volume = 0.55;
  void a.play().catch(() => {
    beep(180, 0.1, 'sawtooth', 0.12);
    beep(90, 0.14, 'square', 0.08, 0.05);
  });
}

/** Real recorded gunshot for ranged strikes (replaces Atari square bloop). */
export function gunshotSfx() {
  unlockAudio();
  const n = 1 + Math.floor(Math.random() * 3);
  const a = new Audio(`/assets/audio/guns/shot-${n}.mp3`);
  a.volume = 0.7;
  a.playbackRate = 0.94 + Math.random() * 0.12;
  void a.play().catch(() => {
    // Noise-burst fallback if mp3 blocked
    const c = getAC();
    if (!c) return;
    const t0 = c.currentTime;
    const bufferSize = Math.floor(c.sampleRate * 0.18);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.exp(-i / (c.sampleRate * 0.045));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.setValueAtTime(0.45, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2800;
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t0);
    beep(90, 0.12, 'sine', 0.2, 0);
  });
}


/** Mystical wind chimes — plays at match open before the theme. */
export function windChimeSfx(): Promise<void> {
  unlockAudio();
  return new Promise((resolve) => {
    const a = new Audio('/assets/audio/sfx/wind-chime.mp3');
    a.volume = 0.26;
    const done = () => resolve();
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', done, { once: true });
    void a.play().catch(done);
    // Safety: don't block theme forever
    window.setTimeout(done, 3200);
  });
}

/** Wooden coin-move knock ("deep hollow knock"): small preloaded pool, reused. */
const COIN_MOVE_SRC = '/assets/audio/sfx/wood-chime-move.mp3';
const COIN_MOVE_POOL = 3;
let coinMovePool: HTMLAudioElement[] | null = null;
let coinMoveNext = 0;

function getCoinMovePool(): HTMLAudioElement[] {
  if (coinMovePool) return coinMovePool;
  coinMovePool = [];
  if (typeof Audio === 'undefined') return coinMovePool;
  for (let i = 0; i < COIN_MOVE_POOL; i++) {
    try {
      const a = new Audio(COIN_MOVE_SRC);
      a.preload = 'auto';
      coinMovePool.push(a);
    } catch {
      /* no audio element support */
    }
  }
  return coinMovePool;
}

/** Warm the coin-move pool so the first move doesn't lag. */
export function preloadCoinMoveSfx(): void {
  try {
    getCoinMovePool().forEach((a) => a.load());
  } catch {
    /* fail silently */
  }
}

/** Wooden knock when a coin (unit) moves or is deployed. Fails silently. */
export function coinMoveSfx(): void {
  try {
    unlockAudio();
    const pool = getCoinMovePool();
    if (pool.length === 0) return;
    // Prefer an idle element; otherwise reuse round-robin.
    let a = pool.find((x) => x.paused || x.ended);
    if (!a) {
      a = pool[coinMoveNext % pool.length];
      coinMoveNext++;
    }
    a.pause();
    a.currentTime = 0;
    a.volume = 0.35;
    // Let the rate nudge pitch too (subtle variation between knocks).
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    a.playbackRate = 0.94 + Math.random() * 0.12;
    void a.play().catch(() => {});
  } catch {
    /* fail silently */
  }
}

/** Spell-cast chime ("crystalline rune chime"): small preloaded pool, reused. */
const SPELL_CAST_SRC = '/assets/audio/sfx/spell-cast.mp3';
const SPELL_CAST_POOL = 3;
let spellCastPool: HTMLAudioElement[] | null = null;
let spellCastNext = 0;

function getSpellCastPool(): HTMLAudioElement[] {
  if (spellCastPool) return spellCastPool;
  spellCastPool = [];
  if (typeof Audio === 'undefined') return spellCastPool;
  for (let i = 0; i < SPELL_CAST_POOL; i++) {
    try {
      const a = new Audio(SPELL_CAST_SRC);
      a.preload = 'auto';
      spellCastPool.push(a);
    } catch {
      /* no audio element support */
    }
  }
  return spellCastPool;
}

/** Warm the spell-cast pool so the first cast doesn't lag. */
export function preloadSpellCastSfx(): void {
  try {
    getSpellCastPool().forEach((a) => a.load());
  } catch {
    /* fail silently */
  }
}

/** Crystalline rune chime when a spell (rite / device) is cast. Fails silently. */
export function spellCastSfx(): void {
  try {
    unlockAudio();
    const pool = getSpellCastPool();
    if (pool.length === 0) return;
    let a = pool.find((x) => x.paused || x.ended);
    if (!a) {
      a = pool[spellCastNext % pool.length];
      spellCastNext++;
    }
    a.pause();
    a.currentTime = 0;
    a.volume = 0.4;
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    a.playbackRate = 0.97 + Math.random() * 0.06;
    void a.play().catch(() => {});
  } catch {
    /* fail silently */
  }
}

/** ~1.5s air-raid style siren for gas / chlorine rites (replaces cough static). */
export function sirenSfx(dur = 1.5) {
  unlockAudio();
  const c = getAC();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sawtooth';
  // Sweep 600→900→600 Hz twice — classic siren contour
  o.frequency.setValueAtTime(600, t0);
  o.frequency.linearRampToValueAtTime(900, t0 + dur * 0.25);
  o.frequency.linearRampToValueAtTime(600, t0 + dur * 0.5);
  o.frequency.linearRampToValueAtTime(900, t0 + dur * 0.75);
  o.frequency.linearRampToValueAtTime(550, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
  g.gain.setValueAtTime(0.09, t0 + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // Soft lowpass so it is not harsh static
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1800;
  o.connect(f);
  f.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Short distorted metal power-chord sting for Oppenheimer.
 * Sample: Freesound 777136 "130 BPM Harsh Rock Guitar Power Chords and 808 Bass"
 * by DanJFilms — Creative Commons 0.
 * https://freesound.org/people/DanJFilms/sounds/777136/
 * See public/assets/sfx/README.md
 */

export function metalRiffSfx() {
  unlockAudio();
  const a = new Audio('/assets/sfx/metal-riff.mp3?v=4');
  a.volume = 0.78;
  void a.play().catch(() => {
    // WebAudio fallback: stacked saw power chords
    const c = getAC();
    if (!c) return;
    const t0 = c.currentTime;
    const chords: Array<[number, number, number]> = [
      [0, 0.35, 82.41],
      [0.4, 0.35, 98],
      [0.85, 0.55, 110],
      [1.5, 0.7, 82.41],
    ];
    for (const [delay, dur, freq] of chords) {
      for (const f of [freq, freq * 1.5, freq * 2]) {
        const o = c.createOscillator();
        const g = c.createGain();
        const sh = c.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 128) - 1;
          curve[i] = Math.tanh(x * 4.5);
        }
        sh.curve = curve;
        o.type = 'sawtooth';
        o.frequency.value = f;
        const start = t0 + delay;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        o.connect(sh);
        sh.connect(g);
        g.connect(c.destination);
        o.start(start);
        o.stop(start + dur + 0.02);
      }
    }
  });
}

/** Deep boom / rumble when the gadget answers.
 * Layered CC0: qubodup Explosive (162265) + rhapsodize Cinematic Boom (255111) + sub rumble.
 * See public/assets/sfx/README.md
 */

/** Aggressive shout "Nuke 'em!" when the gadget fires.
 * Synthetic TTS (edge-tts en-US-GuyNeural) with grit post-process — original.
 * See public/assets/sfx/README.md
 */
export function nukemVoiceSfx() {
  unlockAudio();
  const a = new Audio('/assets/sfx/nukem.mp3?v=3');
  a.volume = 0.92;
  void a.play().catch(() => {
    // Web Speech fallback if mp3 blocked
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance("Nuke 'em!");
      u.rate = 1.15;
      u.pitch = 0.7;
      u.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  });
}

export function nukeBoomSfx() {
  unlockAudio();
  const a = new Audio('/assets/sfx/nuke-boom.mp3?v=3');
  a.volume = 0.88;
  void a.play().catch(() => {
    const c = getAC();
    if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t0);
    o.frequency.exponentialRampToValueAtTime(22, t0 + 1.8);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.4);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + 2.5);
    // noise crack
    const bufferSize = Math.floor(c.sampleRate * 0.35);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.08));
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.4, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.connect(f);
    f.connect(ng);
    ng.connect(c.destination);
    src.start(t0);
  });
}


/** Recorded police siren for Seth Kern unlock (field recording, not synth).
 * Sample: Freesound 159738 AMB_Siren_Police_Approach_001 by conleec — CC0.
 * https://freesound.org/people/conleec/sounds/159738/
 * See public/assets/sfx/README.md
 */
export function copSirenSfx() {
  unlockAudio();
  const a = new Audio('/assets/sfx/cop-siren.mp3?v=1');
  a.volume = 0.72;
  void a.play().catch(() => {
    // Soft fallback only if mp3 blocked — prefer silence over fake wail
  });
}

export function victoryStinger() {
  unlockAudio();
  beep(220, 0.4, 'sine', 0.09);
  beep(277, 0.35, 'triangle', 0.06, 0.08);
  beep(440, 0.5, 'sine', 0.08, 0.22);
  beep(659, 0.42, 'sine', 0.05, 0.38);
  beep(880, 0.55, 'triangle', 0.04, 0.5);
}

export function defeatStinger() {
  unlockAudio();
  beep(220, 0.5, 'sine', 0.1);
  beep(196, 0.55, 'triangle', 0.08, 0.15);
  beep(147, 0.7, 'sine', 0.09, 0.35);
}

export function playChronicle(id: string) {
  unlockAudio();
  const a = new Audio(`/assets/audio/chronicle/${id}.mp3`);
  a.volume = 0.55;
  void a.play().catch(() => {
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

/* ── Music beds (WebAudio ritual pulse — port of grok sn/nn/an) ── */

function midiHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

function stopLiveOsc() {
  for (const o of liveOsc) {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  }
  liveOsc.length = 0;
}

/** Harmonic sine cluster with lowpass — dark brass/organ color. */
function noteAt(
  c: AudioContext,
  when: number,
  freq: number,
  dur: number,
  gain: number,
) {
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, when);
  filter.frequency.exponentialRampToValueAtTime(
    900,
    when + Math.min(dur, 1.2),
  );
  const master = c.createGain();
  master.gain.setValueAtTime(1e-4, when);
  master.gain.exponentialRampToValueAtTime(gain, when + 0.018);
  master.gain.exponentialRampToValueAtTime(
    Math.max(1e-4, gain * 0.45),
    when + Math.min(0.22, dur * 0.35),
  );
  master.gain.exponentialRampToValueAtTime(1e-4, when + dur);
  filter.connect(master);
  master.connect(c.destination);
  const partials: [number, number][] = [
    [1, 1],
    [2, 0.12],
    [3, 0.04],
  ];
  for (const [mult, amp] of partials) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, when);
    g.gain.value = amp;
    o.connect(g);
    g.connect(filter);
    liveOsc.push(o);
    o.start(when);
    o.stop(when + dur + 0.03);
  }
}

function loopPhrase(
  schedule: (t0: number) => number,
): { stop: () => void } {
  const c = getAC();
  let alive = true;
  let timer = 0;
  const tick = () => {
    if (!alive || !c) return;
    const dur = schedule(c.currentTime + 0.08);
    timer = window.setTimeout(tick, Math.max(300, dur * 1000 - 60));
  };
  tick();
  return {
    stop: () => {
      alive = false;
      window.clearTimeout(timer);
      stopLiveOsc();
    },
  };
}

/**
 * Match theme: Soulsborne cathedral dread bed. Quiet under combat.
 * Wind chime intro (quieter) then fade into battlefield-souls.mp3.
 */
function startMatchTheme(): { stop: () => void } {
  unlockAudio();
  let fallbackStop: (() => void) | null = null;
  let themeTimer = 0;
  let stopped = false;
  const a = new Audio('/assets/audio/music/battlefield-souls.mp3');
  a.loop = true;
  a.volume = 0;
  const startTheme = () => {
    if (stopped) return;
    void a.play().catch(() => {
      if (!stopped) fallbackStop = startMatchThemeFallback().stop;
    });
    // Gentle fade-in after chimes
    const fadeMs = 1800;
    const target = 0.32;
    const t0 = performance.now();
    const tick = () => {
      if (stopped) return;
      const u = Math.min(1, (performance.now() - t0) / fadeMs);
      a.volume = target * u;
      if (u < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  // Chimes first, then theme
  void windChimeSfx().then(() => {
    if (!stopped) startTheme();
  });
  // Also begin theme mid-chime so the handoff feels continuous (~2.1s)
  themeTimer = window.setTimeout(() => {
    if (!stopped && a.paused) startTheme();
  }, 2100);
  return {
    stop: () => {
      stopped = true;
      window.clearTimeout(themeTimer);
      a.pause();
      a.src = '';
      fallbackStop?.();
    },
  };
}

/** Dark drone WebAudio fallback if the souls mp3 fails. */
function startMatchThemeFallback(): { stop: () => void } {
  const c = getAC();
  if (!c) return { stop: () => {} };
  const step = 3.6;
  // Sparse D-minor lament: A Bb A F D
  const melody = [57, 58, 57, 53, 50, 53, 57, 50];
  const g = 0.012;
  return loopPhrase((t0) => {
    noteAt(c, t0, midiHz(26), step * 8 * 0.98, g * 1.1); // D1 drone
    noteAt(c, t0, midiHz(33), step * 8 * 0.98, g * 0.6); // A1
    noteAt(c, t0, midiHz(38), step * 4 * 0.98, g * 0.35); // D2
    noteAt(c, t0 + step * 4, midiHz(36), step * 4 * 0.98, g * 0.3); // C2
    melody.forEach((m, i) => {
      noteAt(c, t0 + i * step, midiHz(m), step * 1.4, g * 0.45);
    });
    return step * 8;
  });
}

/** Menu bed: Moonlight Sonata loop (battlefield uses WebAudio match theme). */
function startMenuTheme(): { stop: () => void } {
  unlockAudio();
  const a = new Audio('/assets/audio/moonlight.mp3');
  a.loop = true;
  a.volume = 0.45;
  void a.play().catch(() => {});
  return {
    stop: () => {
      a.pause();
      a.src = '';
    },
  };
}

export function setMusicBed(next: MusicBed): void {
  bindUnlockOnce();
  if (next === bed && bedStop) return;
  bedGen += 1;
  const gen = bedGen;
  bedStop?.();
  bedStop = null;
  bed = next;
  if (next === 'none') return;

  const c = getAC();
  if (!c) return;

  const start = () => {
    if (gen !== bedGen || bed !== next) return;
    bedStop?.();
    bedStop = (next === 'match' ? startMatchTheme() : startMenuTheme()).stop;
  };

  if (c.state === 'suspended') {
    void c.resume().then(start).catch(() => {
      // Will retry on next pointerdown via bindUnlockOnce kick.
    });
    return;
  }
  start();
}

export function currentMusicBed(): MusicBed {
  return bed;
}
