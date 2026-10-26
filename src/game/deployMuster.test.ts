import { describe, expect, it } from 'vitest';
import { canDeployOn, initialControl, paintTile } from './control';
import { mapById } from './maps';
import { scoredCandidates, type AiSnapshot, type AiUnit } from './ai';
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
    rarity: 'common',
    oath: 0,
    ...partial,
  } as Card;
}

describe('muster never uses painted streets/resources', () => {
  const map = mapById('ashen-cross');

  it('Ashen Cross mid d tiles are gates (doors), not streets', () => {
    // Row 2: 1 d s d 1 — the arms Justin saw as "plain streets" are doors.
    expect(map.tiles[2][1].kind).toBe('gate');
    expect(map.tiles[2][3].kind).toBe('gate');
    expect(map.tiles[2][2].kind).toBe('street');
  });

  it('canDeployOn rejects painted streets and resources next to the stronghold', () => {
    let control = initialControl(map.tiles);
    // Paint every paintable tile for crimson, including streets beside Azure.
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        control = paintTile(control, map.tiles, r, c, 'red');
      }
    }
    // Street at (1,1) and resource at (3,2) near Azure — never muster.
    expect(canDeployOn(map.tiles[1][1], control, 1, 1, 'red')).toBe(false);
    expect(canDeployOn(map.tiles[3][2], control, 3, 2, 'red')).toBe(false);
    expect(canDeployOn(map.tiles[2][2], control, 2, 2, 'red')).toBe(false);
    // Held mid-board doors stay legal.
    expect(canDeployOn(map.tiles[2][1], control, 2, 1, 'red')).toBe(true);
    expect(canDeployOn(map.tiles[2][3], control, 2, 3, 'red')).toBe(true);
  });

  it('AI scoredCandidates never picks a street or resource as a muster cell', () => {
    let control = initialControl(map.tiles);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        control = paintTile(control, map.tiles, r, c, 'red');
      }
    }
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board: emptyBoard(),
      hand: [unitCard({ id: 'u1', name: 'Lamp Bearer', cost: 2, power: 2 })],
      loyalty: 6,
    };
    const deploys = scoredCandidates(snap).filter((x) => x.action.type === 'deploy');
    expect(deploys.length).toBeGreaterThan(0);
    for (const x of deploys) {
      if (x.action.type !== 'deploy') continue;
      const kind = map.tiles[x.action.r][x.action.c].kind;
      expect(kind === 'gate' || kind === 'stronghold').toBe(true);
      expect(kind === 'street' || kind === 'resource').toBe(false);
    }
  });

  it('ashLock restricts the burned chair to home doors only', () => {
    let control = initialControl(map.tiles);
    control = paintTile(control, map.tiles, 2, 1, 'red'); // mid gate
    // Without ash: held mid gate OK.
    expect(canDeployOn(map.tiles[2][1], control, 2, 1, 'red')).toBe(true);
    // With ashLock on red: mid gate (no home) blocked; home gate still OK.
    expect(canDeployOn(map.tiles[2][1], control, 2, 1, 'red', 'red')).toBe(false);
    expect(canDeployOn(map.tiles[0][1], control, 0, 1, 'red', 'red')).toBe(true);
    expect(canDeployOn(map.tiles[0][2], control, 0, 2, 'red', 'red')).toBe(true);
  });
});
