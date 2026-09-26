import { describe, expect, it } from 'vitest';
import { mapById } from './maps';
import { initialControl } from './control';
import {
  DOMINATION_WIN,
  LOYALTY_CAP,
  applyBank,
  bankFromHoldings,
  countHoldings,
  victoryReason,
} from './scoring';

describe('holdings + bank (grok formulas)', () => {
  const map = mapById('ashen-cross');
  const control = initialControl(map.tiles);

  it('counts stronghold as one held circle at start', () => {
    // Azure stronghold + azure gates (home-painted)
    const blue = countHoldings(map.tiles, control, 'blue');
    const red = countHoldings(map.tiles, control, 'red');
    // ashen-cross: .rRr. / .s1s. / 2dsd2 / .s1s. / .bBb.
    // blue: stronghold B + two gates b → 3
    expect(blue).toBe(3);
    expect(red).toBe(3);
  });

  it('banks +2 from own stronghold at rite open', () => {
    const gain = bankFromHoldings(map.tiles, control, 'blue');
    expect(gain).toBe(2);
  });

  it('resource seals add 1 or 2 when controlled; hearth doubles', () => {
    const painted = control.map((row) => [...row]);
    // claim a +1 node at (1,2) glyph 1 and a +2 at (2,0)
    painted[1][2] = 'blue';
    painted[2][0] = 'blue';
    expect(bankFromHoldings(map.tiles, painted, 'blue')).toBe(2 + 1 + 2);
    expect(
      bankFromHoldings(map.tiles, painted, 'blue', [
        { side: 'blue', keywords: ['hearth'], r: 2, c: 0 },
      ]),
    ).toBe(2 + 1 + 4);
  });

  it('loyalty caps at 14', () => {
    expect(applyBank(13, 2)).toBe(LOYALTY_CAP);
    expect(applyBank(6, 2)).toBe(8);
  });

  it('domination win threshold is 60', () => {
    expect(DOMINATION_WIN).toBe(60);
  });

  it('victory reason strings match grok', () => {
    expect(victoryReason('dominance', true)).toBe('Victory by dominance');
    expect(victoryReason('stronghold', true)).toBe(
      'Victory by storming the stronghold',
    );
    expect(victoryReason('yield', false)).toBe('Defeat by yield.');
    expect(victoryReason('stronghold', false)).toBe(
      'Defeat. Your stronghold was stormed.',
    );
  });
});
