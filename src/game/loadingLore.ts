/** Picks loading-lore lines: a shuffled deck per session, so none repeats until all are seen. */
import { LOADING_LORE, type LoreLine } from '../data/loadingLore';

const KEY = 'occult-wars.lore-deck.v1';

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

let memo: number[] | null = null;
function readDeck(): number[] {
  if (memo) return memo;
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as unknown;
    if (Array.isArray(raw) && raw.every((x) => Number.isInteger(x) && x >= 0 && x < LOADING_LORE.length)) {
      memo = raw as number[];
      return memo;
    }
  } catch {
    /* private mode: memory only */
  }
  memo = [];
  return memo;
}
function writeDeck(d: number[]): void {
  memo = d;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* memory only */
  }
}

/** The next unseen line this session (reshuffles once every line has been shown). */
export function nextLoreLine(): LoreLine {
  let deck = readDeck();
  if (deck.length === 0) deck = shuffled(LOADING_LORE.length);
  const [i, ...rest] = deck;
  writeDeck(rest);
  return LOADING_LORE[i!]!;
}
