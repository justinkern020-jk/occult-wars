/**
 * Match highlight: a shareable PNG of the final board, drawn on a canvas.
 * The map, the held circles and every unit coin, with a caption ("Victory by
 * The Galvanic Hound, Rite 7"), the era, the leader and the Occult Wars
 * wordmark. Downloads on desktop; the native share sheet on touch devices.
 */
import { useState } from 'react';
import type { Card } from '../game/types';
import { cardImageUrl } from '../game/maps';
import { WEATHER_LABEL, currentWeather } from './WeatherLayer';

type Unit = { cardId: string; name: string; side: 'blue' | 'red'; power: number } | null;

export type HighlightInput = {
  grid: HTMLElement | null;
  board: readonly (readonly Unit[])[];
  control: readonly (readonly ('blue' | 'red' | null)[])[];
  mapId: string;
  mapName: string;
  era: 'first' | 'second' | 'old';
  turn: number;
  /** The winner's side and leader. */
  winner: 'blue' | 'red';
  winnerLeader: Card | null;
  winnerFaction: string;
  /** This hand won (two chairs at one screen count as a victory). */
  won: boolean;
  kind: string;
  domination: { blue: number; red: number };
  player?: string;
  title?: string;
};

const ERA: Record<HighlightInput['era'], string> = {
  first: 'The First Hour',
  second: 'The Second Hour',
  old: 'The Sealed Century',
};
const SIDE = { blue: '#4f8fd6', red: '#c4473f' } as const;

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export function highlightCaption(i: Pick<HighlightInput, 'won' | 'winnerLeader' | 'winnerFaction' | 'turn'>): string {
  const who = i.winnerLeader?.name ?? i.winnerFaction;
  return i.won ? `Victory by ${who}, Rite ${i.turn}` : `Fallen to ${who}, Rite ${i.turn}`;
}

