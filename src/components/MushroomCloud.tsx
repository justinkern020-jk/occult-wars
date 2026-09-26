import { useEffect, useRef } from 'react';

type Props = {
  active: boolean;
  /** Fired after the cinematic completes. */
  onDone?: () => void;
};

/** Full cinematic arc — flash → fireball → stem/cap → ash settle. */
const DURATION_MS = 5200;

type Smoke = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow: number;
  life: number;
  maxLife: number;
  spin: number;
  spinV: number;
  /** 0 fireball / 1 stem / 2 cap bright / 3 cap ash / 4 skirt / 5 ember */
  kind: number;
  seed: number;
  turb: number;
};

/**
 * Photoreal gadget detonation — volumetric smoke sprites, fireball core,
 * cauliflower cap, debris skirt, lens bloom, chromatic flash, grain, vignette.
 * Keeps data-testid="mushroom-cloud" and onDone contract with Battlefield.
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
    const ctx = canvas.getContext('2d', { alpha: true });
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

    // Soft volumetric sprite atlas (radial falloff, no hard edges)
    const SPR = 96;
    const makeSprite = (
      stops: Array<[number, string]>,
    ): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = SPR;
      c.height = SPR;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(
        SPR / 2,
        SPR / 2,
        0,
        SPR / 2,
        SPR / 2,
        SPR / 2,
      );
      for (const [u, col] of stops) grd.addColorStop(u, col);
      g.fillStyle = grd;
      g.fillRect(0, 0, SPR, SPR);
      return c;
    };

    const sprFire = makeSprite([
      [0, 'rgba(255,255,255,1)'],
      [0.12, 'rgba(255,244,200,0.95)'],
      [0.28, 'rgba(255,170,60,0.75)'],
      [0.5, 'rgba(220,80,20,0.4)'],
      [0.75, 'rgba(80,30,10,0.12)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const sprOrange = makeSprite([
      [0, 'rgba(255,210,120,0.9)'],
      [0.25, 'rgba(230,120,40,0.65)'],
      [0.55, 'rgba(90,45,20,0.35)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const sprAsh = makeSprite([
      [0, 'rgba(70,58,48,0.75)'],
      [0.35, 'rgba(40,32,26,0.55)'],
      [0.7, 'rgba(18,14,12,0.28)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const sprDark = makeSprite([
      [0, 'rgba(28,22,18,0.85)'],
      [0.4, 'rgba(12,10,8,0.55)'],
      [0.75, 'rgba(5,4,3,0.2)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const sprDust = makeSprite([
      [0, 'rgba(160,130,90,0.55)'],
      [0.35, 'rgba(90,70,45,0.35)'],
      [0.7, 'rgba(40,30,20,0.12)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    const sprEmber = makeSprite([
      [0, 'rgba(255,240,180,1)'],
      [0.3, 'rgba(255,140,40,0.8)'],
      [0.7, 'rgba(180,40,10,0.25)'],
      [1, 'rgba(0,0,0,0)'],
    ]);

    const sprites = [sprFire, sprOrange, sprAsh, sprDark, sprDust, sprEmber];

    const smokes: Smoke[] = [];
    const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
    const cx = () => w * 0.5;
    const groundY = () => h * 0.74;

    const spawn = (partial: Partial<Smoke> & { kind: number }) => {
      smokes.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 20,
        grow: 8,
        life: 0,
        maxLife: 2.5,
        spin: rand(0, Math.PI * 2),
        spinV: rand(-0.4, 0.4),
        seed: rand(0, 1000),
        turb: rand(0.6, 1.4),
        ...partial,
      });
    };

    // Seed initial fireball / stem / cap / skirt volumes
    for (let i = 0; i < 48; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0, 1) ** 0.5;
      spawn({
        kind: 0,
        x: Math.cos(a) * d * 28,
        y: Math.sin(a) * d * 18 - 10,
        vx: Math.cos(a) * rand(10, 40),
        vy: -rand(40, 120),
        r: rand(18, 42),
        grow: rand(30, 70),
        maxLife: rand(1.2, 2.2),
        life: rand(0, 0.05),
      });
    }
    for (let i = 0; i < 90; i++) {
      spawn({
        kind: 1,
        x: rand(-18, 18),
        y: rand(0, 8),
        vx: rand(-8, 8),
        vy: -rand(50, 140),
        r: rand(14, 32),
        grow: rand(12, 28),
        maxLife: rand(2.0, 3.8),
        life: -rand(0, 0.6),
      });
    }
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2);
      const lobe = rand(0.3, 1);
      spawn({
        kind: i % 3 === 0 ? 3 : 2,
        x: Math.cos(a) * lobe * 40,
        y: Math.sin(a) * lobe * 22 - 20,
        vx: Math.cos(a) * rand(15, 55),
        vy: -rand(10, 50) + rand(-10, 20),
        r: rand(28, 64),
        grow: rand(40, 95),
        maxLife: rand(2.4, 4.2),
        life: -rand(0.4, 1.2),
      });
    }
    for (let i = 0; i < 70; i++) {
      spawn({
        kind: 4,
        x: rand(-30, 30),
        y: rand(-4, 6),
        vx: rand(-90, 90),
        vy: -rand(5, 35),
        r: rand(30, 70),
        grow: rand(50, 120),
        maxLife: rand(1.8, 3.5),
        life: -rand(0, 0.25),
      });
    }
    for (let i = 0; i < 80; i++) {
      spawn({
        kind: 5,
        x: rand(-20, 20),
        y: rand(-10, 10),
        vx: rand(-40, 40),
        vy: -rand(60, 200),
        r: rand(2, 6),
        grow: rand(-1, 2),
        maxLife: rand(1.0, 2.8),
        life: -rand(0.2, 1.0),
      });
    }

    // Offscreen for bloom / CA
    const bloom = document.createElement('canvas');
    const bloomCtx = bloom.getContext('2d')!;
    const grain = document.createElement('canvas');
    const grainCtx = grain.getContext('2d')!;
    const GRAIN = 128;
    grain.width = GRAIN;
    grain.height = GRAIN;
    const gdata = grainCtx.createImageData(GRAIN, GRAIN);
    for (let i = 0; i < gdata.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      gdata.data[i] = v;
      gdata.data[i + 1] = v;
      gdata.data[i + 2] = v;
      gdata.data[i + 3] = 255;
    }
    grainCtx.putImageData(gdata, 0, 0);

    const t0 = performance.now();
    let last = t0;

    const noise = (x: number, y: number, t: number) => {
      return (
        Math.sin(x * 0.031 + t * 1.7) * Math.cos(y * 0.027 - t * 1.3) +
        Math.sin((x + y) * 0.019 + t * 0.9) * 0.5
      );
    };

    const frame = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const u = Math.min(1, elapsed / (DURATION_MS / 1000));

      const baseX = cx();
      const baseY = groundY();

      // Phase envelopes
      const flash = elapsed < 0.28 ? 1 - elapsed / 0.28 : Math.max(0, 1 - (elapsed - 0.28) / 0.5) * 0.15;
      const fireball = Math.min(1, Math.max(0, (elapsed - 0.05) / 0.9));
      const stemRise = Math.min(1, Math.max(0, (elapsed - 0.25) / 1.4));
      const capBloom = Math.min(1, Math.max(0, (elapsed - 0.7) / 1.8));
      const skirt = Math.min(1, Math.max(0, (elapsed - 0.1) / 1.1));
      const ashSettle = Math.min(1, Math.max(0, (elapsed - 2.8) / 2.2));
      const fadeOut = u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;
      const stemTop = baseY - h * (0.12 + 0.36 * stemRise);
      const capCy = stemTop - h * 0.02 * capBloom;

      bloom.width = canvas.width;
      bloom.height = canvas.height;
      bloomCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bloomCtx.clearRect(0, 0, w, h);

      // Sky wash — ink / dirty brown photographic grade
      const sky = bloomCtx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgba(4, 3, 6, ${0.92 * fadeOut})`);
      sky.addColorStop(0.45, `rgba(18, 10, 6, ${0.88 * fadeOut})`);
      sky.addColorStop(0.75, `rgba(42, 24, 12, ${0.55 * fadeOut})`);
      sky.addColorStop(1, `rgba(12, 8, 5, ${0.95 * fadeOut})`);
      bloomCtx.fillStyle = sky;
      bloomCtx.fillRect(0, 0, w, h);

      // Ground flash / heat plate
      if (flash > 0.01 || fireball > 0) {
        const hg = bloomCtx.createRadialGradient(
          baseX,
          baseY,
          2,
          baseX,
          baseY,
          w * (0.25 + 0.45 * Math.max(flash, fireball * 0.4)),
        );
        hg.addColorStop(0, `rgba(255,255,255,${0.95 * flash})`);
        hg.addColorStop(0.15, `rgba(255,230,160,${0.7 * flash + 0.25 * fireball})`);
        hg.addColorStop(0.4, `rgba(255,120,30,${0.35 * fireball})`);
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        bloomCtx.globalCompositeOperation = 'screen';
        bloomCtx.fillStyle = hg;
        bloomCtx.fillRect(0, 0, w, h);
        bloomCtx.globalCompositeOperation = 'source-over';
      }

      // Spawn continuous stem/cap/skirt during bloom
      if (elapsed < 3.2 && Math.random() < 0.65) {
        if (stemRise > 0.1) {
          spawn({
            kind: Math.random() < 0.35 ? 3 : 1,
            x: rand(-14, 14),
            y: 0,
            vx: rand(-12, 12),
            vy: -rand(40, 110),
            r: rand(16, 36),
            grow: rand(10, 30),
            maxLife: rand(1.5, 3),
            life: 0,
          });
        }
        if (capBloom > 0.15 && Math.random() < 0.5) {
          const a = rand(0, Math.PI * 2);
          spawn({
            kind: Math.random() < 0.4 ? 3 : 2,
            x: Math.cos(a) * rand(10, 50),
            y: -rand(5, 30),
            vx: Math.cos(a) * rand(8, 40),
            vy: rand(-30, 15),
            r: rand(24, 55),
            grow: rand(30, 80),
            maxLife: rand(1.8, 3.5),
            life: 0,
          });
        }
        if (skirt > 0.1 && Math.random() < 0.4) {
          spawn({
            kind: 4,
            x: rand(-20, 20),
            y: 0,
            vx: (Math.random() < 0.5 ? -1 : 1) * rand(40, 120),
            vy: -rand(2, 20),
            r: rand(28, 60),
            grow: rand(40, 100),
            maxLife: rand(1.2, 2.5),
            life: 0,
          });
        }
      }

      // Physics + draw back-to-front by kind order
      const drawOrder = [4, 3, 1, 2, 0, 5];
      for (const kind of drawOrder) {
        for (const s of smokes) {
          if (s.kind !== kind) continue;
          s.life += dt;
          if (s.life < 0) continue;
          if (s.life > s.maxLife) continue;

          const lifeU = s.life / s.maxLife;
          const n = noise(s.x + s.seed, s.y, elapsed) * s.turb;

          // Kind-specific motion
          if (kind === 0) {
            // Fireball rises then cools into stem
            s.vy -= 30 * dt;
            s.vx += n * 25 * dt;
          } else if (kind === 1) {
            s.vy -= 18 * dt;
            s.x += n * 12 * dt;
            // Converge toward stem axis slightly
            s.vx += -s.x * 0.35 * dt;
          } else if (kind === 2 || kind === 3) {
            // Cap cauliflower — outward bloom then slow
            const outward = (1 - lifeU) * capBloom;
            s.vx *= 0.992;
            s.vy = s.vy * 0.995 - 4 * dt;
            s.x += n * 18 * dt * (0.5 + outward);
          } else if (kind === 4) {
            s.vy += 8 * dt; // settle
            s.vx *= 0.985;
            s.y += Math.abs(n) * 4 * dt;
          } else {
            s.vy += 25 * dt; // embers fall after rise
            s.vx += n * 30 * dt;
          }

          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.spin += s.spinV * dt;
          const radius = s.r + s.grow * Math.min(1, lifeU * 1.4);

          // World position
          let wx = baseX;
          let wy = baseY;
          let appear = 1;
          if (kind === 0) {
            appear = fireball;
            wx = baseX + s.x * (0.6 + fireball * 0.5);
            wy = baseY - 20 * fireball + s.y * (0.5 + fireball * 0.6);
          } else if (kind === 1) {
            appear = stemRise;
            const rise = Math.min(1, Math.max(0, -s.y / (h * 0.4)));
            wx = baseX + s.x * (0.8 + rise * 0.4);
            wy = baseY + s.y * stemRise;
            if (wy < stemTop - 10) wy = stemTop + (wy - stemTop) * 0.3;
          } else if (kind === 2 || kind === 3) {
            appear = capBloom;
            wx = baseX + s.x * (0.7 + capBloom * 0.9);
            wy = capCy + s.y * (0.5 + capBloom * 0.7);
          } else if (kind === 4) {
            appear = skirt;
            wx = baseX + s.x * (0.9 + skirt * 1.4);
            wy = baseY + 6 + s.y * 0.4;
          } else {
            appear = Math.min(1, Math.max(0, (elapsed - 0.4) / 0.8));
            wx = baseX + s.x;
            wy = baseY + s.y;
          }

          if (appear < 0.02) continue;

          const alphaLife =
            lifeU < 0.12
              ? lifeU / 0.12
              : lifeU > 0.65
                ? Math.max(0, 1 - (lifeU - 0.65) / 0.35)
                : 1;
          let alpha = alphaLife * appear * fadeOut;
          // Cap ash underside denser; fireball additive hot
          if (kind === 3) alpha *= 0.85 + ashSettle * 0.2;
          if (kind === 0) alpha *= 0.9;
          if (kind === 5) alpha *= 0.95;

          const spr =
            kind === 0
              ? sprites[lifeU < 0.35 ? 0 : 1]
              : kind === 1
                ? sprites[lifeU < 0.4 ? 1 : 2]
                : kind === 2
                  ? sprites[lifeU < 0.45 ? 1 : 2]
                  : kind === 3
                    ? sprites[3]
                    : kind === 4
                      ? sprites[4]
                      : sprites[5];

          bloomCtx.save();
          bloomCtx.translate(wx, wy);
          bloomCtx.rotate(s.spin * 0.15);
          if (kind === 0 || kind === 5) {
            bloomCtx.globalCompositeOperation = 'screen';
            bloomCtx.globalAlpha = alpha * (kind === 0 ? 0.85 : 0.9);
          } else if (kind === 3) {
            bloomCtx.globalCompositeOperation = 'source-over';
            bloomCtx.globalAlpha = alpha * 0.75;
          } else {
            bloomCtx.globalCompositeOperation = 'source-over';
            bloomCtx.globalAlpha = alpha * (kind === 2 ? 0.55 : 0.5);
          }
          const rw = radius * (kind === 4 ? 2.2 : kind === 1 ? 1.1 : 1.35);
          const rh = radius * (kind === 4 ? 0.55 : kind === 1 ? 1.35 : 1.05);
          bloomCtx.drawImage(spr, -rw, -rh, rw * 2, rh * 2);
          bloomCtx.restore();
        }
      }

      // Bright fireball core (late additive lens)
      if (fireball > 0.05 && elapsed < 2.2) {
        const coreR = 18 + 55 * fireball * (1 - Math.max(0, elapsed - 1.2) / 1.0);
        const coreY = baseY - h * 0.08 * fireball - h * 0.2 * stemRise * 0.35;
        bloomCtx.globalCompositeOperation = 'screen';
        const core = bloomCtx.createRadialGradient(baseX, coreY, 0, baseX, coreY, coreR * 3);
        const hot = Math.max(0, 1 - elapsed / 1.6);
        core.addColorStop(0, `rgba(255,255,255,${0.95 * hot})`);
        core.addColorStop(0.2, `rgba(255,240,180,${0.75 * hot})`);
        core.addColorStop(0.45, `rgba(255,140,40,${0.45 * hot})`);
        core.addColorStop(1, 'rgba(80,20,0,0)');
        bloomCtx.fillStyle = core;
        bloomCtx.beginPath();
        bloomCtx.arc(baseX, coreY, coreR * 3, 0, Math.PI * 2);
        bloomCtx.fill();
        bloomCtx.globalCompositeOperation = 'source-over';
      }

      // Shock rings (soft photographic, not cartoon strokes)
      if (elapsed < 2.5) {
        for (let i = 0; i < 3; i++) {
          const age = elapsed - i * 0.18;
          if (age < 0 || age > 2.2) continue;
          const r = 20 + age * age * 280;
          const a = Math.max(0, 0.35 - age * 0.16) * fadeOut;
          bloomCtx.strokeStyle = `rgba(255,220,160,${a})`;
          bloomCtx.lineWidth = 2.5 - i * 0.5;
          bloomCtx.beginPath();
          bloomCtx.ellipse(baseX, baseY, r, r * 0.28, 0, 0, Math.PI * 2);
          bloomCtx.stroke();
        }
      }

      // Composite bloom canvas → main with lens effects
      ctx.clearRect(0, 0, w, h);

      // Chromatic aberration on flash
      const ca = flash * 4.5;
      if (ca > 0.3) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.45 * flash;
        ctx.drawImage(bloom, -ca, 0, w, h);
        ctx.globalAlpha = 0.35 * flash;
        ctx.drawImage(bloom, ca, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(bloom, 0, 0, w, h);

      // Soft bloom pass (cheap downsample)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28 * Math.max(flash, fireball * 0.5) * fadeOut;
      ctx.filter = 'blur(12px)';
      ctx.drawImage(bloom, 0, 0, w, h);
      ctx.filter = 'none';
      ctx.restore();

      // Heavy vignette
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        h * 0.15,
        w * 0.5,
        h * 0.5,
        h * 0.85,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(0.55, `rgba(0,0,0,${0.25 * fadeOut})`);
      vig.addColorStop(1, `rgba(0,0,0,${0.88 * fadeOut})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Film grain
      ctx.save();
      ctx.globalAlpha = 0.12 * fadeOut;
      ctx.globalCompositeOperation = 'overlay';
      const gx = ((elapsed * 37) % 20) - 10;
      const gy = ((elapsed * 53) % 20) - 10;
      ctx.drawImage(grain, gx, gy, w + 40, h + 40);
      ctx.restore();

      // Heat distortion shimmer (horizontal wobble bands near stem)
      if (elapsed > 0.3 && elapsed < 4.0) {
        const bands = 14;
        const bandH = Math.floor(h / bands);
        ctx.save();
        ctx.globalAlpha = 0.35 * fadeOut * (1 - ashSettle * 0.7);
        for (let i = 0; i < bands; i++) {
          const sy = i * bandH;
          const dx = Math.sin(elapsed * 9 + i * 0.7) * (1.5 + flash * 3);
          ctx.drawImage(
            canvas,
            0,
            sy * dpr,
            w * dpr,
            bandH * dpr,
            dx,
            sy,
            w,
            bandH,
          );
        }
        ctx.restore();
      }

      // White-out flash overlay first frames
      if (flash > 0.4) {
        ctx.fillStyle = `rgba(255,255,248,${(flash - 0.4) * 1.2})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (elapsed < DURATION_MS / 1000 + 0.15) {
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
      className="nuke-overlay nuke-overlay-v3"
      data-testid="mushroom-cloud"
      role="presentation"
      aria-hidden
    >
      <canvas ref={canvasRef} className="nuke-canvas" />
      <div className="nuke-skull-wrap" data-testid="nuke-skull">
        <img
          className="nuke-skull"
          src="/assets/vfx/skull-crossbones.png?v=2"
          alt=""
          draggable={false}
        />
      </div>
      <p className="nuke-legend">The gadget answers</p>
    </div>
  );
}
