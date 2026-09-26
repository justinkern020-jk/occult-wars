/** Second Hour unlock — matches grok.me Ei / Ti / ki(). */

export const HOUR_OPEN_KEY = 'occult-wars.hour-open';
export const SECOND_HOUR_CODE = 'the second hour';

export function isSecondHourCode(name: string): boolean {
  return name.trim().toLowerCase() === SECOND_HOUR_CODE;
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
