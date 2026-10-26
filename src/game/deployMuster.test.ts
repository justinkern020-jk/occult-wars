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

describe('airship is the only street hand-muster path', () => {
  it('without an airship, painted streets never appear in AI muster cells', () => {
    const map = mapById('ashen-cross');
    let control = initialControl(map.tiles);
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) control = paintTile(control, map.tiles, r, c, 'red');
    const board = emptyBoard();
    board[2][2] = {
      uid: 'grunt',
      side: 'red',
      power: 3,
      keywords: [],
      moved: true,
      attacked: true,
      r: 2,
      c: 2,
      cardId: 'lamp_bearer',
    };
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board,
      hand: [unitCard({ id: 'u1', name: 'Lamp Bearer', cost: 2, power: 2 })],
      loyalty: 6,
    };
    for (const x of scoredCandidates(snap)) {
      if (x.action.type !== 'deploy') continue;
      const kind = map.tiles[x.action.r][x.action.c].kind;
      expect(kind === 'street' || kind === 'resource').toBe(false);
    }
  });

  it('with an airship on leaden-court, an empty adjacent street is offered as a muster cell', () => {
    const map = mapById('leaden-court');
    const control = initialControl(map.tiles);
    const board = emptyBoard();
    // Mid street (2,2); ortho streets at (2,0)/(2,4) are streets in sdsds — (2,0)=s, (2,1)=d gate, (2,2)=s.
    board[2][2] = {
      uid: 'zep',
      side: 'red',
      power: 4,
      keywords: ['airship', 'unclaiming'],
      moved: true,
      attacked: true,
      r: 2,
      c: 2,
      cardId: 'night_zeppelin',
    };
    const snap: AiSnapshot = {
      side: 'red',
      tiles: map.tiles,
      control,
      board,
      hand: [unitCard({ id: 'u1', name: 'Lamp Bearer', cost: 2, power: 2 })],
      loyalty: 6,
    };
    const streetDeploys = scoredCandidates(snap).filter((x) => {
      if (x.action.type !== 'deploy') return false;
      return map.tiles[x.action.r][x.action.c].kind === 'street';
    });
    expect(streetDeploys.length).toBeGreaterThan(0);
    // Adjacent street (2,0) or (2,4) — manhattan 2 from center in sdsds? 
    // sdsds: (2,0)=s (2,1)=d (2,2)=s (2,3)=d (2,4)=s. Zeppelin on (2,2) blocks that cell.
    // Ortho empty streets: none on same row (gates beside). Row (1,2)=s and (3,2)=s are ortho streets.
    const cells = streetDeploys.map((x) =>
      x.action.type === 'deploy' ? `${x.action.r},${x.action.c}` : '',
    );
    expect(cells.some((k) => k === '1,2' || k === '3,2')).toBe(true);
  });
});
