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

// ——— Every secret's whispers, and where they are heard ———

/** Seth Kern (the chief, the other son of the house). Never names the code. */
export const SETH_TIER1 = [
  'The house of Kern has more than one son.',
  'Somewhere a siren is waiting for its chief.',
  'One brother builds the war. The other keeps the peace.',
  'A badge glints in the candle smoke, then is gone.',
  'The atelier remembers a second Kern.',
  'Not every occultist wears a robe. One wears a badge.',
  "A brother's name is a key few think to try.",
  'The chief has not yet been called to this table.',
  'Blood of the house of Kern runs in two veins.',
  'The siren sounds only for one who knows his name.',
] as const;
export const SETH_TIER2 = [
  'Call the chief by his name, in the place where yours would go.',
  'A son of the house answers to his own name — first, then family.',
  'The name box knows the Kerns. Not only the one you think.',
  "Two words: a short first name, and the family's.",
  'The house of Kern sent a son to keep order. Write him in.',
  'What the badge says above the pocket, the atelier will accept.',
  'Seek the chief among names, not among cards.',
  'Sign as the other son, and the siren will answer.',
  'The chief comes to whoever writes his name as their own.',
  'Brothers share a surname. The atelier shares a secret with one of them.',
] as const;
export const SETH_TIER3 = [
  'Four letters and the house of Kern, written where your name goes, call the chief.',
  'The younger branch of the house of Kern answers in the Occultist box.',
  "Brother to the man who built the war: his name, in your name's place.",
  "The chief's first name is shorter than his family's. Write both.",
  'If you knew the brothers Kern, you would know what to write.',
  'Not the builder. The brother. His full name, where yours sits.',
  'Every siren in this war waits on one name of the house of Kern.',
  "Write the chief's name as your own and bring a badge to the circle.",
  'Two Kerns made this war. You have met one.',
  "The second son's name opens the second door of the house.",
] as const;

/** Justin Kern (the maker; the codes are a physicist and a doubled call for help). */
export const JUSTIN_TIER1 = [
  'Every war has a man who ends it.',
  'Some numbers are dialed only in emergencies.',
  'The gadget sleeps under the desert. It knows a name.',
  'Six digits can summon more than help.',
  'The architect of this war walks among its pieces.',
  'Now I am become… someone. The atelier waits for the rest.',
  'When the dispatcher answers twice, someone important is coming.',
  'A flash on the horizon; a man steps out of it.',
  "The war's maker is not on any shelf you can buy.",
  'Emergencies come in threes. Some come in sixes.',
] as const;
export const JUSTIN_TIER2 = [
  'The father of the bomb is remembered in the name box.',
  'The number you call when the house burns has a twin.',
  'Trinity was a test. So is your name.',
  "Some say the war's maker answers to a physicist's name.",
  'Help is three digits. The maker is twice that.',
  "The desert flash and the dispatcher's line lead to the same man.",
  'The man who ends the Occult Wars once ended another war, under another name.',
  'An emergency, repeated, is a summons.',
  'A surname from Los Alamos still carries weight here.',
  'The gadget wants to be named. Name its father.',
] as const;
export const JUSTIN_TIER3 = [
  "Write the bomb's father where your name goes, and the maker joins your hand.",
  'Call for help twice over in the Occultist box.',
  'The emergency line, doubled, signs as the man who ends the war.',
  "The Manhattan Project's director has a name. The atelier knows it.",
  'Six digits of emergency, written as your name, bring the maker.',
  'He became death, the destroyer of worlds. Sign as him.',
  "The war's last card is dealt to whoever names Trinity's father.",
  'Dial as if your house were on fire — then dial it again — in the name box.',
  'The maker answers two ways: the physicist, or the doubled call for help.',
  "Your name is the trigger. Write the gadget's father, or the doubled emergency.",
] as const;

