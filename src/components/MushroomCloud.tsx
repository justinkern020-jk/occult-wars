import { useEffect, useRef } from 'react';

type Props = {
  active: boolean;
  /** Fired after the cinematic completes. */
  onDone?: () => void;
};

const DURATION_MS = 4200;

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  hue: number;
  kind: 'ember' | 'ash';
};

type Puff = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  grow: number;
  alpha: number;
  layer: 'stem' | 'cap' | 'skirt' | 'billow';
  phase: number;
};

/**
 * Cinematic gadget detonation — film grain, flash, shockwaves, volumetric
 * stem/cap (canvas smoke), heat shimmer, ash fall. Brass/ink palette (~4.2s).
 */
export function MushroomCloud({ active, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => onDone?.(), DURATION_MS);
    document.documentElement.classList.add('nuke-shake-active');
    return () => {
      window.clearTimeout(t);
      document.documentElement.classList.remove('nuke-shake-active');
    };
  }, [active, onDone]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const embers: Ember[] = [];
    for (let i = 0; i < 72; i++) {
      const kind: Ember['kind'] = i % 3 === 0 ? 'ash' : 'ember';
      embers.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * (0.35 + Math.random() * 0.45),
        vx: (Math.random() - 0.5) * 0.55,
        vy: -(0.35 + Math.random() * 1.4),
        r: kind === 'ash' ? 1 + Math.random() * 2.2 : 1.2 + Math.random() * 2.8,
        life: 0,
        maxLife: 1.6 + Math.random() * 2.4,
        hue: Math.random(),
        kind,
      });
    }

    const puffs: Puff[] = [];
    const cx = () => w * 0.5;
    const groundY = () => h * 0.72;

    // Stem volumetric layers
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      puffs.push({
        x: 0,
        y: t,
        rx: 10 + t * 8 + Math.random() * 6,
        ry: 14 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.08 - Math.random() * 0.06,
        grow: 0.04 + Math.random() * 0.05,
        alpha: 0.35 + Math.random() * 0.35,
        layer: 'stem',
        phase: Math.random() * Math.PI * 2,
      });
    }
    // Cap cauliflower lobes
    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * Math.PI * 2;
      puffs.push({
        x: Math.cos(ang) * (0.35 + Math.random() * 0.4),
        y: Math.sin(ang) * 0.25 - 0.1,
        rx: 28 + Math.random() * 36,
        ry: 18 + Math.random() * 22,
        vx: Math.cos(ang) * 0.12,
        vy: -0.05 + Math.random() * 0.04,
        grow: 0.08 + Math.random() * 0.1,
        alpha: 0.4 + Math.random() * 0.4,
        layer: 'cap',
        phase: Math.random() * Math.PI * 2,
      });
    }
    // Secondary billows under cap
    for (let i = 0; i < 10; i++) {
      puffs.push({
        x: (Math.random() - 0.5) * 1.2,
        y: 0.15 + Math.random() * 0.25,
        rx: 20 + Math.random() * 28,
        ry: 12 + Math.random() * 16,
        vx: (Math.random() - 0.5) * 0.1,
        vy: 0.02,
        grow: 0.06,
        alpha: 0.3 + Math.random() * 0.25,
        layer: 'billow',
        phase: Math.random() * Math.PI * 2,
      });
    }
    // Ground dust skirt
    for (let i = 0; i < 14; i++) {
      puffs.push({
        x: (Math.random() - 0.5) * 2.4,
        y: 0,
        rx: 40 + Math.random() * 50,
        ry: 8 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.02,
        grow: 0.12 + Math.random() * 0.1,
        alpha: 0.35 + Math.random() * 0.3,
        layer: 'skirt',
        phase: Math.random() * Math.PI * 2,
      });
    }

    const t0 = performance.now();
    let last = t0;

    const colorFor = (u: number, hot: number): string => {
      // orange → brass → ash over life; hot near flash
      const brass = { r: 198, g: 161, b: 91 };
      const parchment = { r: 243, g: 234, b: 215 };
      const ember = { r: 255, g: 170, b: 70 };
      const ash = { r: 52, g: 40, b: 28 };
      const ink = { r: 20, g: 15, b: 12 };
      let a = parchment;
      let b = brass;
      let t = u;
      if (u < 0.25) {
        a = ember;
        b = parchment;
        t = u / 0.25;
      } else if (u < 0.55) {
        a = parchment;
        b = brass;
        t = (u - 0.25) / 0.3;
      } else {
        a = brass;
        b = ash;
        t = (u - 0.55) / 0.45;
      }
      const lean = hot * 0.35;
      const r = Math.round(a.r + (b.r - a.r) * t + lean * (ember.r - a.r));
      const g = Math.round(a.g + (b.g - a.g) * t + lean * (ember.g - a.g) * 0.5);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      const towardInk = Math.max(0, (u - 0.7) / 0.3);
      const rr = Math.round(r + (ink.r - r) * towardInk * 0.45);
      const gg = Math.round(g + (ink.g - g) * towardInk * 0.45);
      const bb = Math.round(bl + (ink.b - bl) * towardInk * 0.45);
      return `${rr},${gg},${bb}`;
    };

    const frame = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const u = Math.min(1, elapsed / (DURATION_MS / 1000));

      ctx.clearRect(0, 0, w, h);

      // Volumetric cloud progress
      const stemH = Math.min(1, Math.max(0, (elapsed - 0.18) / 1.1));
      const capBloom = Math.min(1, Math.max(0, (elapsed - 0.45) / 1.35));
      const skirtSpread = Math.min(1, Math.max(0, (elapsed - 0.12) / 1.0));
      const hot = Math.max(0, 1 - elapsed / 0.9);
      const fadeOut = u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;

      const baseX = cx();
      const baseY = groundY();
      const stemTop = baseY - h * 0.38 * stemH;
      const capY = stemTop - h * 0.02;

      ctx.save();
      ctx.globalAlpha = fadeOut;

      // Ground glow skirt wash
      if (skirtSpread > 0) {
        const grd = ctx.createRadialGradient(baseX, baseY, 4, baseX, baseY, w * 0.55 * skirtSpread);
        grd.addColorStop(0, `rgba(255, 200, 100, ${0.35 * hot + 0.12})`);
        grd.addColorStop(0.35, `rgba(198, 161, 91, ${0.22 * skirtSpread})`);
        grd.addColorStop(1, 'rgba(20, 15, 12, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(baseX, baseY, w * 0.5 * skirtSpread, h * 0.06 * skirtSpread + 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw puffs back-to-front: skirt → stem → billow → cap
      const order: Puff['layer'][] = ['skirt', 'stem', 'billow', 'cap'];
      for (const layer of order) {
        for (const p of puffs) {
          if (p.layer !== layer) continue;
          let px = baseX;
          let py = baseY;
          let scale = 1;
          let appear = 1;
          if (layer === 'stem') {
            appear = stemH;
            py = baseY - (baseY - stemTop) * p.y * stemH;
            px = baseX + Math.sin(elapsed * 2.2 + p.phase) * (6 + p.y * 10) * stemH;
            scale = 0.35 + stemH * (0.65 + p.y * 0.5);
          } else if (layer === 'cap') {
            appear = capBloom;
            const spread = 0.4 + capBloom * 0.9;
            px = baseX + p.x * w * 0.16 * spread;
            py = capY + p.y * h * 0.1 * spread;
            scale = 0.2 + capBloom * 1.15;
          } else if (layer === 'billow') {
            appear = Math.min(1, Math.max(0, (elapsed - 0.7) / 1.0));
            px = baseX + p.x * w * 0.14 * (0.5 + appear);
            py = stemTop + p.y * h * 0.08;
            scale = 0.3 + appear * 0.9;
          } else {
            appear = skirtSpread;
            px = baseX + p.x * w * 0.22 * skirtSpread;
            py = baseY + 4;
            scale = 0.3 + skirtSpread * 1.1;
          }
          if (appear <= 0.01) continue;

          // Drift
          p.x += p.vx * dt * 0.15;
          p.phase += dt * 1.5;

          const rx = p.rx * scale * (1 + Math.sin(elapsed * 1.8 + p.phase) * 0.06);
          const ry = p.ry * scale * (1 + Math.cos(elapsed * 1.5 + p.phase) * 0.08);
          const rgb = colorFor(Math.min(1, u * 0.85 + (layer === 'cap' ? 0 : 0.1)), hot);
          const a = p.alpha * appear * (0.55 + 0.45 * (1 - u * 0.35));

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(p.phase) * 0.08);
          ctx.filter = 'blur(6px)';
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
          g.addColorStop(0, `rgba(${rgb}, ${a})`);
          g.addColorStop(0.45, `rgba(${rgb}, ${a * 0.55})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          // Inner hot core for cap/stem early
          if ((layer === 'cap' || layer === 'stem') && hot > 0.05) {
            ctx.filter = 'blur(3px)';
            const core = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, 0, rx * 0.45);
            core.addColorStop(0, `rgba(255, 244, 200, ${0.35 * hot * appear})`);
            core.addColorStop(1, 'rgba(255, 200, 100, 0)');
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.ellipse(0, -ry * 0.15, rx * 0.4, ry * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Stem highlight core (sharper)
      if (stemH > 0.05) {
        ctx.filter = 'blur(4px)';
        const stemGrad = ctx.createLinearGradient(baseX, baseY, baseX, stemTop);
        stemGrad.addColorStop(0, `rgba(60, 40, 24, ${0.55 * stemH})`);
        stemGrad.addColorStop(0.4, `rgba(198, 161, 91, ${0.35 * stemH})`);
        stemGrad.addColorStop(0.75, `rgba(243, 234, 215, ${0.4 * stemH * (0.4 + hot)})`);
        stemGrad.addColorStop(1, `rgba(255, 230, 160, ${0.25 * stemH})`);
        ctx.fillStyle = stemGrad;
        const stemW = 14 + 10 * stemH;
        ctx.beginPath();
        ctx.moveTo(baseX - stemW * 0.7, baseY);
        ctx.bezierCurveTo(
          baseX - stemW * 0.55,
          (baseY + stemTop) / 2,
          baseX - stemW * 0.45,
          stemTop + 20,
          baseX - stemW * 0.35,
          stemTop,
        );
        ctx.lineTo(baseX + stemW * 0.35, stemTop);
        ctx.bezierCurveTo(
          baseX + stemW * 0.45,
          stemTop + 20,
          baseX + stemW * 0.55,
          (baseY + stemTop) / 2,
          baseX + stemW * 0.7,
          baseY,
        );
        ctx.closePath();
        ctx.fill();
        ctx.filter = 'none';
      }

      // Embers / ash
      for (const e of embers) {
        if (elapsed < 0.35) continue;
        e.life += dt;
        if (e.life > e.maxLife) {
          e.life = 0;
          e.x = baseX + (Math.random() - 0.5) * w * 0.45;
          e.y = stemTop + Math.random() * (baseY - stemTop) * 0.6;
          e.vy = -(0.4 + Math.random() * 1.5);
          e.vx = (Math.random() - 0.5) * 0.7;
        }
        e.x += e.vx * 60 * dt;
        e.y += e.vy * 60 * dt;
        e.vy -= 0.15 * dt;
        const lifeU = e.life / e.maxLife;
        const a = (lifeU < 0.15 ? lifeU / 0.15 : 1 - (lifeU - 0.15) / 0.85) * fadeOut;
        if (e.kind === 'ember') {
          ctx.fillStyle = `rgba(${colorFor(lifeU * 0.5, hot)}, ${0.85 * a})`;
          ctx.shadowColor = 'rgba(198, 161, 91, 0.8)';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = `rgba(90, 70, 50, ${0.55 * a})`;
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.r * (e.kind === 'ash' ? 1.4 : 1), e.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      if (elapsed < DURATION_MS / 1000 + 0.1) {
        rafRef.current = requestAnimationFrame(frame);
      }
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="nuke-overlay"
      data-testid="mushroom-cloud"
      role="presentation"
      aria-hidden
    >
      <div className="nuke-fade" />
      <div className="nuke-vignette" />
      <div className="nuke-grain" />
      <div className="nuke-flash" />
      <div className="nuke-afterimage" />

      <div className="nuke-shockwave" />
      <div className="nuke-shockwave nuke-shockwave-2" />
      <div className="nuke-shockwave nuke-shockwave-3" />
      <div className="nuke-dust-skirt" />

      <canvas ref={canvasRef} className="nuke-canvas" />

      <svg className="nuke-heat" aria-hidden>
        <defs>
          <filter id="nukeTurbulence" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018"
              numOctaves="2"
              seed="7"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.016;0.022;0.016"
                dur="2.8s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#nukeTurbulence)" opacity="0.35" className="nuke-heat-rect" />
      </svg>

      <p className="nuke-legend">The gadget answers</p>
    </div>
  );
}
