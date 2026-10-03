/**
 * Rival mind sims on the headless engine: Expert beats the lower levels (and
 * grok.me's original Expert), and always takes a lethal line when one exists.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cloneState,
  listPlaced,
  newMatch,
  playMatch,
  seededRand,
  type EngineAction,
  type EngineState,
  type Policy,
} from './engine';
import {
  pickAiAction,
  pickGrokExpertAction,
  resetAiPlan,
  snapshotFromState,
  stateFromSnapshot,
  findLethal,
  type AiDifficulty,
} from './ai';
import { MAPS, mapById, type Side } from './maps';
import { buildWorkingIds, cardsFromIds, heroForFaction, shuffleInPlace } from './deck';
import { CARDS } from '../data/catalog';

const FACTIONS = [...new Set(CARDS.filter((c) => c.kind === 'hero').map((c) => c.faction))];

type Mind = AiDifficulty | 'grok';

function policy(mind: Mind, rand: () => number): Policy {
  return (s, avoid) => {
    const snap = { ...snapshotFromState(s), avoid };
    return mind === 'grok' ? pickGrokExpertAction(snap) : pickAiAction(snap, mind, { rand });
  };
}

function freshMatch(g: number): EngineState {
  const rand = seededRand(1000 + g);
  const fb = FACTIONS[g % FACTIONS.length];
  const fr = FACTIONS[(g * 3 + 1) % FACTIONS.length];
  return newMatch({
    tiles: MAPS[g % MAPS.length].tiles,
    blueDeck: shuffleInPlace(cardsFromIds(buildWorkingIds(fb)), rand),
    redDeck: shuffleInPlace(cardsFromIds(buildWorkingIds(fr)), rand),
    blueLeader: heroForFaction(fb),
    redLeader: heroForFaction(fr),
    rand,
  });
}

/** Play `games` matches, alternating seats; returns wins for `a`. */
function series(a: Mind, b: Mind, games: number) {
  let aw = 0;
  let bw = 0;
  for (let g = 0; g < games; g++) {
    resetAiPlan();
    const st = freshMatch(g);
    const rand = seededRand(77 + g);
    const aSide: Side = g % 2 === 0 ? 'blue' : 'red';
    const res = playMatch(
      st,
      aSide === 'blue'
        ? { blue: policy(a, rand), red: policy(b, rand) }
        : { blue: policy(b, rand), red: policy(a, rand) },
    );
    if (res.winner === aSide) aw += 1;
    else if (res.winner) bw += 1;
  }
  console.log(`${a} ${aw} – ${bw} ${b}`);
  return { aw, bw };
}

function blank(mapId: string, side: Side): EngineState {
  const st = newMatch({ tiles: mapById(mapId).tiles, blueDeck: [], redDeck: [] });
  st.side = side;
  st.ctx.side = side;
  st.turn = 9;
  st.ctx.loyalty = { blue: 0, red: 0 };
  return st;
}

function place(
  st: EngineState,
  uid: string,
  side: Side,
  r: number,
  c: number,
  power: number,
  keywords: string[] = [],
) {
  st.ctx.units[uid] = {
    uid,
    cardId: uid,
    name: uid,
    side,
    power,
    maxPower: power,
    loyalty: 2,
    keywords,
  };
  st.ctx.board[r][c] = uid;
}

/** Let Expert play out the side-to-act's whole rite. */
function expertRite(st: EngineState): EngineState {
  resetAiPlan();
  const s = cloneState(st);
  const side = s.side;
  const avoid: string[] = [];
  for (let i = 0; i < 24 && !s.winner && s.side === side; i++) {
    const a = pickAiAction({ ...snapshotFromState(s), avoid }, 'expert');
    if (applyAction(s, a)) {
      avoid.push(JSON.stringify(a));
      if (a.type === 'end') break;
    }
  }
  return s;
}

/** Independent brute force: every move / strike / muster, up to `depth` deep. */
function bruteLethal(st: EngineState, depth: number): boolean {
  const me = st.side;
  const ended = cloneState(st);
  applyAction(ended, { type: 'end' });
  if (ended.winner === me) return true;
  const acts: EngineAction[] = [];
  for (const u of listPlaced(st.ctx, me)) {
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      acts.push({ type: 'move', uid: u.uid, r: u.r + dr, c: u.c + dc });
    for (const f of listPlaced(st.ctx, me === 'blue' ? 'red' : 'blue'))
      acts.push({ type: 'attack', uid: u.uid, targetUid: f.uid });
  }
  st.ctx.hand[me].forEach((card, index) => {
    if (card.kind !== 'unit') return;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) acts.push({ type: 'deploy', index, r, c });
  });
  for (const a of acts) {
    const nx = cloneState(st);
    if (applyAction(nx, a)) continue;
    if (nx.winner === me) return true;
    if (!nx.winner && depth > 1 && bruteLethal(nx, depth - 1)) return true;
  }
  return false;
}