/** Athens, Ohio (the cryptids' town). */
export const ATHENS_TIER1 = [
  'Something moved on the Hocking River tonight.',
  'The Ridges keep their windows dark, but not empty.',
  'A stain on an asylum floor has never washed out.',
  'Five cemeteries, they say, draw a star across one small town.',
  'Students walk past the old asylum and never look up.',
  'In the Wayne National Forest, the trees lean toward one town.',
  'Mothman was seen down the river. Others were seen closer.',
  'The brick streets of a college town remember every footstep.',
  'The cryptids gather where the river bends below the hill.',
  'A college bell counts the hours for things that are not students.',
] as const;
export const ATHENS_TIER2 = [
  'A town on the Hocking calls the cryptids home.',
  'The asylum on the Ridges looks down on a college town in the hills of Ohio.',
  "Simms, West State Street, and three more: the pentagram's points share a city.",
  "Ohio University's home is the most haunted town you have never typed.",
  'Name the town of the Ridges, and the night will answer.',
  "A Greek city's name, in the Buckeye State.",
  'The cryptids answer to a town, not a person.',
  "The Lunatic Asylum's town and its state, spoken in the name box, open the veil.",
  'Southeast Ohio, a river, a university, a star of graves: name it.',
  'A classical name with an Ohio address.',
] as const;
export const ATHENS_TIER3 = [
  'Write the town of the Ridges and its state where your name belongs.',
  "The night answers to a classical city's namesake in Ohio. Two words.",
  'City, then state: the home of the Ridges, written where your name goes.',
  'Name the Greek city that sits on the Hocking — then add its state.',
  'The cryptids come when you sign as the town of Ohio University, and its state.',
  'Not Greece. Ohio. Write both.',
  'In the name box: a college town in southeast Ohio, and its state. The veil thins.',
  'The pentagram town and its state, as your name.',
  'Two words: the town of the asylum, and the Buckeye State.',
  'Where Ohio University stands, and the state around it, belongs in the name box.',
] as const;

export type HintSecret = 'second' | 'seth' | 'justin' | 'athens';
export type WhisperPlace = 'victory' | 'defeat' | 'menu' | 'inspect' | 'meeting' | 'cryptid';

export const HINT_POOLS: Record<HintSecret, readonly (readonly string[])[]> = {
  second: [SECOND_HOUR_TIER1, SECOND_HOUR_TIER2, SECOND_HOUR_TIER3],
  seth: [SETH_TIER1, SETH_TIER2, SETH_TIER3],
  justin: [JUSTIN_TIER1, JUSTIN_TIER2, JUSTIN_TIER3],
  athens: [ATHENS_TIER1, ATHENS_TIER2, ATHENS_TIER3],
};

/** How often a place whispers at all. */
export const PLACE_ODDS: Record<WhisperPlace, number> = {
  victory: 0.5,
  defeat: 0.5,
  menu: 0.6,
  inspect: 1 / 12,
  meeting: 0.5,
  cryptid: 1,
};

/** Which secret a place favours (Seth ~1 in 6, Justin rarer still). */
export const PLACE_WEIGHTS: Record<WhisperPlace, Record<HintSecret, number>> = {
  victory: { second: 3, seth: 1, justin: 0.6, athens: 1.4 },
  defeat: { second: 3, seth: 1, justin: 0.6, athens: 1.4 },
  menu: { second: 3, seth: 1, justin: 0.5, athens: 1.5 },
  inspect: { second: 1.5, seth: 1, justin: 0.7, athens: 1.5 },
  meeting: { second: 2.5, seth: 1, justin: 0.6, athens: 1.5 },
  cryptid: { second: 0, seth: 0, justin: 0, athens: 1 },
};

export const SECRETS_FOUND_KEY = 'occult-wars.secrets-found';
const PLAYED_KEYS = ['occult-wars.played', 'the-second-hour.played', 'the-sealed-century.played'];
const TURN_KEY = 'occult-wars.whisper-turn';

