/**
 * Small local preferences (this device only): leader voices, weather on the
 * field, the swelling battle choir. Kept apart from the profile so a cloud
 * copy never flips another device's sound.
 */
import { useEffect, useState } from 'react';

export type Settings = {
  /** Leader barks (gramophone voice lines + subtitles). */
  voice: boolean;
  /** Weather and time of day over the field. */
  weather: boolean;
  /** The choir layer that swells when a match tips. */
  choir: boolean;
};

export const SETTINGS_KEY = 'occult-wars.settings.v1';
const SETTINGS_EVENT = 'ow:settings';
const DEFAULTS: Settings = { voice: true, weather: true, choir: true };

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return {
      voice: typeof raw.voice === 'boolean' ? raw.voice : DEFAULTS.voice,
      weather: typeof raw.weather === 'boolean' ? raw.weather : DEFAULTS.weather,
      choir: typeof raw.choir === 'boolean' ? raw.choir : DEFAULTS.choir,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const next = { ...readSettings(), [key]: value };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* private mode: this visit only */
  }
  memo = next;
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

let memo: Settings | null = null;
/** Fast read for audio paths (no JSON parse per call). */
export function setting<K extends keyof Settings>(key: K): Settings[K] {
  if (!memo) memo = readSettings();
  return memo[key];
}

export function useSettings(): Settings {
  const [s, setS] = useState(readSettings);
  useEffect(() => {
    const on = () => setS(readSettings());
    window.addEventListener(SETTINGS_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return s;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
