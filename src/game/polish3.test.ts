import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOADING_LORE } from '../data/loadingLore';
import { HAPTIC_PATTERNS } from './haptics';

describe('loading lore', () => {
  it('has about sixty attributed lines, none repeated', () => {
    expect(LOADING_LORE.length).toBeGreaterThanOrEqual(55);
    const texts = new Set(LOADING_LORE.map((l) => l.text));
    expect(texts.size).toBe(LOADING_LORE.length);
    for (const l of LOADING_LORE) {
      expect(l.by.trim().length, l.text).toBeGreaterThan(3);
      expect(l.text.length, l.text).toBeLessThan(240);
    }
  });
  it('never names the code-only Kerns', () => {
    for (const l of LOADING_LORE) expect(`${l.text} ${l.by}`).not.toMatch(/\bKern\b/);
  });
  describe('rotation', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      });
      vi.resetModules();
    });
    it('shows every line once before any repeats', async () => {
      const { nextLoreLine } = await import('./loadingLore');
      const seen = new Set<string>();
      for (let i = 0; i < LOADING_LORE.length; i++) seen.add(nextLoreLine().text);
      expect(seen.size).toBe(LOADING_LORE.length);
    });
  });
});

describe('haptics', () => {
  it('has the five patterns, small enough for a phone', () => {
    expect(Object.keys(HAPTIC_PATTERNS).sort()).toEqual(['capture', 'death', 'defeat', 'tick', 'victory']);
    expect(HAPTIC_PATTERNS.tick[0]).toBeLessThan(HAPTIC_PATTERNS.death[0]!);
    for (const p of Object.values(HAPTIC_PATTERNS)) expect(p.reduce((a, b) => a + b, 0)).toBeLessThan(1000);
  });
});

describe('install as app', () => {
  const root = process.cwd();
  it('ships a manifest with real icons', () => {
    const m = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));
    expect(m.name).toBe('Occult Wars');
    expect(m.display).toBe('standalone');
    for (const icon of m.icons) expect(existsSync(resolve(root, 'public' + icon.src)), icon.src).toBe(true);
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });
  it('service worker: network-first navigations, POSTs untouched, waits for a safe screen', () => {
    const sw = readFileSync(resolve(root, 'scripts/sw.template.js'), 'utf8');
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain('SKIP_WAITING');
    // The worker must never skip waiting on its own (that could swap mid-match).
    expect(sw.match(/skipWaiting\(\)/g)?.length).toBe(1);
    for (const ph of ['__OW_SW_BUILD__', '__OW_SW_VERSION__', '__OW_SW_SHELL__', '__OW_SW_CORE__']) expect(sw).toContain(ph);
  });
  it('vercel never caches sw.js', () => {
    const v = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
    const h = v.headers.find((x: { source: string }) => x.source === '/sw.js');
    expect(JSON.stringify(h)).toMatch(/no-cache/);
  });
});