export function readSecretsFound(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SECRETS_FOUND_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export function markSecretFound(id: string): boolean {
  const s = readSecretsFound();
  if (s.has(id)) return false;
  s.add(id);
  try {
    localStorage.setItem(SECRETS_FOUND_KEY, JSON.stringify([...s]));
  } catch {
    /* private mode */
  }
  return true;
}

function playedTotal(): number {
  return PLAYED_KEYS.reduce((n, k) => n + Math.max(0, readInt(k) ?? 0), 0);
}

/** Seth / Justin / Athens tiers grow with finished matches (Second Hour with First Hour wins). */
export function secretTier(secret: HintSecret, ctx: { wins: number; played: number }): 1 | 2 | 3 {
  if (secret === 'second') return secondHourTier(Math.max(1, ctx.wins));
  return ctx.played >= 20 ? 3 : ctx.played >= 6 ? 2 : 1;
}

export type WhisperCtx = {
  hourOpen: boolean;
  found: Set<string>;
  wins: number;
  played: number;
  /** A rotating count so successive whispers differ. */
  turn: number;
};

/** Pure picker (tests): a secret by the place's weights, then a line from its tier. */
export function pickWhisper(
  place: WhisperPlace,
  ctx: WhisperCtx,
  rnd: () => number = Math.random,
): { secret: HintSecret; tier: 1 | 2 | 3; text: string } | null {
  if (rnd() >= PLACE_ODDS[place]) return null;
  const w = PLACE_WEIGHTS[place];
  const open: Record<HintSecret, boolean> = {
    second: !ctx.hourOpen && !ctx.found.has('second'),
    seth: !ctx.found.has('seth'),
    justin: !ctx.found.has('justin'),
    athens: !ctx.found.has('athens'),
  };
  // The cryptids always speak of their town, found or not.
  if (place === 'cryptid') open.athens = true;
  const pool = (Object.keys(w) as HintSecret[]).filter((k) => open[k] && w[k] > 0);
  const total = pool.reduce((n, k) => n + w[k], 0);
  if (total <= 0) return null;
  let r = rnd() * total;
  let secret = pool[pool.length - 1]!;
  for (const k of pool) {
    r -= w[k];
    if (r < 0) {
      secret = k;
      break;
    }
  }
  const tier = secretTier(secret, ctx);
  const lines = HINT_POOLS[secret][tier - 1]!;
  const text = lines[(((ctx.turn % lines.length) + lines.length) % lines.length)]!;
  return { secret, tier, text };
}

/** A whisper for this place on this device (advances the rotation). */
export function whisperFor(place: WhisperPlace): string | null {
  if (typeof localStorage === 'undefined') return null;
  const turn = (readInt(TURN_KEY) ?? hintSeed()) + 1;
  try {
    localStorage.setItem(TURN_KEY, String(turn));
  } catch {
    /* private mode */
  }
  const hit = pickWhisper(place, {
    hourOpen: readHourOpen(),
    found: readSecretsFound(),
    wins: readFirstHourWins(),
    played: playedTotal(),
    turn,
  });
  return hit?.text ?? null;
}

/**
 * The match-over whisper. A First Hour win while the hour is sealed counts
 * toward the Second Hour clues (and usually shows one); now and then the
 * other secrets cut in (Seth ~1 in 6, Justin ~1 in 10).
 */
export function matchOverWhisper(won: boolean, firstHourWin: boolean, rnd: () => number = Math.random): string | null {
  const second = firstHourWin ? noteFirstHourWin() : null;
  if (second) {
    const r = rnd();
    const found = readSecretsFound();
    if (r < 1 / 6 && !found.has('seth')) return whisperFromPool('seth');
    if (r < 1 / 6 + 1 / 10 && !found.has('justin')) return whisperFromPool('justin');
    return second;
  }
  return whisperFor(won ? 'victory' : 'defeat');
}

function whisperFromPool(secret: HintSecret): string {
  const turn = (readInt(TURN_KEY) ?? hintSeed()) + 1;
  try {
    localStorage.setItem(TURN_KEY, String(turn));
  } catch {
    /* private mode */
  }
  const tier = secretTier(secret, { wins: readFirstHourWins(), played: playedTotal() });
  const lines = HINT_POOLS[secret][tier - 1]!;
  return lines[turn % lines.length]!;
}
