/**
 * Honours (achievements) and the titles they grant. Progress lives in the
 * profile (`ach`), so it rides the cloud copy when the adept is seated. The
 * secret honours stay hidden until earned. Stats come from finished (or
 * left) matches, broken seals, counter purchases, sightings and the plates
 * seen on the field; the rest is read straight off the profile.
 */
import type { MatchTally } from './dailyRites';
import { levelFromXp } from './dailyRites';
import type { Profile } from './profile';
import { FIRST_HOUR_ORDERS, SEALED_CENTURY_ORDERS, isSealedCenturyOrder, isSecondHourSociety } from './orders';
import { readHourOpen } from './hourUnlock';
import { codexCount } from './codexUnlock';

export type AchState = {
  /** Running counts: slain, cast, conquer, leader, wins, packs, buys, pvpWins… */
  stats: Record<string, number>;
  /** Distinct things: orders won with, cryptids sighted, secrets met. */
  sets: Record<string, string[]>;
  /** Honour id → when it was earned (ms). */
  got: Record<string, number>;
};

export type Honour = {
  id: string;
  name: string;
  /** What to do, as the player reads it. */
  goal: string;
  /** The title this honour lets the adept wear. */
  title: string;
  /** Hidden until earned (the secret codes). */
  secret?: boolean;
  /** Progress toward the goal: [have, need]. */
  progress: (p: Profile) => [number, number];
};

const stat = (p: Profile, k: string) => Math.max(0, Math.floor(p.ach?.stats[k] ?? 0));
const setOf = (p: Profile, k: string) => p.ach?.sets[k] ?? [];
const has = (p: Profile, k: string, v: string) => setOf(p, k).includes(v);
const count = (p: Profile, k: string, need: number): [number, number] => [Math.min(stat(p, k), need), need];
const distinctOwned = (p: Profile) => new Set(p.collection).size;
const foilTotal = (p: Profile) => Object.values(p.foils ?? {}).reduce((a, b) => a + b, 0);
const bool = (b: boolean): [number, number] => [b ? 1 : 0, 1];