describe('Expert takes lethal', () => {
  it('storms an open stronghold instead of taking a tempting trade', () => {
    const st = blank('leaden-court', 'red');
    place(st, 'raider', 'red', 3, 2, 2);
    place(st, 'bait', 'blue', 3, 1, 1);
    place(st, 'big', 'blue', 2, 2, 5);
    const out = expertRite(st);
    expect(out.winner).toBe('red');
    expect(out.winKind).toBe('stronghold');
  });

  it('shoots the keeper off the stronghold, then walks in', () => {
    const st = blank('leaden-court', 'red');
    place(st, 'keeper', 'blue', 4, 2, 3);
    place(st, 'runner', 'red', 3, 2, 1);
    place(st, 'gun', 'red', 2, 2, 3, ['ranged']);
    // A plain strike by the runner would lose (P1 into P3).
    expect(findLethal(stateFromSnapshot(snapshotFromState(st)), 3)).not.toBeNull();
    const out = expertRite(st);
    expect(out.winner).toBe('red');
    expect(out.winKind).toBe('stronghold');
  });

  it('kills a keeper in melee and advances onto the stronghold', () => {
    const st = blank('ashen-cross', 'blue');
    place(st, 'keeper', 'red', 0, 2, 2);
    place(st, 'brute', 'blue', 1, 2, 4);
    place(st, 'bait', 'red', 2, 1, 1);
    const out = expertRite(st);
    expect(out.winner).toBe('blue');
    expect(out.winKind).toBe('stronghold');
  });

  it('paints the last circles it needs before ending on 60 domination', () => {
    const st = blank('leaden-court', 'red');
    st.ctx.domination = { blue: 20, red: 55 };
    // Holding 3 (home + two gates) ends on 58; two fresh gates make 60.
    place(st, 'a', 'red', 1, 1, 2);
    place(st, 'b', 'red', 1, 3, 2);
    const out = expertRite(st);
    expect(out.winner).toBe('red');
    expect(out.winKind).toBe('dominance');
  });

  it('never misses a 1–2 action stronghold / domination win found in real games', () => {
    let checked = 0;
    for (let g = 0; g < 16; g++) {
      resetAiPlan();
      const st = freshMatch(g);
      const rand = seededRand(500 + g);
      // Easy misses killing lines, so its games leave plenty of them lying around.
      const minds = { blue: policy('easy', rand), red: policy('easy', rand) };
      // Walk a lopsided game; at each rite open, test the side to act.
      while (!st.winner && st.turn < 40) {
        if (bruteLethal(st, 2)) {
          checked += 1;
          const out = expertRite(st);
          expect(out.winner, `game ${g} rite ${st.turn}`).toBe(st.side);
        }
        const side = st.side;
        const avoid: string[] = [];
        for (let i = 0; i < 24 && !st.winner && st.side === side; i++) {
          const a = minds[side](st, avoid);
          if (applyAction(st, a)) {
            avoid.push(JSON.stringify(a));
            if (a.type === 'end') break;
          }
        }
      }
    }
    console.log(`lethal positions checked: ${checked}`);
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});

describe('Rival mind strength (20-game sims, alternating seats)', () => {
  it('Expert beats Experienced', () => {
    const { aw, bw } = series('expert', 'experienced', 20);
    expect(aw).toBeGreaterThan(bw);
    expect(aw).toBeGreaterThanOrEqual(13);
  }, 120_000);

  it('Expert beats Easy', () => {
    const { aw } = series('expert', 'easy', 20);
    expect(aw).toBeGreaterThanOrEqual(17);
  }, 120_000);

  it('Experienced beats Easy', () => {
    const { aw, bw } = series('experienced', 'easy', 20);
    expect(aw).toBeGreaterThan(bw);
  }, 120_000);

  it("Expert beats grok.me's original Expert", () => {
    const { aw, bw } = series('expert', 'grok', 20);
    expect(aw).toBeGreaterThan(bw);
  }, 180_000);

  it('Expert thinks fast enough for a phone', () => {
    const st = freshMatch(3);
    const rand = seededRand(3);
    let worst = 0;
    let total = 0;
    let n = 0;
    const timed: Policy = (s, avoid) => {
      const t = performance.now();
      const a = pickAiAction({ ...snapshotFromState(s), avoid }, 'expert', { rand });
      const dt = performance.now() - t;
      worst = Math.max(worst, dt);
      total += dt;
      n += 1;
      return a;
    };
    playMatch(st, { blue: timed, red: policy('experienced', rand) });
    expect(total / n).toBeLessThan(60);
    expect(worst).toBeLessThan(700);
  }, 60_000);
});
