import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Candlelight behind the menu: 4-6 small flickering candles set in the empty
 * corners of the frame (never over a button or a line of text: each spot is
 * checked against the menu's own controls), warm light pools that breathe on
 * the surroundings, and slow smoke and embers rising from the flames.
 *
 * Cheap on CPU: the flames and light pools are DOM layers animated with
 * opacity/transform only (compositor work); the smoke is one small canvas
 * drawn at half resolution (CSS scales it up — smoke wants the softness),
 * ~30 fps (24 on phones), paused while the page is hidden or scrolled away.
 * prefers-reduced-motion: the candles burn as a still glow, one still frame
 * of haze, no motion.
 */
const SCALE = 0.5;

type Puff = { x: number; y: number; r: number; vx: number; vy: number; a: number; life: number; age: number; spin: number; rot: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; flick: number };
/** A candle: base point (px in the veil), wax height, flicker phase. */
export type Candle = { x: number; y: number; h: number; d: number; big: boolean };

function makeSmokeSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // A few soft lobes so a puff is a wisp, not a perfect disc.
  for (let i = 0; i < 6; i++) {
    const x = 64 + Math.cos(i * 1.7) * 18;
    const y = 64 + Math.sin(i * 2.3) * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, 44);
    grad.addColorStop(0, 'rgba(214,200,178,0.42)');
    grad.addColorStop(0.5, 'rgba(160,146,126,0.18)');
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
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.3, 'rgba(255,160,64,0.95)');
  grad.addColorStop(1, 'rgba(180,40,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return c;
}

type Box = { l: number; t: number; r: number; b: number };
const BLOCKERS =
  'button, a, input, select, textarea, label, h1, h2, h3, p, li, img, table, [role="button"], .menu-door, .presents-socket, .menu-rites, .daily-rites';

/**
 * Free spots for candles. Scans the first screen of the frame (down to `fold`)
 * for places where a candle and its flame touch nothing readable or clickable,
 * then sets them as little clusters (a tall candle with a shorter one beside
 * it) spread as far apart as the free space allows, preferring the frame's
 * sides. Falls back to the frame's lower edge if the first screen is full.
 */
