import { describe, expect, it } from 'vitest';
import { createOnceGate } from './onceGate';

describe('cryptid sighting gate', () => {
  it('announces each cryptid once per match: later rites, musters and effects stay silent', () => {
    const g = createOnceGate();
    expect(g.first('Grassman')).toBe(true); // the sighting
    for (let rite = 0; rite < 6; rite++) expect(g.first('Grassman')).toBe(false); // every later rite / effect pass
    expect(g.first('Mothman')).toBe(true); // a different cryptid is its own sighting
    g.mark('Loveland Frog');
    expect(g.first('Loveland Frog')).toBe(false);
    g.reset(); // next match
    expect(g.first('Grassman')).toBe(true);
  });
});
