/**
 * Codex pages must each say something of their own: no two notes may share
 * a sentence, come close to one another, or fall back on the order's
 * generic tradition text.
 */
import { describe, expect, it } from 'vitest';
import { CARD_LORE, ORDER_LORE, codexBlurb } from './codexLore';
import { CODEX_CARDS, CODEX_EXCLUDED } from '../game/codexUnlock';
import { CARDS } from './catalog';

/** Highest similarity two notes (or two sentences) may reach. */
const MAX_SIMILARITY = 0.85;

const ABBREV = /(?:^|\s)(?:[A-Z]|St|Mr|Mrs|Dr|Jr|Sr|c|cf|tr|vol|no)\.$/;

/** Lower-case, strip accents and punctuation, collapse spaces. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a note into sentences, keeping initials (H. G. Wells) and c. / St. together. */
function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?]['"’”)]?)\s+(?=['"‘“(]?[A-Z0-9])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

function trigrams(s: string): Map<string, number> {
  const g = new Map<string, number>();
  const x = ` ${s} `;
  for (let i = 0; i + 3 <= x.length; i++) {
    const k = x.slice(i, i + 3);
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  return g;
}

function dice(A: Map<string, number>, B: Map<string, number>): number {
  let inter = 0;
  let ta = 0;
  let tb = 0;
  for (const v of A.values()) ta += v;
  for (const v of B.values()) tb += v;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}

/** Dice coefficient over character trigrams of the normalised text (0..1). */
function similarity(a: string, b: string): number {
  return dice(trigrams(normalise(a)), trigrams(normalise(b)));
}

/** Every page shown in the Codex, plus the order headers shown above them. */
const PAGES: [string, string][] = [
  ...CODEX_CARDS.map((c): [string, string] => [c.id, codexBlurb(c)]),
  ...Object.entries(ORDER_LORE).map(([k, v]): [string, string] => [`order:${k}`, v]),
];

describe('codex lore', () => {
  it('the similarity helpers behave', () => {
    expect(sentences('H. G. Wells wrote it in 1898. St. George kills the dragon. c. 1790 it was done.')).toHaveLength(2);
    expect(similarity('The same words.', 'the same, words')).toBe(1);
    expect(similarity('A green lion eats the sun.', 'Edison built Menlo Park.')).toBeLessThan(0.5);
  });

  it('every Codex plate has a note of its own, and the Kerns have none', () => {
    const missing = CODEX_CARDS.filter((c) => !CARD_LORE[c.id]).map((c) => c.id);
    expect(missing).toEqual([]);
    for (const id of CODEX_EXCLUDED) expect(CARD_LORE[id]).toBeUndefined();
    const known = new Set(CARDS.map((c) => c.id));
    expect(Object.keys(CARD_LORE).filter((k) => !known.has(k))).toEqual([]);
  });

  it('no note is the old order boilerplate', () => {
    for (const c of CODEX_CARDS) {
      const text = codexBlurb(c);
      expect(text, c.id).not.toContain('The words on the plate are from');
      expect(text, c.id).not.toBe(ORDER_LORE[c.faction]);
      expect(sentences(text).length, c.id).toBeLessThanOrEqual(3);
    }
  });

  it('no two notes share a sentence', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, text] of PAGES) {
      for (const s of new Set(sentences(text).map(normalise))) {
        const other = seen.get(s);
        if (other && other !== id) clashes.push(`${other} / ${id}: "${s}"`);
        else seen.set(s, id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it(`no two notes, or sentences from different notes, exceed ${MAX_SIMILARITY * 100}% similarity`, () => {
    const close: string[] = [];
    const pages = PAGES.map(([id, text]) => ({ id, text, g: trigrams(normalise(text)) }));
    const sents = PAGES.flatMap(([id, text]) => sentences(text).map((s) => ({ id, s, g: trigrams(normalise(s)) })));
    for (let i = 0; i < pages.length; i++)
      for (let j = i + 1; j < pages.length; j++) {
        const r = dice(pages[i].g, pages[j].g);
        if (r > MAX_SIMILARITY) close.push(`${pages[i].id} / ${pages[j].id}: ${r.toFixed(2)}`);
      }
    for (let i = 0; i < sents.length; i++)
      for (let j = i + 1; j < sents.length; j++) {
        if (sents[i].id === sents[j].id) continue;
        const r = dice(sents[i].g, sents[j].g);
        if (r > MAX_SIMILARITY) close.push(`${sents[i].id} / ${sents[j].id}: ${r.toFixed(2)} "${sents[i].s}"`);
      }
    expect(close).toEqual([]);
  });
});
