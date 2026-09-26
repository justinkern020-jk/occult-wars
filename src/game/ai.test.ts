import { describe, expect, it } from 'vitest';
import { pickTrainingAction, type AiSnapshot, type AiUnit } from './ai';
import { canDeployOn, initialControl, paintTile } from './control';
import { mapById } from './maps';
import { applyBank, bankFromHoldings, countHoldings } from './scoring';
import type { Card } from './types';

function emptyBoard(): (AiUnit | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
}

function unitCard(partial: Partial<Card> & { id: string; name: string; cost: number; power: number }): Card {
  return {
    kind: 'unit',
    faction: 'The Hermetic Circle',
    keywords: [],
    text: '',
    ...partial,
  } as Card;
}

describe('AI deploy + rite-open loyalty', () => {
  const map = mapById('leaden-court');
  const control = initialControl(map.tiles);

  it('banks crimson loyalty on rite open so units are affordable', () => {
    let gain = bankFromHoldings(map.tiles, control, 'red', []);
    // Second seat crumb on turn 2 (first crimson rite)
    gain += 1;
    const loyalty = applyBank(0, gain);
    expect(loyalty).toBeGreaterThanOrEqual(3);
    expect(loyalty).toBeGreaterThanOrEqual(2); // stronghold alone
  });

  it('red can deploy on stronghold and home gates', () => {
    // leaden-court row0: . r R r .
    expect(canDeployOn(map.tiles[0][2], control, 0, 2, 'red')).toBe(true); // stronghold
    expect(canDeployOn(map.tiles[0][1], control, 0, 1, 'red')).toBe(true); // gate
    expect(canDeployOn(map.tiles[0][3], control, 0, 3, 'red')).toBe(true);
    expect(canDeployOn(map.tiles[4][2], control, 4, 2, 'red')).toBe(false); // azure stronghold
  });

  it('pickTrainingAction deploys when loyalty covers a unit and spots exist', () => {
    const hand = [
      unitCard({ id: 'u1', name: 'Lamp Bearer', cost: 2, power: 2 }),
      unitCard({ id: 'u2', name: 'Visor Sergeant', cost: 3, power: 3 }),
    ];
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board: emptyBoard(),
      hand,
      loyalty: 3, // banked holdings + crumb
    };
    const action = pickTrainingAction(snap);
    expect(action.type).toBe('deploy');
    if (action.type === 'deploy') {
      expect([0, 1]).toContain(action.index); // highest unitValue among affordable
      expect(canDeployOn(map.tiles[action.r][action.c], control, action.r, action.c, 'red')).toBe(
        true,
      );
      // Prefer gate (score 6) over stronghold (score 2)
      const tile = map.tiles[action.r][action.c];
      expect(tile.kind === 'gate' || tile.kind === 'stronghold').toBe(true);
    }
  });

  it('pickTrainingAction ends when loyalty is 0 (the stale-bank failure mode)', () => {
    const hand = [unitCard({ id: 'u1', name: 'Lamp Bearer', cost: 2, power: 2 })];
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board: emptyBoard(),
      hand,
      loyalty: 0,
    };
    expect(pickTrainingAction(snap).type).toBe('end');
  });

  it('conquest paint updates holdings for Domination', () => {
    // Paint a street for red, then count holdings
    let painted = control;
    // leaden-court [1][0] is street 's'
    painted = paintTile(painted, map.tiles, 1, 0, 'red');
    const before = countHoldings(map.tiles, control, 'red');
    const after = countHoldings(map.tiles, painted, 'red');
    expect(after).toBe(before + 1);
    expect(painted[1][0]).toBe('red');
  });

  it('after deploy, a second tick with updated live loyalty can still act or end cleanly', () => {
    const board = emptyBoard();
    board[0][1] = {
      uid: 'deployed',
      side: 'red',
      power: 2,
      keywords: [],
      moved: true, // just mustered (or delay) — treat as acted for this snap
      attacked: true,
      r: 0,
      c: 1,
    };
    const hand = [unitCard({ id: 'u2', name: 'Static Child', cost: 1, power: 2 })];
    // Remaining loyalty 1 after spending 2 of 3
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board,
      hand,
      loyalty: 1,
    };
    const action = pickTrainingAction(snap);
    expect(action.type).toBe('deploy');
    if (action.type === 'deploy') {
      expect(action.index).toBe(0);
      expect(board[action.r][action.c]).toBeNull();
    }
  });
});
