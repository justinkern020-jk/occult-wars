import { useEffect, useRef } from 'react';

type Props = {
  active: boolean;
  /** Total visible life including fade (ms). Default 6000. */
  durationMs?: number;
  onDone?: () => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  glow: number;
  twinkle: number;
  phase: number;
};

/**
 * Radioactive green ash/dust drifting over the battlefield after the mushroom
 * cloud settles — soft glow, gentle wind, not confetti.
 */
export function FalloutRain({
  active,
  durationMs = 6000,
  onDone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => window.clearTimeout(t);
  }, [active, durationMs]);

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

    // Soft green glow sprite
    const SPR = 48;
    const sprite = document.createElement('canvas');
    sprite.width = SPR;
    sprite.height = SPR;
    {
      const g = sprite.getContext('2d')!;
      const grd = g.createRadialGradient(
        SPR / 2,
        SPR / 2,
        0,
        SPR / 2,
        SPR / 2,
        SPR / 2,
      );
      grd.addColorStop(0, 'rgba(210,255,160,1)');
      grd.addColorStop(0.22, 'rgba(140,240,90,0.85)');
      grd.addColorStop(0.5, 'rgba(70,180,40,0.35)');
      grd.addColorStop(0.78, 'rgba(40,100,30,0.1)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, SPR, SPR);
    }

    const particles: Particle[] = [];
    const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

    const spawn = (fromTop: boolean) => {
      particles.push({
        x: rand(-0.05, 1.05) * w,
        y: fromTop ? rand(-40, -4) : rand(-40, h * 0.35),
        vx: rand(-12, 28),
        vy: rand(22, 55),
        r: rand(1.2, 5.5),
        life: 0,
        maxLife: rand(2.2, 5.5),
        glow: rand(0.45, 1),
        twinkle: rand(2.5, 6),
        phase: rand(0, Math.PI * 2),
      });
    };

    // Seed a curtain of dust already in air
    for (let i = 0; i < 90; i++) spawn(false);

    const t0 = performance.now();
    let last = t0;
    const dur = durationMs / 1000;

    const frame = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (elapsed > dur + 0.2) return;

      // Fade envelope: ramp in, hold, soft out
      let envelope = 1;
      if (elapsed < 0.35) envelope = elapsed / 0.35;
      else if (elapsed > dur - 1.4) envelope = Math.max(0, (dur - elapsed) / 1.4);

      // Spawn rate eases off late
      const spawnChance = elapsed < dur - 1.6 ? 0.55 : 0.12;
      if (Math.random() < spawnChance) {
        spawn(true);
        if (Math.random() < 0.4) spawn(true);
      }

      ctx.clearRect(0, 0, w, h);

      // Subtle green atmospheric haze
      const haze = ctx.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, `rgba(40,90,30,${0.08 * envelope})`);
      haze.addColorStop(0.55, `rgba(30,70,20,${0.04 * envelope})`);
      haze.addColorStop(1, `rgba(20,40,10,${0.1 * envelope})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);

      const wind = Math.sin(elapsed * 0.55) * 18 + 10;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life > p.maxLife || p.y > h + 30) {
          particles.splice(i, 1);
          continue;
        }
        const lifeU = p.life / p.maxLife;
        p.vx += (wind - p.vx) * 0.35 * dt;
        p.vx += Math.sin(elapsed * p.twinkle + p.phase) * 8 * dt;
        p.vy += 4 * dt; // gentle settle accel
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const alphaLife =
          lifeU < 0.1
            ? lifeU / 0.1
            : lifeU > 0.7
              ? Math.max(0, 1 - (lifeU - 0.7) / 0.3)
              : 1;
        const alpha = alphaLife * envelope * p.glow * 0.85;
        if (alpha < 0.02) continue;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = alpha;
        const rw = p.r * (2.8 + Math.sin(elapsed * p.twinkle + p.phase) * 0.4);
        const rh = p.r * (3.4 + Math.cos(elapsed * p.twinkle * 0.7) * 0.5);
        ctx.drawImage(sprite, p.x - rw, p.y - rh, rw * 2, rh * 2);
        // Tiny bright core for dust flecks
        if (p.r < 2.8) {
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = 'rgba(200,255,150,1)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.6, p.r * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [active, durationMs]);

  if (!active) return null;

  return (
    <div
      className="fallout-rain"
      data-testid="fallout-rain"
      role="presentation"
      aria-hidden
    >
      <canvas ref={canvasRef} className="fallout-rain-canvas" />
    </div>
  );
}
