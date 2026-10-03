import { describe, expect, it } from 'vitest';
import { ALL_TITLES, HONOURS, chooseTitle, noteMatch, notePack, settleHonours } from './achievements';
import { TITLES } from '../../api/_lib/titles';
import { defaultProfile, migrateProfile } from './profile';
import { emptyTally } from './dailyRites';
import { CODEX_CARDS, codexOpen } from './codexUnlock';
import { CARDS } from '../data/catalog';

describe('honours and titles', () => {
  it('the server title list matches the honours', () => {
    expect([...TITLES]).toEqual([...ALL_TITLES]);
    expect(HONOURS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(HONOURS.map((h) => h.id)).size).toBe(HONOURS.length);
  });

  it('a won match counts, a passed grimoire does not', () => {
    const t = { ...emptyTally('The Vril Syndicate'), destroy: 4, finished: true, won: true };
    const p = noteMatch(defaultProfile(), t, { mode: 'training' });
    expect(p.ach?.stats.slain).toBe(4);
    expect(p.ach?.got.first_win).toBeTruthy();
    const h = noteMatch(defaultProfile(), t, { mode: 'hotseat' });
    expect(h.ach).toBeUndefined();
  });

  it('only an earned title can be worn, and it survives migration', () => {
    let p = defaultProfile();
    p = chooseTitle(p, 'Grand Inquisitor');
    expect(p.title).toBeUndefined();
    for (let i = 0; i < 10; i++) p = notePack(p, 'seal');
    p = chooseTitle(p, 'Breaker of Seals');
    expect(p.title).toBe('Breaker of Seals');
    const back = migrateProfile(JSON.parse(JSON.stringify(p)));
    expect(back.title).toBe('Breaker of Seals');
    expect(back.ach?.stats.packs).toBe(10);
  });

  it('settling is idempotent', () => {
    const p = settleHonours(defaultProfile());
    expect(settleHonours(p)).toBe(p);
  });
});

describe('codex', () => {
  it('never has a page for Justin or Seth Kern', () => {
    expect(CODEX_CARDS.some((c) => c.id === 'justin_kern' || c.id === 'seth_kern')).toBe(false);
    const p = { ...defaultProfile(), collection: ['justin_kern', 'seth_kern'], codex: ['justin_kern'] };
    const jk = CARDS.find((c) => c.id === 'justin_kern');
    if (jk) expect(codexOpen(p, jk)).toBe(false);
  });

  it('cryptids stay shut until sighted', () => {
    const c = CARDS.find((x) => x.keywords.includes('cryptid'))!;
    const p = { ...defaultProfile(), collection: [c.id] };
    expect(codexOpen(p, c)).toBe(false);
    expect(codexOpen({ ...p, codex: [c.id] }, c)).toBe(true);
  });
});
