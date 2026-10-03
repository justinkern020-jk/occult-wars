/**
 * Foil plates: a per-copy flag. A profile keeps how many of its copies of a
 * plate are foil (`foils[id]`, never more than the copies owned). Shop pulls
 * (a broken seal or a counter purchase) roll FOIL_CHANCE each; plates owned
 * before foils existed stay plain.
 */

/** About one pull in twelve comes out foil. */
export const FOIL_CHANCE = 1 / 12;

export function rollFoil(rand: () => number = Math.random): boolean {
  return rand() < FOIL_CHANCE;
}

export type FoilBook = Record<string, number>;

/** Foil copies owned of one plate. */
export function foilCount(foils: FoilBook | undefined, id: string): number {
  return Math.max(0, Math.floor(foils?.[id] ?? 0));
}

/** Add foil copies (ids may repeat). */
export function addFoils(foils: FoilBook | undefined, ids: string[]): FoilBook {
  const out: FoilBook = { ...(foils ?? {}) };
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** Keep only sane counts, never more than the copies in the collection. */
export function migrateFoils(raw: unknown, collection: string[]): FoilBook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const owned: Record<string, number> = {};
  for (const id of collection) owned[id] = (owned[id] ?? 0) + 1;
  const out: FoilBook = {};
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof n !== 'number' || !Number.isFinite(n)) continue;
    const k = Math.min(Math.floor(n), owned[id] ?? 0);
    if (k > 0) out[id] = k;
  }
  return out;
}

/**
 * Which copies in a list (a hand, a working) shine: the first `foils[id]`
 * copies of each plate. Returns a parallel boolean array.
 */
export function foilMask(ids: string[], foils: FoilBook | undefined): boolean[] {
  const seen: Record<string, number> = {};
  return ids.map((id) => {
    const i = seen[id] ?? 0;
    seen[id] = i + 1;
    return i < foilCount(foils, id);
  });
}
