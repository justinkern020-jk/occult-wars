import { describe, expect, it } from 'vitest';
import { CARDS, cardById } from '../data/catalog';
import { plainKeyword, plainRules } from './plainRules';

describe('plainRules', () => {
  it('explains Lamp in plain words', () => {
    const k = plainKeyword('crown');
    expect(k.name).toBe('Lamp');
    expect(k.text).toMatch(/next to it.*\+1 Power/);
  });

  it('splits rules from lore and drops bare keyword names', () => {
    const fd = CARDS.find((c) => c.name === 'Fairy Doctor')!;
    const p = plainRules(fd);
    expect(p.rules.some((r) => /bank yields \+1/.test(r))).toBe(true);
    expect(p.rules).not.toContain('Tithe.');
    expect(p.rules).not.toContain('Lamp.');
    expect(p.lore.join(' ')).toMatch(/country doctor/);
    expect(p.keywords.map((k) => k.name)).toEqual(['Tithe', 'Lamp']);
    expect(p.terms.map((t) => t.term)).toContain('Bank');
  });

  it('every plate reads without throwing and keeps all its words', () => {
    for (const c of CARDS) {
      const p = plainRules(c);
      expect(p.basics.length).toBeGreaterThan(0);
      for (const k of p.keywords) expect(k.text.length).toBeGreaterThan(0);
    }
    expect(plainRules(cardById('justin_kern')!).basics).toBeTruthy();
  });
});
