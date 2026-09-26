import { describe, expect, it, beforeEach } from 'vitest';
import {
  ATHENS_CODE,
  BATTLE_COUNT_CODE,
  FORCE_SIGHTING_KEY,
  HOUR_OPEN_KEY,
  OPPENHEIMER_CODE,
  PENDING_JUSTIN_HAND_KEY,
  PENDING_SETH_HAND_KEY,
  SECOND_HOUR_CODE,
  bootHourOpen,
  clearForceSighting,
  clearPendingJustinHand,
  clearPendingSethHand,
  isAthensCode,
  isBattleCountCode,
  isCodePrefix,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSecondHourCode,
  isSethKernCode,
  normalizeCode,
  readForceSighting,
  readHourOpen,
  readPendingJustinHand,
  readPendingSethHand,
  writeForceSighting,
  writeHourOpen,
  writePendingJustinHand,
  writePendingSethHand,
} from './hourUnlock';

const local = new Map<string, string>();
const session = new Map<string, string>();

beforeEach(() => {
  local.clear();
  session.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (local.has(k) ? local.get(k)! : null),
      setItem: (k: string, v: string) => {
        local.set(k, String(v));
      },
      clear: () => local.clear(),
      removeItem: (k: string) => {
        local.delete(k);
      },
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (session.has(k) ? session.get(k)! : null),
      setItem: (k: string, v: string) => {
        session.set(k, String(v));
      },
      clear: () => session.clear(),
      removeItem: (k: string) => {
        session.delete(k);
      },
    },
  });
});

describe('hourUnlock / occultist codes', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeCode('  The  Second   Hour ')).toBe(SECOND_HOUR_CODE);
    expect(isSecondHourCode('  The Second Hour  ')).toBe(true);
    expect(isBattleCountCode('Battle  Count')).toBe(true);
    expect(isAthensCode('ATHENS OHIO')).toBe(true);
    expect(isOppenheimerCode('Oppenheimer')).toBe(true);
    expect(isOppenheimerCode('  OPPENHEIMER ')).toBe(true);
  });

  it('recognizes adept and seth codes', () => {
    expect(isHiddenAdeptCode('911911')).toBe(true);
    expect(isHiddenAdeptCode(' 911911 ')).toBe(true);
    expect(isHiddenAdeptCode('911912')).toBe(false);
    expect(isSethKernCode('Seth Kern')).toBe(true);
    expect(isSethKernCode('seth kern')).toBe(true);
  });

  it('detects strict prefixes (Mi)', () => {
    expect(isCodePrefix('the sec')).toBe(true);
    expect(isCodePrefix('battle')).toBe(true);
    expect(isCodePrefix('athens')).toBe(true);
    expect(isCodePrefix('oppen')).toBe(true);
    expect(isCodePrefix(SECOND_HOUR_CODE)).toBe(false);
    expect(isCodePrefix(BATTLE_COUNT_CODE)).toBe(false);
    expect(isCodePrefix(ATHENS_CODE)).toBe(false);
    expect(isCodePrefix(OPPENHEIMER_CODE)).toBe(false);
    expect(isCodePrefix('')).toBe(false);
    expect(isCodePrefix('Adept')).toBe(false);
  });

  it('persists hour-open and boots', () => {
    expect(readHourOpen()).toBe(false);
    writeHourOpen();
    expect(local.get(HOUR_OPEN_KEY)).toBe('1');
    expect(bootHourOpen('Adept')).toBe(true);
  });

  it('force sighting is one-shot in sessionStorage', () => {
    expect(readForceSighting()).toBe(false);
    writeForceSighting();
    expect(session.get(FORCE_SIGHTING_KEY)).toBe('1');
    expect(readForceSighting()).toBe(true);
    clearForceSighting();
    expect(readForceSighting()).toBe(false);
  });

  it('pending justin hand flag', () => {
    expect(readPendingJustinHand()).toBe(false);
    writePendingJustinHand();
    expect(session.get(PENDING_JUSTIN_HAND_KEY)).toBe('1');
    clearPendingJustinHand();
    expect(readPendingJustinHand()).toBe(false);
  });

  it('pending seth hand flag', () => {
    expect(readPendingSethHand()).toBe(false);
    writePendingSethHand();
    expect(session.get(PENDING_SETH_HAND_KEY)).toBe('1');
    clearPendingSethHand();
    expect(readPendingSethHand()).toBe(false);
  });
});
