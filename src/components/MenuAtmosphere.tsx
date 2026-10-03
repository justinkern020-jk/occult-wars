import { useEffect, useRef } from 'react';

/**
 * Slow candle smoke and a few rising embers behind the menu doors.
 * Low CPU: one small canvas drawn at reduced resolution (CSS scales it up —
 * smoke wants the softness), ~30 fps, sprites pre-rendered once, paused while
 * the page is hidden or the menu is scrolled away. prefers-reduced-motion:
 * a single still frame of haze, no motion.
 */
const SCALE = 0.5;
const FRAME_MS = 1000 / 30;
const SMOKE = 16;
const EMBERS = 24;

type Puff = { x: number; y: number; r: number; vx: number; vy: number; a: number; life: number; age: number; spin: number; rot: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; flick: number };

function makeSmokeSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // A few soft lobes so a puff is a wisp, not a perfect disc.
  for (let i = 0; i < 6; i++) {
    const x = 64 + Math.cos(i * 1.7) * 18;
    const y = 64 + Math.sin(i * 2.3) * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, 44);
    grad.addColorStop(0, 'rgba(200,188,168,0.30)');
    grad.addColorStop(0.5, 'rgba(150,138,120,0.12)');
    grad.addColorStop(1, 'rgba(120,110,96,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return c;
}

function makeEmberSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255,236,190,1)');
  grad.addColorStop(0.3, 'rgba(255,150,60,0.9)');
  grad.addColorStop(1, 'rgba(180,40,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return c;
}

export function MenuAtmosphere() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const smoke = makeSmokeSprite();
    const ember = makeEmberSprite();
    let w = 1;
    let h = 1;
    const puffs: Puff[] = [];
    const embers: Ember[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const spawnPuff = (p: Partial<Puff> = {}): Puff => ({
      // Candles sit along the lower half, under the doors.
      x: rnd(0.05, 0.95) * w,
      y: h * rnd(0.3, 1.05),
      r: rnd(40, 90) * SCALE * 2,
      vx: rnd(-4, 4) * SCALE,
      vy: rnd(-9, -4) * SCALE,
      a: rnd(0.35, 0.7),
      life: rnd(14, 24),
      age: 0,
      spin: rnd(-0.05, 0.05),
      rot: rnd(0, Math.PI * 2),
      ...p,
    });
    const spawnEmber = (): Ember => ({
      x: rnd(0.08, 0.92) * w,
      y: h * rnd(0.75, 1.02),
      vx: rnd(-3, 3) * SCALE,
      vy: rnd(-26, -12) * SCALE,
      life: rnd(5, 10),
      age: 0,
      size: rnd(2.2, 4.2) * SCALE * 2,
      flick: rnd(0, 6.28),
    });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * SCALE));
      h = Math.max(1, Math.round(r.height * SCALE));
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    for (let i = 0; i < SMOKE; i++) {
      const p = spawnPuff();
      p.age = rnd(0, p.life);
      p.y -= (p.age * -p.vy);
      puffs.push(p);
    }
    for (let i = 0; i < EMBERS; i++) {
      const e = spawnEmber();
      e.age = rnd(0, e.life);
      embers.push(e);
    }

    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.life || p.y + p.r < 0) {
          puffs[i] = spawnPuff();
          continue;
        }
        // Drift: a slow sway as the warm air climbs, spreading as it rises.
        p.x += (p.vx + Math.sin(t * 0.00025 + i) * 3 * SCALE) * dt;
        p.y += p.vy * dt;
        p.r += 2.2 * SCALE * dt;
        p.rot += p.spin * dt;
        const k = p.age / p.life;
        const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        ctx.globalAlpha = Math.max(0, p.a * fade);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(smoke, -p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.age += dt;
        if (e.age >= e.life || e.y < 0) {
          embers[i] = spawnEmber();
          continue;
        }
        e.x += (e.vx + Math.sin(t * 0.0012 + e.flick) * 5 * SCALE) * dt;
        e.y += e.vy * dt;
        const k = e.age / e.life;
        const flicker = 0.65 + 0.35 * Math.sin(t * 0.012 + e.flick * 3);
        ctx.globalAlpha = Math.max(0, (k < 0.1 ? k / 0.1 : 1 - k) * flicker * 0.85);
        const s = e.size;
        ctx.drawImage(ember, e.x - s, e.y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    let raf = 0;
    let last = 0;
    let running = false;
    let visible = true;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      const dt = Math.min(0.1, (t - (last || t)) / 1000);
      last = t;
      draw(t, dt);
    };
    const start = () => {
      if (running || reduce?.matches || document.hidden || !visible) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const still = () => {
      // Reduced motion: one quiet frame of haze, embers left out.
      stop();
      embers.length = 0;
      draw(0, 0);
    };
    const onMotion = () => (reduce?.matches ? still() : start());
    const onVis = () => (document.hidden ? stop() : start());
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([en]) => {
            visible = !!en?.isIntersecting;
            if (visible) start();
            else stop();
          })
        : null;
    io?.observe(canvas);
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            resize();
            // Resizing clears the canvas: the still frame must be drawn again.
            if (reduce?.matches) draw(0, 0);
          })
        : null;
    ro?.observe(canvas);
    document.addEventListener('visibilitychange', onVis);
    reduce?.addEventListener?.('change', onMotion);
    if (reduce?.matches) still();
    else start();
    return () => {
      stop();
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reduce?.removeEventListener?.('change', onMotion);
    };
  }, []);

  return <canvas ref={ref} className="menu-atmos" aria-hidden data-testid="menu-atmos" />;
}