export const HONOURS: readonly Honour[] = [
  { id: 'first_win', name: 'The First Rite', goal: 'Win a match.', title: 'Initiate of the Circle', progress: (p) => count(p, 'wins', 1) },
  { id: 'wins_10', name: 'Ten Circles Closed', goal: 'Win 10 matches.', title: 'Veteran of the Circle', progress: (p) => count(p, 'wins', 10) },
  { id: 'wins_50', name: 'Fifty Circles Closed', goal: 'Win 50 matches.', title: 'Master of the Circle', progress: (p) => count(p, 'wins', 50) },
  { id: 'slay_100', name: 'The Hundred Slain', goal: 'Destroy 100 enemy units.', title: 'Grand Inquisitor', progress: (p) => count(p, 'slain', 100) },
  { id: 'slay_500', name: 'The Long Harvest', goal: 'Destroy 500 enemy units.', title: 'Witch-Finder General', progress: (p) => count(p, 'slain', 500) },
  { id: 'cast_100', name: 'A Hundred Workings', goal: 'Cast 100 rites or devices.', title: 'Thaumaturge', progress: (p) => count(p, 'cast', 100) },
  { id: 'conquer_100', name: 'Lord of Circles', goal: 'Conquer 100 circles.', title: 'Lord of the Circles', progress: (p) => count(p, 'conquer', 100) },
  { id: 'leader_50', name: 'The Leader Speaks', goal: "Use a leader's power 50 times.", title: 'Voice of the Order', progress: (p) => count(p, 'leader', 50) },
  { id: 'storm_win', name: 'Stormer of Gates', goal: 'Win by taking the enemy stronghold.', title: 'Stormer of Gates', progress: (p) => count(p, 'stormWins', 1) },
  { id: 'dom_win', name: 'Dominion', goal: 'Win by Domination.', title: 'Dominus', progress: (p) => count(p, 'domWins', 1) },
  {
    id: 'every_order',
    name: 'Every Order Sworn',
    goal: 'Win with each of the six First Hour orders.',
    title: 'Grand Hierophant',
    progress: (p) => [FIRST_HOUR_ORDERS.filter((o) => has(p, 'orderWins', o)).length, FIRST_HOUR_ORDERS.length],
  },
  { id: 'sealed_win', name: 'The Seal Holds', goal: 'Win a Sealed Century match.', title: 'Keeper of the Sealed Century', progress: (p) => count(p, 'sealedWins', 1) },
  {
    id: 'sealed_all',
    name: 'The Four Old Orders',
    goal: 'Win with each of the four Sealed Century orders.',
    title: 'Magister of the Old Work',
    progress: (p) => [SEALED_CENTURY_ORDERS.filter((o) => has(p, 'orderWins', o)).length, SEALED_CENTURY_ORDERS.length],
  },
  { id: 'second_win', name: 'The Hour After', goal: 'Win a match in the Hour After.', title: 'Watcher of the Hour After', secret: true, progress: (p) => count(p, 'secondWins', 1) },
  { id: 'campaign', name: 'Out of the Leaden Hour', goal: 'Reach an ending of the Leaden Hour.', title: 'Survivor of the Leaden Hour', progress: (p) => bool((p.campaign?.endings?.length ?? 0) > 0) },
  { id: 'pvp_win', name: 'A Live Table', goal: 'Win a Friend Working match.', title: 'Duellist', progress: (p) => count(p, 'pvpWins', 1) },
  { id: 'pvp_10', name: 'Champion of the Table', goal: 'Win 10 Friend Working matches.', title: 'Champion of the Table', progress: (p) => count(p, 'pvpWins', 10) },
  { id: 'cryptid_1', name: 'A Sighting', goal: 'Sight a cryptid on the field.', title: 'Seeker of Strange Beasts', progress: (p) => [Math.min(setOf(p, 'cryptids').length, 1), 1] },
  { id: 'cryptid_10', name: 'The Bestiary', goal: 'Sight 10 different cryptids.', title: 'Keeper of the Bestiary', progress: (p) => [Math.min(setOf(p, 'cryptids').length, 10), 10] },
  { id: 'packs_10', name: 'Breaker of Seals', goal: 'Open 10 sealed envelopes.', title: 'Breaker of Seals', progress: (p) => count(p, 'packs', 10) },
  { id: 'foil_1', name: 'A Gilded Plate', goal: 'Pull a foil plate.', title: 'The Gilded Hand', progress: (p) => [Math.min(foilTotal(p), 1), 1] },
  { id: 'foil_10', name: 'Emerald Cabinet', goal: 'Own 10 foil plates.', title: 'Curator of the Emerald Cabinet', progress: (p) => [Math.min(foilTotal(p), 10), 10] },
  { id: 'collect_100', name: 'The Archive', goal: 'Own 100 different plates.', title: 'Archivist', progress: (p) => [Math.min(distinctOwned(p), 100), 100] },
  { id: 'codex_150', name: 'The Open Codex', goal: 'Fill 150 pages of the Codex.', title: 'Keeper of the Codex', progress: (p) => [Math.min(codexCount(p), 150), 150] },
  { id: 'level_10', name: 'Adept', goal: 'Reach level 10.', title: 'Adept of the Tenth Degree', progress: (p) => [Math.min(levelFromXp(p.xp).level, 10), 10] },
  // ── Secret honours: hidden until earned ──
  { id: 'secret_hour', name: 'The Second Hour', goal: 'Speak the name that opens the hour after.', title: 'One Who Heard the Hour', secret: true, progress: () => bool(readHourOpen()) },
  { id: 'secret_gadget', name: 'Trinity', goal: 'Set off the gadget.', title: 'Destroyer of Worlds', secret: true, progress: (p) => bool(has(p, 'secrets', 'gadget')) },
  { id: 'secret_justin', name: 'The Hidden Adept', goal: 'Call Justin Kern to the circle.', title: 'Witness of the Hidden Adept', secret: true, progress: (p) => bool(has(p, 'secrets', 'justin_kern')) },
  { id: 'secret_seth', name: 'The Chief', goal: 'Call Seth Kern to the circle.', title: 'Friend of the Chief', secret: true, progress: (p) => bool(has(p, 'secrets', 'seth_kern')) },
  { id: 'secret_dispatch', name: 'Sirens Up', goal: 'Call South Haven Dispatch.', title: 'On the Night Shift', secret: true, progress: (p) => bool(has(p, 'secrets', 'south_haven_dispatch')) },
  { id: 'secret_crash', name: 'Black Monday', goal: 'Lose, and let the ticker remember it.', title: 'Survivor of the Crash', secret: true, progress: (p) => bool(p.collection.includes('black_monday')) },
];

export const HONOUR_BY_ID: Record<string, Honour> = Object.fromEntries(HONOURS.map((h) => [h.id, h]));
/** Every title any honour grants (the server keeps the same list). */
export const ALL_TITLES: readonly string[] = HONOURS.map((h) => h.title);

export function emptyAch(): AchState {
  return { stats: {}, sets: {}, got: {} };
}

