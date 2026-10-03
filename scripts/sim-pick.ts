/* Does the sims-informed pick beat the starter more often than the plain heuristic? (held-out seeds) */
import { newMatch, playMatch, seededRand } from '../src/game/engine';
import { pickAiAction, resetAiPlan, snapshotFromState, type AiDifficulty } from '../src/game/ai';
import { MAPS, mapsForEra } from '../src/game/maps';
import { buildOrderAllyWorkingIds, cardsFromIds, heroForFaction, shuffleInPlace } from '../src/game/deck';
import { CARDS } from '../src/data/catalog';
import { strongestDeck, strongestBySimsSync } from '../src/game/autoDeck';
import { isSealedCenturyOrder, isSecondHourSociety } from '../src/game/orders';
const mind = (process.env.MIND ?? 'experienced') as AiDifficulty;
const games = Number(process.env.GAMES ?? 20);
const all: Record<string, number> = Object.fromEntries(CARDS.map((c) => [c.id, 3]));
const factions = [...new Set(CARDS.filter((c) => c.kind === 'hero').map((c) => c.faction))];
function vs(a: string[], b: string[], f: string) {
  const era = isSecondHourSociety(f) ? 'second' : isSealedCenturyOrder(f) ? 'old' : 'first';
  const maps = mapsForEra(era).length ? mapsForEra(era) : MAPS;
  let w = 0;
  for (let g = 0; g < games; g++) {
    resetAiPlan();
    const rand = seededRand(31337 + g);
    const aSide = g % 2 === 0 ? 'blue' : 'red';
    const st = newMatch({ tiles: maps[(g + 1) % maps.length].tiles, blueDeck: shuffleInPlace(cardsFromIds(aSide === 'blue' ? a : b), rand), redDeck: shuffleInPlace(cardsFromIds(aSide === 'red' ? a : b), rand), blueLeader: heroForFaction(f), redLeader: heroForFaction(f), rand });
    const pol = (s: any, avoid?: string[]) => pickAiAction({ ...snapshotFromState(s), avoid }, mind, { rand });
    const r = playMatch(st, { blue: pol, red: pol });
    if (r.winner === aSide) w++;
  }
  return w;
}
let H = 0, S = 0, N = 0; const t0 = Date.now();
for (const f of factions) {
  const starter = buildOrderAllyWorkingIds(f, 30);
  const h = strongestDeck(f, all).cards;
  const t1 = Date.now();
  const s = strongestBySimsSync(f, heroForFaction(f)!.id, all, starter).cards;
  const pickMs = Date.now() - t1;
  const hw = vs(h, starter, f), sw = vs(s, starter, f);
  H += hw; S += sw; N += games;
  console.log(`${f}: heuristic ${hw}/${games} · sims-pick ${sw}/${games} · pick ${pickMs} ms`);
}
console.log(`TOTAL heuristic ${(100 * H / N).toFixed(1)}% · sims-pick ${(100 * S / N).toFixed(1)}% vs starter · ${mind} · ${Math.round((Date.now() - t0) / 1000)} s`);