export function placeCandles(
  W: number,
  H: number,
  fold: number,
  blockers: Box[],
  max: number,
  rand: () => number = Math.random,
): Candle[] {
  const TALL = 48;
  const hits = (b: Box) => blockers.some((o) => b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t);
  // The candle and its flame, with a little air around them.
  const boxAt = (x: number, y: number, h: number): Box => ({ l: x - 14, r: x + 14, t: y - h - 30, b: y + 4 });
  const fits = (x: number, y: number, h: number) => {
    const b = boxAt(x, y, h);
    return b.l >= 6 && b.r <= W - 6 && b.t >= 6 && b.b <= H - 2 && !hits(b);
  };
  const out: Candle[] = [];
  const add = (x: number, y: number, h: number, big: boolean) => {
    out.push({ x: Math.round(x), y: Math.round(y), h, d: Math.round(rand() * 1800), big });
  };
  const clear = (x: number, y: number, gap: number) => out.every((o) => Math.hypot(o.x - x, o.y - y) >= gap);

  const bottom = Math.min(H - 6, Math.max(120, fold));
  const pts: { x: number; y: number }[] = [];
  for (let y = 100; y <= bottom; y += 10) for (let x = 20; x <= W - 20; x += 8) if (fits(x, y, TALL)) pts.push({ x, y });
  /** Where a shorter companion fits beside a tall candle (toward the middle of the frame first). */
  const pairDx = (x: number, y: number): number | null => {
    const inward = x < W / 2 ? 1 : -1;
    for (const dx of [22 * inward, -22 * inward, 26 * inward, -26 * inward]) if (fits(x + dx, y + 4, 36)) return dx;
    return null;
  };
  const edge = (x: number) => Math.min(x, W - x) / Math.max(1, W / 2); // 0 at a side, 1 mid-frame
  const sites: { x: number; y: number }[] = [];
  const clusters = Math.ceil(max / 2);
  while (sites.length < clusters && pts.length) {
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (const p of pts) {
      const far = sites.length ? Math.min(...sites.map((s) => Math.hypot(s.x - p.x, s.y - p.y))) : 400;
      if (far < 150) continue;
      // Spread out, hug the sides, sit low in the hero, leave room for a companion.
      const score = Math.min(far, 420) - edge(p.x) * 260 + (p.y / bottom) * 60 + (pairDx(p.x, p.y) !== null ? 120 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    sites.push(best);
  }
  for (const s of sites) {
    if (out.length >= max) break;
    add(s.x, s.y, TALL - Math.round(rand() * 8), out.length < 2);
    if (out.length >= max) break;
    // A shorter companion beside it.
    const dx = pairDx(s.x, s.y);
    if (dx !== null && clear(s.x + dx, s.y + 4, 18)) add(s.x + dx, s.y + 4, 26 + Math.round(rand() * 10), false);
  }
  // Nothing free on the first screen (a very full phone layout): line the lower edge.
  for (const k of [0.08, 0.92, 0.26, 0.74, 0.5]) {
    if (out.length >= Math.min(max, 4)) break;
    const x = Math.round(W * k);
    const h = 30 + Math.round(rand() * 14);
    if (fits(x, H - 12, h) && clear(x, H - 12, 60)) add(x, H - 12, h, out.length < 2);
  }
  return out.slice(0, max);
}

function measure(veil: HTMLElement, layer: HTMLElement, max: number): Candle[] {
  const vr = veil.getBoundingClientRect();
  const blockers: Box[] = [];
  veil.querySelectorAll<HTMLElement>(BLOCKERS).forEach((el) => {
    if (layer.contains(el)) return;
    let r: { left: number; top: number; right: number; bottom: number; width: number; height: number } = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    // A letterboxed frame (object-fit: contain) only covers its painted part.
    if (el instanceof HTMLImageElement && el.naturalWidth && el.naturalHeight && /contain|scale-down/.test(getComputedStyle(el).objectFit)) {
      const k = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
      const w = el.naturalWidth * k;
      const h = el.naturalHeight * k;
      const left = r.left + (r.width - w) / 2;
      const top = r.top + (r.height - h) / 2;
      r = { left, top, right: left + w, bottom: top + h, width: w, height: h };
    }
    blockers.push({ l: r.left - vr.left - 6, t: r.top - vr.top - 6, r: r.right - vr.left + 6, b: r.bottom - vr.top + 6 });
  });
  // The first screen of the frame: what is visible before any scrolling.
  const fold = (window.innerHeight || 800) - Math.max(0, vr.top + window.scrollY);
  return placeCandles(Math.round(vr.width), Math.round(vr.height), Math.max(200, fold), blockers, max);
}

export function MenuAtmosphere() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLCanvasElement | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Find the empty corners once the menu has laid out (and again when it reflows).
  useEffect(() => {
    const layer = layerRef.current;
    const veil = layer?.parentElement;
    if (!layer || !veil) return;
    const phone = window.matchMedia?.('(max-width: 640px)').matches ?? false;
    let timer = 0;
    const place = () => {
      const next = measure(veil, layer, phone ? 4 : 6);
      candlesRef.current = next;
      setCandles(next);
    };
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 180);
    };
    const first = window.setTimeout(place, 60);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(soon) : null;
    ro?.observe(veil);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(timer);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const phone = window.matchMedia?.('(max-width: 640px)').matches ?? false;
    const FRAME_MS = 1000 / (phone ? 24 : 30);
    const SMOKE = phone ? 12 : 20;
    const EMBERS = phone ? 16 : 30;
    const smoke = makeSmokeSprite();
    const ember = makeEmberSprite();
    let w = 1;
    let h = 1;
    /** The part of the (tall) menu someone actually sees first: the hero. */
    const band = () => Math.min(h, (window.innerHeight || 900) * 1.15 * SCALE);
    const puffs: Puff[] = [];
    const embers: Ember[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pickCandle = () => {
      const cs = candlesRef.current;
      return cs.length ? cs[Math.floor(Math.random() * cs.length)]! : null;
    };

    const spawnPuff = (p: Partial<Puff> = {}): Puff => {
      // Half the wisps leave a flame; the rest are haze across the first screen.
      const c = Math.random() < 0.5 ? pickCandle() : null;
      const fromFlame = !!c;
      return {
        x: c ? c.x * SCALE + rnd(-3, 3) : rnd(0.04, 0.96) * w,
        y: c ? (c.y - c.h - 18) * SCALE : band() * rnd(0.35, 1.05),
        r: fromFlame ? rnd(10, 18) * SCALE * 2 : rnd(44, 96) * SCALE * 2,
        vx: rnd(-3, 3) * SCALE,
        vy: fromFlame ? rnd(-16, -9) * SCALE : rnd(-9, -4) * SCALE,
        a: fromFlame ? rnd(0.45, 0.75) : rnd(0.45, 0.8),
        life: rnd(12, 22),
        age: 0,
        spin: rnd(-0.05, 0.05),
        rot: rnd(0, Math.PI * 2),
        ...p,
      };
    };
    const spawnEmber = (): Ember => {
      const c = Math.random() < 0.7 ? pickCandle() : null;
      return {
        x: c ? c.x * SCALE + rnd(-2, 2) : rnd(0.08, 0.92) * w,
        y: c ? (c.y - c.h - 14) * SCALE : band() * rnd(0.7, 1.02),
        vx: rnd(-3, 3) * SCALE,
        vy: rnd(-30, -14) * SCALE,
        life: rnd(3.5, 8),
        age: 0,
        size: rnd(2.4, 4.6) * SCALE * 2,
        flick: rnd(0, 6.28),
      };
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * SCALE));
      h = Math.max(1, Math.round(r.height * SCALE));
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    const seed = () => {
      puffs.length = 0;
      embers.length = 0;
      for (let i = 0; i < SMOKE; i++) {
        const p = spawnPuff();
        p.age = rnd(0, p.life);
        p.y += p.age * p.vy;
        puffs.push(p);
      }
      for (let i = 0; i < EMBERS; i++) {
        const e = spawnEmber();
        e.age = rnd(0, e.life);
        embers.push(e);
      }
    };
    seed();

    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i]!;
        p.age += dt;
        if (p.age >= p.life || p.y + p.r < 0) {
          puffs[i] = spawnPuff();
          continue;
        }
        // Drift: a slow sway as the warm air climbs, spreading as it rises.
        p.x += (p.vx + Math.sin(t * 0.00025 + i) * 3 * SCALE) * dt;
        p.y += p.vy * dt;
        p.r += 2.6 * SCALE * dt;
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
        const e = embers[i]!;
        e.age += dt;
        if (e.age >= e.life || e.y < 0) {
          embers[i] = spawnEmber();
          continue;
        }
        e.x += (e.vx + Math.sin(t * 0.0012 + e.flick) * 6 * SCALE) * dt;
        e.y += e.vy * dt;
        const k = e.age / e.life;
        const flicker = 0.65 + 0.35 * Math.sin(t * 0.012 + e.flick * 3);
        ctx.globalAlpha = Math.max(0, (k < 0.1 ? k / 0.1 : 1 - k) * flicker);
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
    // Once the candles are placed, let the smoke leave from them.
    const reseed = window.setTimeout(() => {
      seed();
      if (reduce?.matches) still();
    }, 400);
    document.addEventListener('visibilitychange', onVis);
    reduce?.addEventListener?.('change', onMotion);
    if (reduce?.matches) still();
    else start();
    return () => {
      stop();
      window.clearTimeout(reseed);
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reduce?.removeEventListener?.('change', onMotion);
    };
  }, []);

  return (
    <div ref={layerRef} className="menu-atmos-layer" aria-hidden>
      <canvas ref={ref} className="menu-atmos" data-testid="menu-atmos" />
      {candles.map((c, i) => (
        <span
          key={`${c.x},${c.y}`}
          className={`menu-candle${c.big ? ' is-big' : ''}`}
          data-testid="menu-candle"
          style={
            {
              left: `${c.x}px`,
              top: `${c.y}px`,
              '--wax': `${c.h}px`,
              '--d': `-${c.d + i * 137}ms`,
            } as CSSProperties
          }
        >
          <span className="menu-candle-pool" />
          <span className="menu-candle-halo" />
          <span className="menu-candle-wax" />
          <span className="menu-candle-wick" />
          <span className="menu-candle-flame" />
        </span>
      ))}
    </div>
  );
}