/** Old saves have no honours yet; keep only sane values. */
export function migrateAch(raw: unknown): AchState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<AchState>;
  const out = emptyAch();
  for (const [k, v] of Object.entries(r.stats ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out.stats[k] = Math.max(0, Math.min(1e7, Math.floor(v)));
  }
  for (const [k, v] of Object.entries(r.sets ?? {})) {
    if (Array.isArray(v)) out.sets[k] = [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 64)))].slice(0, 400);
  }
  for (const [k, v] of Object.entries(r.got ?? {})) {
    if (HONOUR_BY_ID[k] && typeof v === 'number' && Number.isFinite(v)) out.got[k] = v;
  }
  return out;
}

export function migrateTitle(raw: unknown): string | undefined {
  return typeof raw === 'string' && ALL_TITLES.includes(raw) ? raw : undefined;
}

function bump(a: AchState, k: string, n: number): void {
  if (n > 0) a.stats[k] = (a.stats[k] ?? 0) + n;
}
function addTo(a: AchState, k: string, v: string): void {
  const s = a.sets[k] ?? [];
  if (!s.includes(v)) a.sets[k] = [...s, v];
}
function clone(p: Profile): AchState {
  const a = p.ach ?? emptyAch();
  return { stats: { ...a.stats }, sets: { ...a.sets }, got: { ...a.got } };
}

/** Earn every honour now met (never takes one away). */
export function settleHonours(p: Profile, now = Date.now()): Profile {
  const a = p.ach ?? emptyAch();
  let got: Record<string, number> | null = null;
  for (const h of HONOURS) {
    if (a.got[h.id]) continue;
    const [have, need] = h.progress(p);
    if (have >= need) {
      got = got ?? { ...a.got };
      got[h.id] = now;
    }
  }
  return got ? { ...p, ach: { ...a, got } } : p;
}

export type MatchNote = {
  mode: string;
  /** How the match ended (stronghold / dominance / yield), when known. */
  kind?: string;
};

/** Fold one match into the honours (finished or left part-way). */
export function noteMatch(p: Profile, t: MatchTally, note: MatchNote): Profile {
  if (note.mode === 'hotseat') return p;
  const a = clone(p);
  bump(a, 'slain', t.destroy);
  bump(a, 'cast', t.cast);
  bump(a, 'conquer', t.conquer);
  bump(a, 'leader', t.leader);
  if (t.finished) bump(a, 'matches', 1);
  if (t.finished && t.won) {
    bump(a, 'wins', 1);
    if (t.faction) addTo(a, 'orderWins', t.faction);
    if (note.mode === 'old' || isSealedCenturyOrder(t.faction)) bump(a, 'sealedWins', 1);
    if (note.mode === 'second' || isSecondHourSociety(t.faction)) bump(a, 'secondWins', 1);
    if (note.mode === 'friend') bump(a, 'pvpWins', 1);
    if (note.kind === 'stronghold') bump(a, 'stormWins', 1);
    if (note.kind === 'dominance') bump(a, 'domWins', 1);
  }
  return settleHonours({ ...p, ach: a });
}

/** A sealed envelope opened (a broken seal or a counter purchase). */
export function notePack(p: Profile, kind: 'seal' | 'counter'): Profile {
  const a = clone(p);
  bump(a, 'packs', 1);
  bump(a, kind === 'seal' ? 'seals' : 'buys', 1);
  return settleHonours({ ...p, ach: a });
}

/** A cryptid was sighted on the field. */
export function noteSighting(p: Profile, name: string): Profile {
  if (setOf(p, 'cryptids').includes(name)) return p;
  const a = clone(p);
  addTo(a, 'cryptids', name);
  return settleHonours({ ...p, ach: a });
}

/** A secret answered (the gadget, a code plate on the field). */
export function noteSecret(p: Profile, id: string): Profile {
  if (has(p, 'secrets', id)) return p;
  const a = clone(p);
  addTo(a, 'secrets', id);
  return settleHonours({ ...p, ach: a });
}

/** Wear a title (only one the adept has earned), or none. */
export function chooseTitle(p: Profile, title: string | null): Profile {
  if (title === null) return { ...p, title: undefined };
  const ok = HONOURS.some((h) => h.title === title && p.ach?.got[h.id]);
  return ok ? { ...p, title } : p;
}

/** The titles this adept may wear. */
export function earnedTitles(p: Profile): string[] {
  return HONOURS.filter((h) => p.ach?.got[h.id]).map((h) => h.title);
}

/* ── Events: screens that do not hold the profile announce what happened ── */

export const ACH_EVENT = 'ow:honour-note';
export type AchNoteDetail =
  | { kind: 'sighting'; name: string }
  | { kind: 'secret'; id: string }
  | { kind: 'encounter'; ids: string[] };

export function announce(detail: AchNoteDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<AchNoteDetail>(ACH_EVENT, { detail }));
  } catch {
    /* old browser */
  }
}