export async function renderHighlight(i: HighlightInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  try {
    await document.fonts?.ready;
  } catch {
    /* fonts optional */
  }
  // Ground: deep umber with a lamp-lit centre.
  const bg = ctx.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H * 0.45, H * 0.75);
  bg.addColorStop(0, '#2a1f14');
  bg.addColorStop(1, '#070504');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Brass rule frame.
  ctx.strokeStyle = '#c6a15b';
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = '#c6a15b55';
  ctx.lineWidth = 1;
  ctx.strokeRect(38, 38, W - 76, H - 76);

  // Wordmark + era.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8cf8e';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 12;
  ctx.font = "700 64px 'Cinzel Decorative', Cinzel, Palatino, serif";
  ctx.fillText('Occult Wars', W / 2, 118);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#7fd9a8';
  ctx.font = "600 22px Cinzel, Palatino, serif";
  ctx.fillText(`${ERA[i.era].toUpperCase()}  ·  ${i.mapName.toUpperCase()}`, W / 2, 156);

  // The board.
  const BX = 90;
  const BY = 190;
  const BS = W - 180;
  const map = await loadImg(`/assets/maps/${i.mapId}.jpg`);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect?.(BX, BY, BS, BS, 14);
  if (!ctx.roundRect) ctx.rect(BX, BY, BS, BS);
  ctx.clip();
  ctx.fillStyle = '#100c09';
  ctx.fillRect(BX, BY, BS, BS);
  if (map) cover(ctx, map, BX, BY, BS, BS);
  ctx.fillStyle = '#0000004d';
  ctx.fillRect(BX, BY, BS, BS);

  const wrap = i.grid?.parentElement ?? i.grid;
  const wr = wrap?.getBoundingClientRect();
  const cells = i.grid ? Array.from(i.grid.children) as HTMLElement[] : [];
  const rows = i.board.length;
  const cols = rows ? i.board[0].length : 0;
  const place = (r: number, c: number) => {
    const el = cells[r * cols + c];
    if (el && wr && wr.width > 0) {
      const b = el.getBoundingClientRect();
      const s = BS / wr.width;
      return { x: BX + (b.left - wr.left + b.width / 2) * s, y: BY + (b.top - wr.top + b.height / 2) * s, d: Math.min(b.width, b.height) * s };
    }
    const cell = BS / Math.max(rows, cols, 1);
    return { x: BX + (c + 0.5) * cell, y: BY + (r + 0.5) * cell, d: cell * 0.9 };
  };
  const arts = new Map<string, HTMLImageElement | null>();
  for (const row of i.board) for (const u of row) if (u && !arts.has(u.name)) arts.set(u.name, null);
  await Promise.all([...arts.keys()].map(async (n) => arts.set(n, await loadImg(cardImageUrl(n)))));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const own = i.control[r]?.[c];
      const u = i.board[r][c];
      const { x, y, d } = place(r, c);
      const rad = d * 0.42;
      if (own) {
        ctx.beginPath();
        ctx.arc(x, y, rad * 1.08, 0, Math.PI * 2);
        ctx.fillStyle = own === 'blue' ? '#4f8fd633' : '#c4473f33';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = own === 'blue' ? '#4f8fd6aa' : '#c4473faa';
        ctx.stroke();
      }
      if (!u) continue;
      const art = arts.get(u.name);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      if (art) cover(ctx, art, x - rad, y - rad * 1.1, rad * 2, rad * 2.4);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(4, rad * 0.12);
      ctx.strokeStyle = SIDE[u.side];
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8cf8e';
      ctx.stroke();
      // Power pip.
      const px = x + rad * 0.72;
      const py = y + rad * 0.72;
      ctx.beginPath();
      ctx.arc(px, py, rad * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#120d09';
      ctx.fill();
      ctx.strokeStyle = '#c6a15b';
      ctx.stroke();
      ctx.fillStyle = '#f3ead7';
      ctx.font = `700 ${Math.round(rad * 0.36)}px Cinzel, serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(u.power), px, py + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }
  const wx = currentWeather();
  if (wx === 'fog' || wx === 'rain' || wx === 'moonlight' || wx === 'dusk' || wx === 'snow') {
    const tint: Record<string, string> = {
      fog: '#c9d3cf22',
      rain: '#1c2a3a40',
      moonlight: '#cfe0ff1a',
      dusk: '#b8622e22',
      snow: '#dfe8f01a',
    };
    ctx.fillStyle = tint[wx];
    ctx.fillRect(BX, BY, BS, BS);
  }
  ctx.restore();
  ctx.strokeStyle = '#c6a15b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect?.(BX, BY, BS, BS, 14);
  if (!ctx.roundRect) ctx.rect(BX, BY, BS, BS);
  ctx.stroke();

  // Caption block.
  const capY = BY + BS + 70;
  const portrait = i.winnerLeader ? await loadImg(cardImageUrl(i.winnerLeader.name)) : null;
  const PR = 62;
  const px = 150;
  if (portrait) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, capY + 10, PR, 0, Math.PI * 2);
    ctx.clip();
    cover(ctx, portrait, px - PR, capY + 10 - PR * 1.2, PR * 2, PR * 2.6);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px, capY + 10, PR, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2fbf7a';
    ctx.shadowColor = '#2fbf7a';
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const tx = portrait ? px + PR + 30 : W / 2;
  ctx.textAlign = portrait ? 'left' : 'center';
  ctx.fillStyle = i.won ? '#f3ead7' : '#e3b3a8';
  ctx.font = "700 40px Cinzel, Palatino, serif";
  const cap = highlightCaption(i);
  let size = 40;
  while (ctx.measureText(cap).width > W - tx - 70 && size > 24) {
    size -= 2;
    ctx.font = `700 ${size}px Cinzel, Palatino, serif`;
  }
  ctx.fillText(cap, tx, capY);
  ctx.fillStyle = '#c6a15b';
  ctx.font = "italic 24px 'Libre Baskerville', Georgia, serif";
  const how = i.kind === 'dominance' ? 'by Domination' : i.kind === 'stronghold' ? 'by the stronghold' : 'by a yielded circle';
  ctx.fillText(`${i.winnerFaction} · ${how}`, tx, capY + 40);
  ctx.fillStyle = '#9b8a6c';
  ctx.font = "20px 'Libre Baskerville', Georgia, serif";
  const bits = [
    `Azure ${i.domination.blue} · Crimson ${i.domination.red}`,
    wx ? WEATHER_LABEL[wx] : null,
    i.player ? `${i.player}${i.title ? ` · ${i.title}` : ''}` : null,
  ].filter(Boolean);
  ctx.fillText(bits.join('   ·   '), tx, capY + 76);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6f604a';
  ctx.font = "600 16px Cinzel, serif";
  ctx.fillText('OCCULT-WARS.VERCEL.APP', W / 2, H - 52);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('No image'))), 'image/png'));
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function HighlightButton({ get }: { get: () => HighlightInput }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  return (
    <>
      <button
        type="button"
        className="brass-btn"
        data-testid="save-highlight"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote('');
          try {
            const input = get();
            const blob = await renderHighlight(input);
            const name = `occult-wars-${slug(highlightCaption(input))}.png`;
            const file = new File([blob], name, { type: 'image/png' });
            const touch = window.matchMedia?.('(pointer: coarse)').matches;
            const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
            if (touch && nav.share && nav.canShare?.({ files: [file] })) {
              try {
                await nav.share({ files: [file], title: 'Occult Wars', text: highlightCaption(input) });
                return;
              } catch (e) {
                if ((e as Error)?.name === 'AbortError') return;
              }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 4000);
            setNote('Highlight saved.');
          } catch {
            setNote('The plate would not print.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Printing…' : 'Save highlight'}
      </button>
      {note && <span className="highlight-note">{note}</span>}
    </>
  );
}
