/**
 * Cryptic hints toward hidden codes. Second Hour: after First Hour wins while the
 * hour is still sealed, the victory screen whispers — vaguer at first, nearly
 * plain after five wins. Never shown once the Second Hour is open.
 */
import { readHourOpen } from './hourUnlock';

export const FIRST_HOUR_WINS_KEY = 'occult-wars.first-hour-wins';
const HINT_SEED_KEY = 'occult-wars.hint-seed';

/** Tier 1 (wins 1–2): something more is out there. */
export const SECOND_HOUR_TIER1 = [
  'The clock has struck only once. It remembers how to strike again.',
  'One hour of the war has passed. The bell-rope is still swaying.',
  'Somewhere behind the brass, a second hand waits for leave to move.',
  'The atelier keeps an hour it has not shown you.',
  'Every rite you win wears the First Hour a little thinner.',
  "A clockmaker's widow swears the war was built with two faces.",
  'The pendulum swings past a door you have not noticed.',
  'The candles burned to the first mark. There is a second mark below it.',
  'Your victory echoes, and something answers from a later hour.',
  'The First Hour is only the first.',
] as const;

/** Tier 2 (wins 3–4): names have power over the clock. */
export const SECOND_HOUR_TIER2 = [
  'Some say a name spoken aloud can turn the clock.',
  'The clock does not answer hands. It answers names.',
  'Occultists are known by what they call themselves. So are hours.',
  'Whatever you call yourself, the atelier believes.',
  'A wrong name at the door has been known to open the right hour.',
  'The ledger asks your name. It would accept other things.',
  'Name the hour, and the hour may come.',
  'The bell rings for whoever names it — even an hour.',
  'Not a key. Not a coin. A name, written where names go.',
  "The clock's second face has a name. Do you know it?",
] as const;

/** Tier 3 (wins 5+): nearly plain. */
export const SECOND_HOUR_TIER3 = [
  'Write the second hour where your name belongs.',
  'The Occultist box takes more than your name. Give it the hour that follows this one.',
  'Your name is not the only thing the name box will accept. Offer it the second hour.',
  'Where the atelier asks who you are, tell it which hour you want: the second.',
  '“Speak a name…”, the box says. Speak the second hour.',
  'Three words in the name box: the next hour, spelled out.',
  'The Occultist line turns the clock if you write what comes after the first hour.',
  'Stop signing your name. Sign the hour — the second one.',
  'Write the hour, not the man, where the atelier asks your name.',
  'The second hour opens for whoever writes it as their name.',
] as const;

export function secondHourTier(wins: number): 1 | 2 | 3 {
  return wins >= 5 ? 3 : wins >= 3 ? 2 : 1;
}

/** The hint for the Nth First Hour win (rotates through the tier's pool). */
export function secondHourHint(wins: number, seed = 0): string {
  const tier = secondHourTier(wins);
  const pool = tier === 3 ? SECOND_HOUR_TIER3 : tier === 2 ? SECOND_HOUR_TIER2 : SECOND_HOUR_TIER1;
  const i = (((wins + seed) % pool.length) + pool.length) % pool.length;
  return pool[i]!;
}

function readInt(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function readFirstHourWins(): number {
  return Math.max(0, readInt(FIRST_HOUR_WINS_KEY) ?? 0);
}

/** A stable per-device offset so two players don't read the same order. */
function hintSeed(): number {
  const have = readInt(HINT_SEED_KEY);
  if (have != null) return have;
  const s = Math.floor(Math.random() * 1000);
  try {
    localStorage.setItem(HINT_SEED_KEY, String(s));
  } catch {
    /* private mode */
  }
  return s;
}

/**
 * A First Hour win (any non-hotseat match). Counts it and returns the hint to
 * show, or null once the Second Hour is open.
 */
export function noteFirstHourWin(): string | null {
  if (typeof localStorage === 'undefined' || readHourOpen()) return null;
  const wins = readFirstHourWins() + 1;
  try {
    localStorage.setItem(FIRST_HOUR_WINS_KEY, String(wins));
  } catch {
    /* private mode */
  }
  return secondHourHint(wins, hintSeed());
}
