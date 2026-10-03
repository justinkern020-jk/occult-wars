import { describe, expect, it } from 'vitest';
import { normalizeFrame } from './watch';

describe('Portal frames', () => {
  it('draws this build’s frame as sent', () => {
    const f = normalizeFrame({
      map: 'ashen-cross', turn: 4, side: 'red', phase: 'main',
      resources: { blue: 3, red: 2 }, domination: { blue: 5, red: 6 }, hand: { blue: 5, red: 4 }, deck: { blue: 20, red: 21 },
      board: [[null, { uid: 'u1', cardId: 'lion_initiate', name: 'Lion Initiate', side: 'red', power: 4, maxPower: 4, loyalty: 3, keywords: ['glory'] }]],
      control: [[null, 'red']], log: ['a'], over: null,
    })!;
    expect(f.board[0][1]).toMatchObject({ cardId: 'lion_initiate', side: 'red', power: 4, maxPower: 4 });
    expect(f.control[0][1]).toBe('red');
  });
  it('makes an older or partial payload safe', () => {
    const f = normalizeFrame({ board: [[{ id: 'x', card: 'menlo_spirit_wright', owner: 'blue', attack: 2 }, 'junk']], log: 'nope' })!;
    expect(f.board[0][0]).toMatchObject({ uid: 'x', cardId: 'menlo_spirit_wright', side: 'blue', power: 2, maxPower: 2, keywords: [] });
    expect(f.board[0][1]).toBeNull();
    expect(f.log).toEqual([]);
    expect(f.resources).toEqual({ blue: 0, red: 0 });
    expect(normalizeFrame(null)).toBeNull();
  });
});
