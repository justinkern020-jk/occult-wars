#!/usr/bin/env python3
"""Karplus-Strong metal guitar sting: palm-muted chugs → open power chord.
No square/chiptune — physical string model + soft-clip amp + cab EQ + room."""
from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
RNG = np.random.default_rng(0x0CC017)


def soft_clip(x: np.ndarray, drive: float = 3.8) -> np.ndarray:
    return np.tanh(x * drive)


def one_pole_lp(x: np.ndarray, coef: float) -> np.ndarray:
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        s = s + coef * (float(v) - s)
        y[i] = s
    return y


def one_pole_hp(x: np.ndarray, coef: float) -> np.ndarray:
    y = np.empty_like(x)
    prev_x = 0.0
    prev_y = 0.0
    for i, v in enumerate(x.astype(float)):
        prev_y = coef * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def biquad(x: np.ndarray, b0, b1, b2, a1, a2) -> np.ndarray:
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, xn in enumerate(x.astype(float)):
        yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, xn
        y2, y1 = y1, yn
        y[i] = yn
    return y


def peaking_eq(x: np.ndarray, freq: float, q: float, gain_db: float) -> np.ndarray:
    A = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * freq / SR
    alpha = math.sin(w0) / (2 * q)
    cosw = math.cos(w0)
    b0 = 1 + alpha * A
    b1 = -2 * cosw
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * cosw
    a2 = 1 - alpha / A
    return biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def low_shelf(x: np.ndarray, freq: float, gain_db: float) -> np.ndarray:
    A = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * freq / SR
    cosw = math.cos(w0)
    sinw = math.sin(w0)
    S = 1.0
    alpha = sinw / 2 * math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
    b0 = A * ((A + 1) - (A - 1) * cosw + 2 * math.sqrt(A) * alpha)
    b1 = 2 * A * ((A - 1) - (A + 1) * cosw)
    b2 = A * ((A + 1) - (A - 1) * cosw - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) + (A - 1) * cosw + 2 * math.sqrt(A) * alpha
    a1 = -2 * ((A - 1) + (A + 1) * cosw)
    a2 = (A + 1) + (A - 1) * cosw - 2 * math.sqrt(A) * alpha
    return biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def high_shelf(x: np.ndarray, freq: float, gain_db: float) -> np.ndarray:
    A = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * freq / SR
    cosw = math.cos(w0)
    sinw = math.sin(w0)
    S = 1.0
    alpha = sinw / 2 * math.sqrt((A + 1 / A) * (1 / S - 1) + 2)
    b0 = A * ((A + 1) + (A - 1) * cosw + 2 * math.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * cosw)
    b2 = A * ((A + 1) + (A - 1) * cosw - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * cosw + 2 * math.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * cosw)
    a2 = (A + 1) - (A - 1) * cosw - 2 * math.sqrt(A) * alpha
    return biquad(x, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def karplus_strong(
    freq: float,
    dur: float,
    *,
    brightness: float = 0.55,
    damp: float = 0.996,
    pluck_pos: float = 0.18,
    mute: float = 0.0,
) -> np.ndarray:
    n = int(SR * dur)
    delay = SR / freq
    buf_len = max(2, int(math.floor(delay)))
    frac = delay - buf_len
    burst = RNG.uniform(-1.0, 1.0, buf_len)
    burst = one_pole_lp(burst, 0.35 + 0.45 * brightness)
    shift = max(1, int(pluck_pos * buf_len))
    burst = burst - 0.55 * np.roll(burst, shift)

    out = np.zeros(n, dtype=np.float64)
    ring = burst.astype(np.float64).copy()
    idx = 0
    damp_eff = damp * (1.0 - 0.45 * mute) - 0.004 * mute
    lp = 0.4 + 0.5 * (1.0 - brightness) + 0.25 * mute
    lp = min(0.95, max(0.15, lp))
    prev = 0.0
    for i in range(n):
        i0 = idx % buf_len
        i1 = (idx + 1) % buf_len
        sample = (1 - frac) * ring[i0] + frac * ring[i1]
        filtered = damp_eff * ((1 - lp) * sample + lp * prev)
        prev = sample
        ring[i0] = filtered
        if mute > 0:
            ring[i0] *= 1.0 - 0.0025 * mute
        out[i] = sample
        idx += 1
    attack_n = min(n, int(0.004 * SR))
    tick = RNG.uniform(-1, 1, attack_n) * np.linspace(1, 0, attack_n)
    out[:attack_n] += tick * (0.35 + 0.25 * brightness) * (1 - 0.5 * mute)
    return out


def place(buf: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0) -> None:
    start = int(at * SR)
    end = start + len(sig)
    if end > len(buf):
        sig = sig[: len(buf) - start]
        end = len(buf)
    if start < 0 or start >= len(buf):
        return
    buf[start:end] += sig * gain


def amp_cab(x: np.ndarray) -> np.ndarray:
    y = one_pole_hp(x, 0.995)
    y = low_shelf(y, 90, -3.5)
    y = peaking_eq(y, 280, 0.9, -5.0)
    y = peaking_eq(y, 700, 1.1, -2.5)
    y = peaking_eq(y, 1800, 0.85, 4.5)
    y = peaking_eq(y, 3200, 1.2, 3.0)
    y = high_shelf(y, 5500, -6.0)
    y = soft_clip(y * 1.8, drive=2.2)
    y = soft_clip(y * 1.6, drive=3.4)
    y = peaking_eq(y, 120, 0.7, 2.0)
    return y


def stereo_widen(mono: np.ndarray, delay_ms: float = 11.0) -> np.ndarray:
    d = int(delay_ms * SR / 1000)
    left = mono.copy()
    right = np.zeros_like(mono)
    right[d:] = mono[:-d] * 0.92
    right[:d] = mono[:d] * 0.15
    mid = 0.5 * (left + right)
    side = 0.5 * (left - right) * 1.15
    L = mid + side
    R = mid - side
    return np.stack([L, R], axis=1)


def room_verb(stereo: np.ndarray, wet: float = 0.18) -> np.ndarray:
    out = stereo.copy()
    taps = [(0.018, 0.22, 0), (0.031, 0.16, 1), (0.047, 0.11, 0), (0.068, 0.08, 1)]
    for delay_s, g, ch in taps:
        d = int(delay_s * SR)
        if d >= len(out):
            continue
        delayed = np.zeros_like(out[:, ch])
        delayed[d:] = out[:-d, ch]
        delayed = one_pole_lp(delayed, 0.25)
        out[:, ch] += delayed * g * wet
        out[:, 1 - ch] += delayed * g * wet * 0.55
    return out


def normalize(stereo: np.ndarray, peak: float = 0.92) -> np.ndarray:
    m = np.max(np.abs(stereo))
    if m < 1e-9:
        return stereo
    return stereo * (peak / m)


def write_wav(path: Path, stereo: np.ndarray) -> None:
    pcm = np.clip(stereo, -1, 1)
    pcm16 = (pcm * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm16.tobytes())


def main() -> None:
    dur = 3.4
    n = int(SR * dur)
    dry = np.zeros(n, dtype=np.float64)

    E2, B2, E3, B3 = 82.41, 123.47, 164.81, 246.94

    chug_times = [0.00, 0.22, 0.44, 0.66]
    for i, t in enumerate(chug_times):
        vel = 0.85 if i % 2 == 0 else 0.72
        for f, g in [(E2, 1.0), (B2, 0.55), (E3, 0.35)]:
            s = karplus_strong(
                f * (1 + RNG.uniform(-0.0015, 0.0015)),
                0.28,
                brightness=0.32,
                damp=0.988,
                pluck_pos=0.22,
                mute=0.92,
            )
            place(dry, s, t, gain=vel * g * 0.9)

    place(
        dry,
        karplus_strong(E2, 0.2, brightness=0.28, damp=0.985, mute=0.95),
        0.88,
        0.7,
    )

    open_t = 1.05
    layers = [
        (E2, 1.15, 0.48, 0.9975, 0.14),
        (B2, 0.85, 0.52, 0.9972, 0.17),
        (E3, 0.70, 0.58, 0.9968, 0.20),
        (B3, 0.28, 0.62, 0.9960, 0.25),
        (E2 * 2.002, 0.22, 0.55, 0.9965, 0.30),
    ]
    for f, g, bright, damp, pos in layers:
        s = karplus_strong(
            f,
            2.2,
            brightness=bright,
            damp=damp,
            pluck_pos=pos,
            mute=0.0,
        )
        env = np.ones(len(s))
        a = int(0.008 * SR)
        env[:a] = np.linspace(0.4, 1.0, a)
        place(dry, s * env, open_t, gain=g)

    for f, g in [(E2, 0.55), (B2, 0.4), (E3, 0.3)]:
        s = karplus_strong(f * 1.001, 1.8, brightness=0.5, damp=0.9965, mute=0.05)
        place(dry, s, open_t + 0.14, gain=g)

    processed = amp_cab(dry)

    scrape_n = int(0.9 * SR)
    scrape = RNG.uniform(-1, 1, scrape_n)
    scrape = one_pole_hp(scrape, 0.98)
    scrape = one_pole_lp(scrape, 0.55)
    scrape_env = np.exp(-np.linspace(0, 4, scrape_n))
    processed[:scrape_n] += scrape * scrape_env * 0.04

    stereo = stereo_widen(processed, delay_ms=9.5)
    stereo = room_verb(stereo, wet=0.14)
    stereo = soft_clip(stereo, drive=1.15)
    stereo = normalize(stereo, peak=0.91)

    out_dir = Path("/workspace/occult-wars/public/assets/sfx")
    wav_path = out_dir / "metal-riff.wav"
    mp3_path = out_dir / "metal-riff.mp3"
    write_wav(wav_path, stereo)
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-i", str(wav_path),
            "-codec:a", "libmp3lame", "-b:a", "192k",
            "-ar", "44100", "-ac", "2",
            str(mp3_path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wav_path.unlink(missing_ok=True)
    print(f"Wrote {mp3_path} ({mp3_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
