/* Sims: the auto-built strongest deck vs the starter working, same leader, alternating seats. */
import { newMatch, playMatch, seededRand } from '../src/game/engine';
import { pickAiAction, resetAiPlan, snapshotFromState, type AiDifficulty } from '../src/game/ai';
import { MAPS, mapsForEra, type Side } from '../src/game/maps';
import { buildOrderAllyWorkingIds, cardsFromIds, heroForFaction, shuffleInPlace } from '../src/game/deck';
import { CARDS } from '../src/data/catalog';
import { AUTO_TUNING, strongestDeck } from '../src/game/autoDeck';
if (process.env.TUNE) Object.assign(AUTO_TUNING, JSON.parse(process.env.TUNE));

const mind = (process.env.MIND ?? 'experienced') as AiDifficulty;
const games = Number(process.env.GAMES ?? 12);
const era = (process.env.ERA ?? 'first') as 'first' | 'second' | 'old';
const factions = [...new Set(CARDS.filter((c) => c.kind === 'hero' && (c as { era?: string }).era === undefined).map((c) => c.faction))];
const all: Record<string, number> = {};
for (const c of CARDS) all[c.id] = 3;
const maps = mapsForEra(era).length ? mapsForEra(era) : MAPS;
const pol = (rand: () => number) => (s: Parameters<typeof snapshotFromState>[0], avoid?: string[]) =>
  pickAiAction({ ...snapshotFromState(s), avoid }, mind, { rand });
let aw = 0, bw = 0, dr = 0;
const t0 = Date.now();
const list = (process.env.FACTIONS ? process.env.FACTIONS.split('|') : factions);
for (const f of list) {
  const auto = strongestDeck(f, all).cards;
  const starter = buildOrderAllyWorkingIds(f, 30);
  let fa = 0, fb = 0;
  for (let g = 0; g < games; g++) {
    resetAiPlan();
    const rand = seededRand(500 + g);
    const autoSide: Side = g % 2 === 0 ? 'blue' : 'red';
    const st = newMatch({
      tiles: maps[g % maps.length].tiles,
      blueDeck: shuffleInPlace(cardsFromIds(autoSide === 'blue' ? auto : starter), rand),
      redDeck: shuffleInPlace(cardsFromIds(autoSide === 'red' ? auto : starter), rand),
      blueLeader: heroForFaction(f),
      redLeader: heroForFaction(f),
      rand,
    });
    const r = playMatch(st, { blue: pol(rand), red: pol(rand) });
    if (r.winner === autoSide) { aw++; fa++; } else if (r.winner) { bw++; fb++; } else dr++;
  }
  if (!process.env.QUIET) console.log(`${f}: auto ${fa} – ${fb} starter`);
}
console.log(`TOTAL auto ${aw} – ${bw} starter (draws ${dr}) · ${mind} · ${Math.round((Date.now() - t0) / 1000)} s`);
