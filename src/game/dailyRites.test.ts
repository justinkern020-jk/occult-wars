import { describe, expect, it } from 'vitest';
import {
  applyTally,
  emptyTally,
  ensureDaily,
  levelFromXp,
  matchXp,
  migrateDaily,
  riteLabel,
  ritesForDay,
} from './dailyRites';
import { claimRite, defaultProfile, migrateProfile, recordMatchTally, withDaily } from './profile';

const sworn = ['The Mercury Works', 'The Vril Syndicate'];

describe('the Day\'s Rites', () => {
  it('three distinct rites per day, stable through the day, new the next', () => {
    const a = ritesForDay('2026-10-03', sworn);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((r) => r.kind)).size).toBe(3);
    expect(ritesForDay('2026-10-03', sworn)).toEqual(a);
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 4).padStart(2, '0')}`);
    expect(days.some((d) => JSON.stringify(ritesForDay(d, sworn).map((r) => r.kind)) !== JSON.stringify(a.map((r) => r.kind)))).toBe(true);
    for (const d of days) {
      const k = ritesForDay(d, sworn).map((r) => r.kind);
      expect(k.includes('win') && k.includes('win_faction')).toBe(false);
    }
  });

  it('a "win with" rite names only a sworn order (never with none sworn)', () => {
    for (let i = 1; i <= 28; i++) {
      const d = `2026-02-${String(i).padStart(2, '0')}`;
      for (const r of ritesForDay(d, sworn)) if (r.kind === 'win_faction') expect(sworn).toContain(r.faction);
      expect(ritesForDay(d, []).some((r) => r.kind === 'win_faction')).toBe(false);
    }
    expect(riteLabel({ kind: 'win_faction', goal: 1, faction: 'The Mercury Works' })).toBe('Win with a Mercury Works working');
  });

  it('tallies progress; touched wins count for nothing win-shaped', () => {
    const daily = {
      day: '2026-10-03',
      rites: [
        { id: 'a', kind: 'win_faction' as const, goal: 1, reward: 40, faction: 'The Mercury Works', progress: 0, claimed: false },
        { id: 'b', kind: 'cast' as const, goal: 5, reward: 25, progress: 0, claimed: false },
        { id: 'c', kind: 'destroy' as const, goal: 10, reward: 30, progress: 0, claimed: false },
      ],
    };
    const touched = { ...emptyTally('The Mercury Works'), cast: 3, destroy: 4, finished: true, won: true, touched: true };
    let d = applyTally(daily, touched);
    expect(d.rites.map((r) => r.progress)).toEqual([0, 3, 4]);
    expect(matchXp(touched)).toBe(40 + 4 * 2 + 3);
    d = applyTally(d, { ...touched, touched: false, cast: 9, destroy: 9 });
    expect(d.rites.map((r) => r.progress)).toEqual([1, 5, 10]);
    const other = applyTally(daily, { ...touched, touched: false, faction: 'The Vril Syndicate' });
    expect(other.rites[0].progress).toBe(0);
  });

  it('levels rise with XP', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 150 });
    expect(levelFromXp(150).level).toBe(2);
    expect(levelFromXp(150 + 225).level).toBe(3);
  });

  it('profile: rolls over, records, claims once, survives migration', () => {
    const p0 = { ...defaultProfile(), allegiance: 'The Vril Syndicate' as const };
    const p1 = withDaily(p0, '2026-10-03');
    expect(p1.daily?.day).toBe('2026-10-03');
    expect(withDaily(p1, '2026-10-03')).toBe(p1);
    expect(withDaily(p1, '2026-10-04').daily?.day).toBe('2026-10-04');
    const big = { ...emptyTally('The Vril Syndicate'), cast: 50, destroy: 50, muster: 50, conquer: 50, damage: 99, leader: 9, finished: true, won: true };
    let p2 = p1;
    for (let i = 0; i < 3; i++) p2 = recordMatchTally(p2, big, '2026-10-03');
    expect(p2.xp).toBeGreaterThan(0);
    const r = p2.daily!.rites[0];
    expect(r.progress).toBe(r.goal);
    const c1 = claimRite(p2, r.id);
    expect(c1.granted).toBe(r.reward);
    expect(c1.profile.alchemicalShards).toBe(p2.alchemicalShards + r.reward);
    expect(claimRite(c1.profile, r.id).granted).toBe(0);
    const back = migrateProfile(JSON.parse(JSON.stringify(c1.profile)));
    expect(back.xp).toBe(c1.profile.xp);
    expect(back.daily).toEqual(c1.profile.daily);
    expect(migrateDaily({ day: 'x', rites: [] })).toBeNull();
    expect(ensureDaily(null, [], '2026-10-03').rites).toHaveLength(3);
  });
});
