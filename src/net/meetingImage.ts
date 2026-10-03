/**
 * Shrink an image in the browser before it goes to the meeting: at most
 * MAX_SIDE px on the long side, re-encoded (WebP, else JPEG) under
 * TARGET_BYTES. Re-encoding also drops EXIF (camera, location). A small GIF
 * is sent as-is so it keeps its animation.
 */
import type { MeetingUpload } from './meeting';

export const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_SIDE = 1024;
export const TARGET_BYTES = 300_000;
export const RAW_MAX = 15_000_000;

export class ImageRefused extends Error {}

/** The size to draw at: long side at most `max`, never enlarged. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageRefused('That image could not be read.'));
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

export async function prepareImage(file: Blob): Promise<MeetingUpload> {
  if (!ACCEPT.includes(file.type)) throw new ImageRefused('Only PNG, JPEG, WebP or GIF images.');
  if (file.size > RAW_MAX) throw new ImageRefused('That image is far too large.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    if (file.type === 'image/gif' && file.size <= TARGET_BYTES && Math.max(nw, nh) <= MAX_SIDE) {
      const dataUrl = await readAsDataUrl(file);
      return { data: dataUrl.split(',')[1]!, w: nw, h: nh, type: 'image/gif', bytes: file.size, preview: dataUrl };
    }
    let side = MAX_SIDE;
    for (let pass = 0; pass < 4; pass++) {
      const { w, h } = fitWithin(nw, nh, side);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageRefused('This browser cannot shrink images.');
      ctx.fillStyle = '#100c09'; // transparent PNGs become the board's dark, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.58, 0.46]) {
        let out = await toBlob(canvas, 'image/webp', q);
        if (!out || out.type !== 'image/webp') out = await toBlob(canvas, 'image/jpeg', q);
        if (out && out.size <= TARGET_BYTES) {
          const dataUrl = await readAsDataUrl(out);
          return { data: dataUrl.split(',')[1]!, w, h, type: out.type, bytes: out.size, preview: dataUrl };
        }
      }
      side = Math.round(side * 0.75);
    }
    throw new ImageRefused('That image would not shrink small enough.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
