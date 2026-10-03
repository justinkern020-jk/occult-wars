/**
 * The Day's Rites: three daily quests that turn over at local midnight, and
 * the adept's level (XP from finished matches). Pure functions over the
 * profile so they save locally and ride the cloud page like everything else.
 *
 * Counted in every mode but the passed grimoire (hotseat: one hand plays both
 * chairs, so it would be trivial to farm). A match where a code dropped a
 * plate into a hand is "touched": its win counts for neither win rites nor
 * win XP (the rest of its tallies still count).
 */

export type RiteKind =
  | 'win'
  | 'win_faction'
  | 'cast'
  | 'destroy'
  | 'muster'
  | 'conquer'
  | 'damage'
  | 'finish'
  | 'leader';

export type DailyRite = {
  id: string;
  kind: RiteKind;
  goal: number;
  reward: number;
  faction?: string;
  progress: number;
  claimed: boolean;
};

export type DailyState = { day: string; rites: DailyRite[] };

/** One match's tallies for the local hand (the side this device plays). */
export type MatchTally = {
  cast: number;
  destroy: number;
  muster: number;
  conquer: number;
  damage: number;
  leader: number;
  /** The match reached its end (not abandoned mid-way). */
  finished: boolean;
  won: boolean;
  faction: string;
  /** A code dropped a plate into a hand this match. */
  touched: boolean;
};

export function emptyTally(faction = ''): MatchTally {
  return {
    cast: 0,
    destroy: 0,
    muster: 0,
    conquer: 0,
    damage: 0,
    leader: 0,
    finished: false,
    won: false,
    faction,
    touched: false,
  };
}

type Template = { kind: RiteKind; goal: number; reward: number };
const TEMPLATES: Template[] = [
  { kind: 'win_faction', goal: 1, reward: 40 },
  { kind: 'win', goal: 2, reward: 35 },
  { kind: 'cast', goal: 5, reward: 25 },
  { kind: 'destroy', goal: 10, reward: 30 },
  { kind: 'muster', goal: 12, reward: 20 },
  { kind: 'conquer', goal: 8, reward: 25 },
  { kind: 'damage', goal: 25, reward: 25 },
  { kind: 'finish', goal: 3, reward: 20 },
  { kind: 'leader', goal: 2, reward: 20 },
];

export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Small deterministic PRNG seeded from the day (same rites all day). */
function seeded(day: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Three distinct rites for a day. `sworn` are the orders this adept actually
 * plays (first hour allegiance, second hour society, sealed century order):
 * a "win with" rite only ever names one of them.
 */
export function ritesForDay(day: string, sworn: string[]): DailyRite[] {
  const rnd = seeded(day);
  const pool = TEMPLATES.filter((t) => t.kind !== 'win_faction' || sworn.length > 0);
  const picked: Template[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const i = Math.floor(rnd() * pool.length);
    const [t] = pool.splice(i, 1);
    // Never two win rites on one day.
    if ((t.kind === 'win' && picked.some((p) => p.kind === 'win_faction')) ||
        (t.kind === 'win_faction' && picked.some((p) => p.kind === 'win'))) {
      continue;
    }
    picked.push(t);
  }
  return picked.map((t, i) => ({
    id: `${day}-${i}-${t.kind}`,
    kind: t.kind,
    goal: t.goal,
    reward: t.reward,
    faction: t.kind === 'win_faction' ? sworn[Math.floor(rnd() * sworn.length)] : undefined,
    progress: 0,
    claimed: false,
  }));
}

/** Player-facing line for a rite. */
export function riteLabel(r: Pick<DailyRite, 'kind' | 'goal' | 'faction'>): string {
  const short = (r.faction ?? '').replace(/^The\s+/, '');
  switch (r.kind) {
    case 'win_faction':
      return `Win with a ${short} working`;
    case 'win':
      return `Win ${r.goal} matches`;
    case 'cast':
      return `Cast ${r.goal} spells (rites or devices)`;
    case 'destroy':
      return `Destroy ${r.goal} enemy units`;
    case 'muster':
      return `Muster ${r.goal} units`;
    case 'conquer':
      return `Conquer ${r.goal} circles`;
    case 'damage':
      return `Deal ${r.goal} damage to enemy units`;
    case 'finish':
      return `Finish ${r.goal} matches`;
    case 'leader':
      return `Speak your leader's power ${r.goal} times`;
  }
}

function tallyFor(r: DailyRite, t: MatchTally): number {
  const fairWin = t.finished && t.won && !t.touched;
  switch (r.kind) {
    case 'win':
      return fairWin ? 1 : 0;
    case 'win_faction':
      return fairWin && t.faction === r.faction ? 1 : 0;
    case 'finish':
      return t.finished ? 1 : 0;
    default:
      return Math.max(0, Math.floor(t[r.kind]));
  }
}

/** Fresh rites when the day has turned (keeps today's as they are). */
export function ensureDaily(
  daily: DailyState | null | undefined,
  sworn: string[],
  day = localDayKey(),
): DailyState {
  if (daily && daily.day === day && daily.rites.length > 0) return daily;
  return { day, rites: ritesForDay(day, sworn) };
}

export function applyTally(daily: DailyState, t: MatchTally): DailyState {
  return {
    ...daily,
    rites: daily.rites.map((r) =>
      r.claimed ? r : { ...r, progress: Math.min(r.goal, r.progress + tallyFor(r, t)) },
    ),
  };
}

export function riteReady(r: DailyRite): boolean {
  return !r.claimed && r.progress >= r.goal;
}

// ——— Levels ———

export const XP_WIN = 100;
export const XP_LOSS = 40;
/** Small extra for the work done in a match (capped so long sittings don't run away). */
export function matchXp(t: MatchTally): number {
  if (!t.finished) return 0;
  const base = t.won && !t.touched ? XP_WIN : XP_LOSS;
  const work = Math.min(40, t.destroy * 2 + t.cast + t.conquer);
  return base + work;
}

/** XP needed to rise from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 150 + 75 * (level - 1);
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level) && level < 999) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: xpToNext(level) };
}

// ——— Migration ———

const KINDS = new Set<RiteKind>(TEMPLATES.map((t) => t.kind));

export function migrateDaily(raw: unknown): DailyState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.day) || !Array.isArray(o.rites)) {
    return null;
  }
  const rites: DailyRite[] = [];
  for (const r of o.rites.slice(0, 3)) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.kind !== 'string' || !KINDS.has(x.kind as RiteKind)) continue;
    const goal = Math.max(1, Math.min(99, Math.floor(Number(x.goal) || 1)));
    rites.push({
      id: typeof x.id === 'string' ? x.id.slice(0, 48) : `${o.day}-${rites.length}`,
      kind: x.kind as RiteKind,
      goal,
      reward: Math.max(0, Math.min(200, Math.floor(Number(x.reward) || 0))),
      faction: typeof x.faction === 'string' ? x.faction.slice(0, 48) : undefined,
      progress: Math.max(0, Math.min(goal, Math.floor(Number(x.progress) || 0))),
      claimed: x.claimed === true,
    });
  }
  return rites.length ? { day: o.day, rites } : null;
}
