import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { allStoryPanels, panelsForStage } from './storyPanels';
import { LEADEN_STAGES, JUSTIN_EPILOGUE, FULCANELLI_WARNING } from './campaign';

describe('campaign story panels', () => {
  it('3 to 5 panels before every stage, captions from the hour', () => {
    LEADEN_STAGES.forEach((s, i) => {
      for (const prev of i === 0 ? [null] : (['hold', 'storm', 'lost'] as const)) {
        const ps = panelsForStage(i, prev);
        expect(ps.length, s.id).toBeGreaterThanOrEqual(3);
        expect(ps.length, s.id).toBeLessThanOrEqual(5);
        for (const p of ps) expect(p.caption.trim().length, p.id).toBeGreaterThan(8);
        // No caption repeats inside one sequence.
        expect(new Set(ps.map((p) => p.caption)).size).toBe(ps.length);
      }
    });
    expect(panelsForStage(1, 'storm')[0]!.caption).toBe(LEADEN_STAGES[0]!.storm);
    expect(panelsForStage(1, 'lost')[0]!.caption).toBe(LEADEN_STAGES[0]!.loss);
  });
  it('every fallback is real art on disk', () => {
    for (const p of allStoryPanels()) expect(existsSync(resolve(process.cwd(), 'public' + p.fallback)), p.fallback).toBe(true);
  });
  it('leaves the ending to the closer (no panel retells the nuke or Fulcanelli)', () => {
    const text = allStoryPanels().map((p) => p.caption).join(' ');
    expect(text).not.toMatch(/Kern|Fulcanelli|Bergier|radiation|gadget/i);
    expect(JUSTIN_EPILOGUE.title).toBe('Justin Kern Answers');
    expect(FULCANELLI_WARNING.attribution).toMatch(/June 1937/);
  });
});
