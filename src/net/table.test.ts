import { describe, expect, it } from 'vitest';
import { countryName, parseTableView } from './table';

describe('parseTableView', () => {
  it('reads a live table answer', () => {
    const v = parseTableView({
      ok: true,
      playing: 3,
      you: 'US',
      others: ['CA', 7, 'GB'],
      challenge: { room: 'ABCD', mine: false, left: 41_000 },
      checkins: [
        { country: 'US', n: 2 },
        { country: 'CA', n: 0 },
        { country: 5, n: 1 },
      ],
      store: 'redis',
      meet: 12,
    });
    expect(v).toEqual({
      playing: 3,
      you: 'US',
      others: ['CA', 'GB'],
      challenge: { room: 'ABCD', mine: false, left: 41_000 },
      checkins: [{ country: 'US', n: 2 }],
      store: 'redis',
      meet: 12,
    });
  });

  it('drops a malformed challenge and refuses a shut answer', () => {
    expect(parseTableView({ ok: true, playing: 1, challenge: { room: 'abc' } })?.challenge).toBeNull();
    expect(parseTableView({ ok: false, shut: true })).toBeNull();
    expect(parseTableView(null)).toBeNull();
  });
});

describe('countryName', () => {
  it('names a region code and tolerates nothing', () => {
    expect(countryName('US')).toMatch(/United States/);
    expect(countryName(null)).toBe('Unknown');
  });
});
