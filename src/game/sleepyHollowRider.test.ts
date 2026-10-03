import { describe, expect, it } from 'vitest';
import { cardById } from '../data/catalog';
import type { EffectCtx, EffectUnit } from './effects';
import { mapById, type Side } from './maps';
import { resolveStrike } from './rules';

const tiles = mapById('leaden-court').tiles;

function ctxWith(units: Array<[EffectUnit, number, number]>): EffectCtx {
  const ctx: EffectCtx = {
    side: 'blue',
    loyalty: { blue: 5, red: 5 },
    domination: { blue: 0, red: 0 },
    hand: { blue: [], red: [] },
    deck: { blue: [], red: [] },
    discard: { blue: [], red: [] },
    units: {},
    board: Array.from({ length: 5 }, () => Array(5).fill(null)),
    control: Array.from({ length: 5 }, () => Array(5).fill(null)),
    log: [],
    tiles,
  };
  for (const [u, r, c] of units) {
    ctx.units[u.uid] = u;
    ctx.board[r][c] = u.uid;
  }
  return ctx;
}

function fromCard(id: string, uid: string, side: Side, power?: number): EffectUnit {
  const card = cardById(id)!;
  const p = power ?? card.power ?? 1;
  return {
    uid,
    cardId: id,
    name: card.name,
    side,
    power: p,
    maxPower: p,
    loyalty: card.cost,
    keywords: [...card.keywords],
  };
}

describe('Sleepy Hollow Rider (blooded)', () => {
  const card = cardById('sleepy_hollow_rider')!;

  it('card text promises +2 power after it strikes and survives', () => {
    expect(card.keywords).toContain('blooded');
    expect(card.text).toMatch(/After this unit strikes and survives, it gains \+2 power/);
  });

  it('trades with a P3 foe, survives at 1, then gains +2 power (Power is now 6)', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'blue');
    const foe = fromCard('tommy_wight', 'foe', 'red'); // P3, plain
    const ctx = ctxWith([
      [rider, 2, 2],
      [foe, 1, 2],
    ]);
    const out = resolveStrike(ctx, tiles, 'rider', 1, 2);
    expect(out.error).toBeNull();
    const after = ctx.units.rider;
    expect(after).toBeDefined();
    expect(after.power).toBe(6);
    expect(after.maxPower).toBe(6);
    expect(ctx.log.join(' ')).toMatch(/still standing and gains \+2 power\. Power is now 6/);
    expect(ctx.units.foe).toBeUndefined();
  });

  it('survives a strike into a Toughness wall and still gains +2', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'blue');
    const wall = fromCard('guided_confessor', 'wall', 'red'); // P3 Tough
    wall.power = 6;
    wall.maxPower = 6;
    rider.tough = true;
    // Boosted rider P6 (Toughness) vs P6 Tough wall: each deals 6-1=5,
    // both survive at 1; the rider then gains +2.
    rider.power = 6;
    rider.maxPower = 6;
    const ctx = ctxWith([
      [rider, 2, 2],
      [wall, 1, 2],
    ]);
    resolveStrike(ctx, tiles, 'rider', 1, 2);
    expect(ctx.units.wall.power).toBe(1);
    expect(ctx.units.rider.power).toBe(8);
    expect(ctx.board[2][2]).toBe('rider');
  });

  it('kills its target, advances, and gains +2 power', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'blue');
    const foe = fromCard('alley_inquiry', 'foe', 'red'); // P1
    const ctx = ctxWith([
      [rider, 2, 2],
      [foe, 1, 2],
    ]);
    resolveStrike(ctx, tiles, 'rider', 1, 2);
    expect(ctx.units.foe).toBeUndefined();
    expect(ctx.board[1][2]).toBe('rider');
    expect(ctx.units.rider.power).toBe(6);
  });

  it('gains +2 when it strikes back as a defender and survives', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'red');
    const atk = fromCard('alley_inquiry', 'atk', 'blue'); // P1 attacker dies
    const ctx = ctxWith([
      [rider, 1, 2],
      [atk, 2, 2],
    ]);
    resolveStrike(ctx, tiles, 'atk', 1, 2);
    expect(ctx.units.atk).toBeUndefined();
    expect(ctx.units.rider.power).toBe(6);
  });

  it('does not grow when shot from range (it did not strike)', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'red');
    const gun = fromCard('wire_saint', 'gun', 'blue'); // Ranged P3
    const ctx = ctxWith([
      [rider, 0, 2],
      [gun, 2, 2],
    ]);
    const out = resolveStrike(ctx, tiles, 'gun', 0, 2);
    expect(out.ranged).toBe(true);
    expect(ctx.units.rider.power).toBe(1);
  });

  it('does not grow when it dies in the strike', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'blue');
    const foe = fromCard('the_lead_bear', 'foe', 'red'); // P6 Tough
    const ctx = ctxWith([
      [rider, 2, 2],
      [foe, 1, 2],
    ]);
    resolveStrike(ctx, tiles, 'rider', 1, 2);
    expect(ctx.units.rider).toBeUndefined();
  });

  it('keeps growing across repeated strikes', () => {
    const rider = fromCard('sleepy_hollow_rider', 'rider', 'blue');
    const a = fromCard('alley_inquiry', 'a', 'red');
    const ctx = ctxWith([
      [rider, 2, 2],
      [a, 1, 2],
    ]);
    resolveStrike(ctx, tiles, 'rider', 1, 2);
    expect(ctx.units.rider.power).toBe(6);
    // Next rite: refresh and strike again
    const r = ctx.units.rider;
    r.moved = false;
    r.attacked = false;
    const b = fromCard('alley_inquiry', 'b', 'red');
    ctx.units.b = b;
    ctx.board[0][2] = null;
    ctx.board[1][1] = 'b';
    resolveStrike(ctx, tiles, 'rider', 1, 1);
    expect(ctx.units.rider.power).toBe(8);
  });
});
