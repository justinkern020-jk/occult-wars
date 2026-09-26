import { describe, expect, it, beforeEach } from 'vitest';
import {
  HOUR_OPEN_KEY,
  SECOND_HOUR_CODE,
  bootHourOpen,
  isSecondHourCode,
  readHourOpen,
  writeHourOpen,
} from './hourUnlock';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      clear: () => store.clear(),
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
});

describe('hourUnlock', () => {
  it('recognizes the second hour code', () => {
    expect(isSecondHourCode('the second hour')).toBe(true);
    expect(isSecondHourCode('  The Second Hour  ')).toBe(true);
    expect(isSecondHourCode('Adept')).toBe(false);
  });

  it('persists unlock flag', () => {
    expect(readHourOpen()).toBe(false);
    writeHourOpen();
    expect(store.get(HOUR_OPEN_KEY)).toBe('1');
    expect(readHourOpen()).toBe(true);
  });

  it('boots open from storage or code username', () => {
    expect(bootHourOpen('Adept')).toBe(false);
    expect(bootHourOpen(SECOND_HOUR_CODE)).toBe(true);
    expect(readHourOpen()).toBe(true);
    store.clear();
    writeHourOpen();
    expect(bootHourOpen('Adept')).toBe(true);
  });
});
