import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  combatantFrom,
  incomingDamage,
  resolveMelee,
} from './combat';

describe('Cabals dual-Power combat', () => {
  it('Power deals equal to current Power and damage permanently reduces Power', () => {
    const u = combatantFrom({ name: 'Lamp Bearer', power: 4 });
    const lost = applyDamage(u, 2);
    expect(lost).toBe(2);
    expect(u.power).toBe(2);
  });

  it('Power ≤ 0 destroys', () => {
    const u = combatantFrom({ name: 'Static Child', power: 2 });
    applyDamage(u, 2);
    expect(u.power).toBe(0);
    const r = resolveMelee(
      combatantFrom({ name: 'A', power: 5 }),
      combatantFrom({ name: 'B', power: 2 }),
    );
    // Normal simultaneous: A deals 5, B deals 2 → A=3, B dead
    expect(r.defenderDestroyed).toBe(true);
    expect(r.attacker.power).toBe(3);
  });

  it('Normal: simultaneous mutual damage at current Power', () => {
    const r = resolveMelee(
      combatantFrom({ name: 'Roof Warden', power: 3 }),
      combatantFrom({ name: 'Mud Pallbearer', power: 4 }),
    );
    expect(r.mode).toBe('normal');
    // Both deal full pre-strike Power
    expect(r.attacker.power).toBe(0); // 3 - 4
    expect(r.defender.power).toBe(1); // 4 - 3
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defenderDestroyed).toBe(false);
  });

  it('Fast Attack: strikes first; killing blow is not answered', () => {
    const r = resolveMelee(
      combatantFrom({
        name: 'Static Child',
        power: 2,
        keywords: ['fast'],
      }),
      combatantFrom({ name: 'Tide Clerk', power: 2 }),
    );
    expect(r.mode).toBe('fast');
    expect(r.defenderDestroyed).toBe(true);
    expect(r.attacker.power).toBe(2); // no return damage
    expect(r.attackerDestroyed).toBe(false);
  });

  it('Fast Attack: survivor answers with reduced Power', () => {
    const r = resolveMelee(
      combatantFrom({
        name: 'Gyro Rocketeer',
        power: 2,
        keywords: ['fast'],
      }),
      combatantFrom({ name: 'Sandbag Saint', power: 5 }),
    );
    expect(r.mode).toBe('fast');
    // Saint takes 2 → Power 3, answers for 3
    expect(r.defender.power).toBe(3);
    expect(r.attacker.power).toBe(0);
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defenderDestroyed).toBe(false);
  });

  it('Slow Attack: opponent deals first; Slow deals reduced Power if it survives', () => {
    const r = resolveMelee(
      combatantFrom({
        name: 'Lead Golem Slow',
        power: 6,
        keywords: ['slow'],
      }),
      combatantFrom({ name: 'Blackout Captain', power: 4 }),
    );
    expect(r.mode).toBe('slow');
    // Defender deals 4 first → Golem Power 2, then Golem deals 2
    expect(r.attacker.power).toBe(2);
    expect(r.defender.power).toBe(2);
    expect(r.attackerDestroyed).toBe(false);
    expect(r.defenderDestroyed).toBe(false);
  });

  it('Slow Attack: destroyed before delivering blow', () => {
    const r = resolveMelee(
      combatantFrom({
        name: 'Glass Homunculus Slow',
        power: 2,
        keywords: ['slow'],
      }),
      combatantFrom({ name: 'Pilings Brute', power: 5 }),
    );
    expect(r.mode).toBe('slow');
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defender.power).toBe(5); // never chipped
  });

  it('Chipping Power before melee reduces return damage (Fast path)', () => {
    // Equivalent: Fast 3 into Power 4 → answers with 1
    const r = resolveMelee(
      combatantFrom({ name: 'Chipper', power: 3, keywords: ['fast'] }),
      combatantFrom({ name: 'Tank', power: 4 }),
    );
    expect(r.defender.power).toBe(1);
    expect(r.attacker.power).toBe(2); // took 1 back
  });

  it('Toughness refuses the first point of a strike', () => {
    expect(
      incomingDamage(
        combatantFrom({ name: 'Sandbag', power: 5, keywords: ['tough'] }),
        3,
      ),
    ).toBe(2);
    const r = resolveMelee(
      combatantFrom({ name: 'Hitter', power: 3 }),
      combatantFrom({ name: 'Sandbag Saint', power: 5, keywords: ['tough'] }),
    );
    // Simultaneous: Saint soaks 1 of 3 → takes 2 → Power 3; Hitter takes full 5 → dead
    expect(r.defender.power).toBe(3);
    expect(r.attackerDestroyed).toBe(true);
  });

  it('non-Fast attacker vs Fast defender: Fast defender strikes first; lethal means no return', () => {
    // Heath Maiden (bolstered to 3) walks into Foo Fighter (P3 Fast) —
    // must NOT mutual-kill: Foo strikes first and Heath dies unanswered.
    const r = resolveMelee(
      combatantFrom({ name: 'Heath Maiden', power: 3 }),
      combatantFrom({
        name: 'Foo Fighter',
        power: 3,
        keywords: ['cryptid', 'fast'],
      }),
    );
    expect(r.mode).toBe('slow'); // defender wins initiative
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defenderDestroyed).toBe(false);
    expect(r.defender.power).toBe(3); // no return damage
  });

  it('Fast attacker vs non-Fast: Fast lives when blow is lethal (no mutual kill)', () => {
    const r = resolveMelee(
      combatantFrom({
        name: 'Foo Fighter',
        power: 3,
        keywords: ['fast'],
      }),
      combatantFrom({ name: 'Heath Maiden', power: 3 }),
    );
    expect(r.mode).toBe('fast');
    expect(r.defenderDestroyed).toBe(true);
    expect(r.attackerDestroyed).toBe(false);
    expect(r.attacker.power).toBe(3);
  });

  it('both Fast: equal initiative → simultaneous mutual damage', () => {
    const r = resolveMelee(
      combatantFrom({ name: 'Blitz A', power: 3, keywords: ['fast'] }),
      combatantFrom({ name: 'Blitz B', power: 3, keywords: ['fast'] }),
    );
    expect(r.mode).toBe('normal');
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defenderDestroyed).toBe(true);
  });

  it('Fast vs Slow: Fast wins initiative even as defender', () => {
    const r = resolveMelee(
      combatantFrom({ name: 'Lead Slow', power: 4, keywords: ['slow'] }),
      combatantFrom({ name: 'Static Child', power: 4, keywords: ['fast'] }),
    );
    expect(r.mode).toBe('slow'); // attacker slower → defender first
    expect(r.attackerDestroyed).toBe(true);
    expect(r.defender.power).toBe(4);
  });

  it('Toughness via runtime tough flag soaks first point', () => {
    const r = resolveMelee(
      combatantFrom({ name: 'Hitter', power: 3 }),
      combatantFrom({ name: 'Sandbag', power: 5, tough: true }),
    );
    // Simultaneous: Sandbag soaks 1 of 3 → takes 2 → Power 3; Hitter takes 5 → dead
    expect(r.defender.power).toBe(3);
    expect(r.attackerDestroyed).toBe(true);
  });

  it('Fast runtime flag (granted Fast) works without keyword string alone', () => {
    const r = resolveMelee(
      combatantFrom({ name: 'Gifted', power: 2, fast: true }),
      combatantFrom({ name: 'Tide Clerk', power: 2 }),
    );
    expect(r.mode).toBe('fast');
    expect(r.defenderDestroyed).toBe(true);
    expect(r.attacker.power).toBe(2);
  });

});
