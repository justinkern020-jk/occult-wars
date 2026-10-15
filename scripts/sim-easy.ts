/* Easy (current code) vs Experienced baseline win rate, plus how often Easy casts / uses its leader. */
import { newMatch, playMatch, seededRand } from '../src/game/engine';
import { pickAiAction, resetAiPlan, snapshotFromState } from '../src/game/ai';
import { MAPS, mapsForEra } from '../src/game/maps';
import { buildOrderAllyWorkingIds, cardsFromIds, heroForFaction, shuffleInPlace } from '../src/game/deck';
import { CARDS } from '../src/data/catalog';
import { isSealedCenturyOrder, isSecondHourSociety } from '../src/game/orders';
const games = Number(process.env.GAMES ?? 20);
const opp = (process.env.OPP ?? 'experienced') as any;
const factions = [...new Set(CARDS.filter((c) => c.kind === 'hero').map((c) => c.faction))];
let w = 0, n = 0, casts = 0, leads = 0;
for (const f of factions) {
  const deck = buildOrderAllyWorkingIds(f, 30);
  const era = isSecondHourSociety(f) ? 'second' : isSealedCenturyOrder(f) ? 'old' : 'first';
  const maps = mapsForEra(era).length ? mapsForEra(era) : MAPS;
  for (let g = 0; g < games; g++) {
    resetAiPlan();
    const rand = seededRand(777 + g);
    const easy = g % 2 === 0 ? 'blue' : 'red';
    const st = newMatch({ tiles: maps[(g + 1) % maps.length].tiles, blueDeck: shuffleInPlace(cardsFromIds(deck), rand), redDeck: shuffleInPlace(cardsFromIds(deck), rand), blueLeader: heroForFaction(f), redLeader: heroForFaction(f), rand });
    const pol = (d: any, mine: boolean) => (s: any, avoid?: string[]) => {
      const a = pickAiAction({ ...snapshotFromState(s), avoid }, d, { rand });
      if (mine) { if (a.type === 'cast') casts++; if (a.type === 'leader') leads++; }
      return a;
    };
    const r = playMatch(st, { blue: pol(easy === 'blue' ? 'easy' : opp, easy === 'blue'), red: pol(easy === 'red' ? 'easy' : opp, easy === 'red') });
    n++; if (r.winner === easy) w++;
  }
}
console.log(`Easy vs ${opp}: ${w}/${n} = ${(100 * w / n).toFixed(1)}% · casts ${casts} (${(casts / n).toFixed(2)}/game) · leader ${leads} (${(leads / n).toFixed(2)}/game)`);
