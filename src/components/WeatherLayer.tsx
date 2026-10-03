/**
 * Weather and time of day over the field: cosmetic only. One pick per match
 * (rain, fog, moonlight, snow, dusk or clear), drawn as a light canvas of
 * particles plus CSS washes laid over whatever map is rendered. Pointer
 * events pass straight through. Reduced motion keeps the wash, drops the fall.
 */
import { useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion, useSettings } from '../game/settings';

export type Weather = 'rain' | 'fog' | 'moonlight' | 'snow' | 'dusk' | 'clear';
export const WEATHERS: readonly Weather[] = ['rain', 'fog', 'moonlight', 'snow', 'dusk', 'clear'];
export const WEATHER_LABEL: Record<Weather, string> = {
  rain: 'Rain',
  fog: 'Fog',
  moonlight: 'Moonlight',
  snow: 'Snow',
  dusk: 'Dusk',
  clear: 'Clear night',
};

let lastWeather: Weather | null = null;
/** What the current field shows (for the highlight plate); null when off. */
export function currentWeather(): Weather | null {
  return lastWeather;
}

export function pickWeather(rand: () => number = Math.random): Weather {
  return WEATHERS[Math.floor(rand() * WEATHERS.length)] ?? 'clear';
}

type Drop = { x: number; y: number; v: number; l: number; r: number; d: number };

export function WeatherLayer({ forced }: { forced?: Weather }) {
  const { weather: on } = useSettings();
  const kind = useMemo<Weather>(() => {
    if (forced) return forced;
    try {
      const q = new URLSearchParams(window.location.search).get('weather');
      if (q && (WEATHERS as readonly string[]).includes(q)) return q as Weather;
    } catch {
      /* no location */
    }
    return pickWeather();
  }, [forced]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    lastWeather = on ? kind : null;
    return () => {
      lastWeather = null;
    };
  }, [on, kind]);

  useEffect(() => {
    if (!on || (kind !== 'rain' && kind !== 'snow')) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = prefersReducedMotion();
    let w = 0;
    let h = 0;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const fit = () => {
      const r = cv.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(cv);
    const n = kind === 'rain' ? 120 : 80;
    const drops: Drop[] = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      v: kind === 'rain' ? 0.9 + Math.random() * 0.6 : 0.05 + Math.random() * 0.08,
      l: kind === 'rain' ? 8 + Math.random() * 12 : 0.8 + Math.random() * 1.8,
      r: Math.random() * Math.PI * 2,
      d: 0.3 + Math.random() * 0.7,
    }));
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      if (kind === 'rain') {
        ctx.strokeStyle = 'rgba(200, 216, 230, 0.5)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const p of drops) {
          p.y += (p.v * dt) / 1000;
          p.x += (0.12 * p.v * dt) / 1000;
          if (p.y > 1.05) {
            p.y = -0.05;
            p.x = Math.random();
          }
          if (p.x > 1.02) p.x -= 1.04;
          const x = p.x * w;
          const y = p.y * h;
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.l * 0.12, y - p.l);
        }
        ctx.stroke();
      } else {
        for (const p of drops) {
          p.y += (p.v * dt) / 1000;
          p.r += dt / 1400;
          if (p.y > 1.03) {
            p.y = -0.03;
            p.x = Math.random();
          }
          const x = (p.x + Math.sin(p.r) * 0.012) * w;
          const y = p.y * h;
          ctx.fillStyle = `rgba(235, 240, 245, ${0.35 + p.d * 0.45})`;
          ctx.beginPath();
          ctx.arc(x, y, p.l * p.d + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    if (still) {
      draw(0);
      return () => ro?.disconnect();
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!document.hidden) draw(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [on, kind]);

  if (!on) return null;
  return (
    <div className={`wx-layer wx-${kind}`} aria-hidden data-testid="weather-layer" data-weather={kind}>
      <div className="wx-wash" />
      {kind === 'fog' && (
        <>
          <div className="wx-fog wx-fog-a" />
          <div className="wx-fog wx-fog-b" />
        </>
      )}
      {kind === 'moonlight' && <div className="wx-moonbeam" />}
      {(kind === 'rain' || kind === 'snow') && <canvas ref={canvasRef} className="wx-canvas" />}
      <span className="wx-tag">{WEATHER_LABEL[kind]}</span>
    </div>
  );
}
