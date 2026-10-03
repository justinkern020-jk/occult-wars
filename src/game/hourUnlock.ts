/** Occultist name codes — matches grok.me Ei/Di/Oi/Ti/Mi/me/he + Oppenheimer. */

export const HOUR_OPEN_KEY = 'occult-wars.hour-open';
export const FORCE_SIGHTING_KEY = 'occult-wars.force-sighting';
export const PENDING_JUSTIN_HAND_KEY = 'occult-wars.pending-justin-hand';
export const PENDING_SETH_HAND_KEY = 'occult-wars.pending-seth-hand';
export const PENDING_SOUTH_HAVEN_HAND_KEY = 'occult-wars.pending-south-haven-hand';

export const SECOND_HOUR_CODE = 'the second hour';
export const BATTLE_COUNT_CODE = 'battle count';
export const ATHENS_CODE = 'athens ohio';
export const OPPENHEIMER_CODE = 'oppenheimer';

const PHRASE_CODES = [
  SECOND_HOUR_CODE,
  BATTLE_COUNT_CODE,
  ATHENS_CODE,
  OPPENHEIMER_CODE,
] as const;

/** Trim, lower-case, collapse internal whitespace. */
export function normalizeCode(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isSecondHourCode(name: string): boolean {
  return normalizeCode(name) === SECOND_HOUR_CODE;
}

export function isBattleCountCode(name: string): boolean {
  return normalizeCode(name) === BATTLE_COUNT_CODE;
}

export function isAthensCode(name: string): boolean {
  return normalizeCode(name) === ATHENS_CODE;
}

export function isOppenheimerCode(name: string): boolean {
  return normalizeCode(name) === OPPENHEIMER_CODE;
}

/** True while typing a strict prefix of a phrase code (Mi). */
export function isCodePrefix(name: string): boolean {
  const t = normalizeCode(name);
  if (!t) return false;
  if (PHRASE_CODES.some((code) => code.startsWith(t) && t !== code)) return true;
  const stripped = stripCodeChars(name);
  if (!stripped) return false;
  const sh = 'southhavenpolicedepartment';
  return sh.startsWith(stripped) && stripped !== sh;
}

/** Username trim === `911911` (exact digits). */
export function isHiddenAdeptCode(name: string): boolean {
  return name.trim() === '911911';
}

export function isSethKernCode(name: string): boolean {
  return name.trim().toLowerCase() === 'seth kern';
}

/** Strip to alphanumerics for codes that ignore spaces/punctuation. */
export function stripCodeChars(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** SouthHavenPoliceDepartment — case-insensitive; ignore spaces/punctuation. */
export function isSouthHavenPdCode(name: string): boolean {
  return stripCodeChars(name) === 'southhavenpolicedepartment';
}

export function readHourOpen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(HOUR_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHourOpen(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HOUR_OPEN_KEY, '1');
  } catch {
    /* quota */
  }
}

/** Boot: unlock if storage flag is set or the stored username is the code. */
export function bootHourOpen(username: string): boolean {
  if (isSecondHourCode(username) || readHourOpen()) {
    writeHourOpen();
    return true;
  }
  return false;
}

function sessionFlag(key: string): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem(key) === '1') return true;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) === '1';
    }
  } catch {
    /* private mode */
  }
  return false;
}

function writeSessionFlag(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, '1');
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, '1');
    }
  } catch {
    /* quota */
  }
}

function clearSessionFlag(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    /* private mode */
  }
}

export function readForceSighting(): boolean {
  return sessionFlag(FORCE_SIGHTING_KEY);
}

export function writeForceSighting(): void {
  writeSessionFlag(FORCE_SIGHTING_KEY);
}

export function clearForceSighting(): void {
  clearSessionFlag(FORCE_SIGHTING_KEY);
}

/** Menu Oppenheimer: drop Justin into Azure hand on next match boot. */
export function readPendingJustinHand(): boolean {
  return sessionFlag(PENDING_JUSTIN_HAND_KEY);
}

export function writePendingJustinHand(): void {
  writeSessionFlag(PENDING_JUSTIN_HAND_KEY);
}

export function clearPendingJustinHand(): void {
  clearSessionFlag(PENDING_JUSTIN_HAND_KEY);
}

/** Menu Seth Kern: drop Seth into Azure hand on next match boot. */
export function readPendingSethHand(): boolean {
  return sessionFlag(PENDING_SETH_HAND_KEY);
}

export function writePendingSethHand(): void {
  writeSessionFlag(PENDING_SETH_HAND_KEY);
}

export function clearPendingSethHand(): void {
  clearSessionFlag(PENDING_SETH_HAND_KEY);
}

/** Menu South Haven PD: drop Dispatch rite into Azure hand on next match boot. */
export function readPendingSouthHavenHand(): boolean {
  return sessionFlag(PENDING_SOUTH_HAVEN_HAND_KEY);
}

export function writePendingSouthHavenHand(): void {
  writeSessionFlag(PENDING_SOUTH_HAVEN_HAND_KEY);
}

export function clearPendingSouthHavenHand(): void {
  clearSessionFlag(PENDING_SOUTH_HAVEN_HAND_KEY);
}

/**
 * Secret hand-drop plate answered by a typed code (menu → next circle, or
 * mid-match → straight into hand). Never a collection / working plate.
 */
export function secretDropCardId(
  name: string,
): 'justin_kern' | 'seth_kern' | 'south_haven_dispatch' | null {
  if (isOppenheimerCode(name) || isHiddenAdeptCode(name)) return 'justin_kern';
  if (isSethKernCode(name)) return 'seth_kern';
  if (isSouthHavenPdCode(name)) return 'south_haven_dispatch';
  return null;
}
