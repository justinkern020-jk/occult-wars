"""
Battle intensity layer for Occult Wars: a low cathedral choir and deep
strings in D minor (the key of battlefield-souls.mp3), 39 s seamless loop.
Original synthesis (numpy only), CC0. Faded in by Web Audio when a match tips.

  python3 scripts/gen_battle_choir.py /tmp/choir.wav
"""
import sys
import numpy as np

SR = 22050
LOOP = 39.0
N = int(SR * LOOP)
rng = np.random.default_rng(1893)
t = np.arange(N) / SR


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def formant_gain(f, formants):
    g = np.zeros_like(f)
    for fc, bw, amp in formants:
        g += amp / (1 + ((f - fc) / (bw / 2)) ** 2)
    return g


AH = [(650, 110, 1.0), (1080, 140, 0.55), (2650, 220, 0.18), (3500, 300, 0.06)]
OH = [(430, 90, 1.0), (820, 120, 0.5), (2600, 220, 0.1)]


def circular_env(start, dur, attack, release):
    """Envelope that may wrap around the loop end."""
    idx = (np.arange(N) - int(start * SR)) % N
    tt = idx / SR
    env = np.where(tt < attack, 0.5 - 0.5 * np.cos(np.pi * tt / attack), 1.0)
    rel0 = dur - release
    env = np.where(tt > rel0, np.clip(0.5 + 0.5 * np.cos(np.pi * (tt - rel0) / release), 0, 1), env)
    env[tt >= dur] = 0
    return env


def voice(midi, start, dur, vowel, amp, detune_c=0.0):
    f0 = hz(midi) * 2 ** (detune_c / 1200)
    vib = 1 + 0.0045 * np.sin(2 * np.pi * (4.6 + rng.random() * 0.8) * t + rng.random() * 6.28)
    drift = 1 + 0.002 * np.sin(2 * np.pi * (0.07 + rng.random() * 0.05) * t + rng.random() * 6.28)
    inst = f0 * vib * drift
    phase = 2 * np.pi * np.cumsum(inst) / SR
    out = np.zeros(N)
    nmax = int(3800 / f0)
    for n in range(1, nmax + 1):
        g = (1 / n ** 1.15) * formant_gain(np.array([n * f0]), vowel)[0]
        if g < 1e-3:
            continue
        out += g * np.sin(n * phase + rng.random() * 6.28)
    # breath
    breath = rng.standard_normal(N) * 0.012
    return amp * circular_env(start, dur, 2.6, 3.2) * (out + breath)


def strings(midi, start, dur, amp, trem=0.0):
    f0 = hz(midi)
    out = np.zeros(N)
    for d in (-6, 0, 7):
        f = f0 * 2 ** (d / 1200)
        vib = 1 + 0.003 * np.sin(2 * np.pi * (5.2 + rng.random()) * t + rng.random() * 6.28)
        phase = 2 * np.pi * np.cumsum(f * vib) / SR
        for n in range(1, int(2400 / f) + 1):
            g = (1 / n) * (1 / (1 + (n * f / 900) ** 2))
            out += g * np.sin(n * phase + rng.random() * 6.28)
    if trem:
        out *= 1 - trem * (0.5 + 0.5 * np.sin(2 * np.pi * 7.5 * t))
    return amp * circular_env(start, dur, 3.0, 3.5) * out / 3


def drum(at, amp):
    idx = (np.arange(N) - int(at * SR)) % N
    tt = idx / SR
    f = 46 * np.exp(-tt * 3) + 36
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt * 3.2)
    noise = rng.standard_normal(N) * np.exp(-tt * 28) * 0.15
    s = (body + noise) * (tt < 2.5)
    return amp * s


mix = np.zeros(N)
seg = LOOP / 4
# D minor -> B flat -> G minor -> A (harmonic minor dominant): dread that turns.
chords = [
    [38, 50, 57, 62, 65],
    [34, 50, 58, 62, 65],
    [31, 50, 55, 58, 62],
    [33, 49, 57, 61, 64],
]
for i, ch in enumerate(chords):
    s0 = i * seg - 1.2
    dur = seg + 3.4
    bass, *upper = ch
    mix += strings(bass, s0, dur, 0.22)
    mix += strings(bass + 12, s0, dur, 0.14, trem=0.35)
    for k, m in enumerate(upper):
        vowel = AH if k % 2 == 0 else OH
        for d in (-9, -2, 5, 11):
            mix += voice(m, s0 + rng.random() * 0.4, dur, vowel, 0.1, d)
# slow drum: two strokes per bar like a funeral march
for b in range(8):
    mix += drum(b * seg / 2 + 0.05, 0.22 if b % 2 == 0 else 0.13)

# circular reverb: cathedral tail that wraps the loop seam
ir_len = int(SR * 3.2)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (SR * 0.9))
ir[: int(SR * 0.02)] = 0
ir /= np.sqrt(np.sum(ir ** 2))
irN = np.zeros(N)
irN[:ir_len] = ir
wet = np.real(np.fft.ifft(np.fft.fft(mix) * np.fft.fft(irN)))
out = 0.55 * mix + 0.7 * wet
# gentle lowpass for the dark colour
spec = np.fft.rfft(out)
fr = np.fft.rfftfreq(N, 1 / SR)
spec *= 1 / np.sqrt(1 + (fr / 2600) ** 4)
spec[fr < 30] = 0
out = np.fft.irfft(spec, n=N)
out /= np.max(np.abs(out)) + 1e-9
out *= 0.89
import wave

with wave.open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/choir.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print('ok', N / SR)
