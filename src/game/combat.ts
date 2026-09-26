/**
 * Cabals dual-Power combat resolution.
 *
 * Rules (must match designer):
 * 1. Power is ONE dual stat = vitality AND damage. No separate health/ATK.
 * 2. Taking damage permanently reduces Power. Power ≤ 0 → destroyed.
 * 3. Example: Power 4 deals 4; takes 2 → Power 2 thereafter.
 * 4. Normal: simultaneous mutual damage at current Power.
 * 5. Fast Attack: the Fast side strikes FIRST (attacker or defender).
 *    If that blow drops the foe to Power ≤ 0, they do not strike back.
 * 6. Both Fast (or equal initiative): simultaneous mutual damage.
 * 7. Slow Attack: strikes LAST relative to Normal/Fast; if Slow survives,
 *    it deals its (possibly reduced) Power.
 * 8. Chipping Power before melee reduces return damage.
 *
 * Toughness (legacy keyword): first point of any single strike is refused.
 */

import type { Combatant, CombatMode, CombatResult } from './types';
import { combatModeFor, hasKeyword } from './keywords';

function clone(u: Combatant): Combatant {
  return {
    id: u.id,
    name: u.name,
    power: u.power,
    keywords: [...u.keywords],
    tough: u.tough,
    fast: u.fast,
    slow: u.slow,
  };
}

/** Incoming strike damage after Toughness. */
export function incomingDamage(target: Combatant, raw: number): number {
  const soak = hasKeyword(target, 'tough') ? 1 : 0;
  return Math.max(0, raw - soak);
}

/**
 * Apply damage to a combatant: permanently reduce Power.
 * Returns actual Power lost.
 */
export function applyDamage(target: Combatant, raw: number): number {
  const dmg = incomingDamage(target, raw);
  target.power -= dmg;
  return dmg;
}

export function isDestroyed(unit: Combatant): boolean {
  return unit.power <= 0;
}

/**
 * Resolve a melee between attacker (stepping in) and defender (occupying).
 * Mutates copies; returns new states + log. Does not mutate inputs.
 */
export function resolveMelee(
  attackerIn: Combatant,
  defenderIn: Combatant,
): CombatResult {
  const attacker = clone(attackerIn);
  const defender = clone(defenderIn);
  const mode: CombatMode = combatModeFor(attacker, defender);
  const log: string[] = [];

  const atkPow = () => Math.max(0, attacker.power);
  const defPow = () => Math.max(0, defender.power);

  if (mode === 'normal') {
    // Simultaneous: both deal their pre-strike Power.
    const aDeal = atkPow();
    const dDeal = defPow();
    const dmgToDef = applyDamage(defender, aDeal);
    const dmgToAtk = applyDamage(attacker, dDeal);
    log.push(
      `Normal (simultaneous): ${attacker.name} (${aDeal}) and ${defender.name} (${dDeal}) exchange blows.`,
    );
    log.push(
      `${attacker.name} deals ${dmgToDef}; ${defender.name} is now Power ${Math.max(0, defender.power)}.`,
    );
    log.push(
      `${defender.name} deals ${dmgToAtk}; ${attacker.name} is now Power ${Math.max(0, attacker.power)}.`,
    );
  } else if (mode === 'fast') {
    // Attacker has higher initiative (Fast vs Normal/Slow).
    const aDeal = atkPow();
    const dmgToDef = applyDamage(defender, aDeal);
    log.push(
      `Fast Attack: ${attacker.name} strikes first for ${dmgToDef} (from Power ${aDeal}).`,
    );
    log.push(
      `${defender.name} is now Power ${Math.max(0, defender.power)}.`,
    );
    if (isDestroyed(defender)) {
      log.push(
        `${defender.name} is destroyed and does not strike back.`,
      );
    } else {
      const dDeal = defPow(); // reduced Power
      const dmgToAtk = applyDamage(attacker, dDeal);
      log.push(
        `${defender.name} answers for ${dmgToAtk} (from Power ${dDeal}).`,
      );
      log.push(
        `${attacker.name} is now Power ${Math.max(0, attacker.power)}.`,
      );
    }
  } else {
    // Defender has higher initiative (defender Fast, or attacker Slow).
    const dDeal = defPow();
    const dmgToAtk = applyDamage(attacker, dDeal);
    const defFast = hasKeyword(defender, 'fast');
    log.push(
      defFast
        ? `Fast Attack: ${defender.name} strikes first for ${dmgToAtk} (from Power ${dDeal}).`
        : `Slow Attack: ${defender.name} deals first for ${dmgToAtk} (from Power ${dDeal}).`,
    );
    log.push(
      `${attacker.name} is now Power ${Math.max(0, attacker.power)}.`,
    );
    if (isDestroyed(attacker)) {
      log.push(
        defFast
          ? `${attacker.name} is destroyed and does not strike back.`
          : `${attacker.name} is destroyed and never delivers its Slow blow.`,
      );
    } else {
      const aDeal = atkPow(); // possibly reduced
      const dmgToDef = applyDamage(defender, aDeal);
      log.push(
        `${attacker.name} then strikes for ${dmgToDef} (from Power ${aDeal}).`,
      );
      log.push(
        `${defender.name} is now Power ${Math.max(0, defender.power)}.`,
      );
    }
  }

  if (isDestroyed(attacker)) log.push(`${attacker.name} is destroyed.`);
  if (isDestroyed(defender)) log.push(`${defender.name} is destroyed.`);

  // Clamp display power at 0
  if (attacker.power < 0) attacker.power = 0;
  if (defender.power < 0) defender.power = 0;

  return {
    mode,
    attacker,
    defender,
    attackerDestroyed: isDestroyed(attacker),
    defenderDestroyed: isDestroyed(defender),
    log,
  };
}

/** Helper: build a combatant from card-like data. */
export function combatantFrom(
  partial: {
    id?: string;
    name: string;
    power: number;
    keywords?: string[];
    tough?: boolean;
    fast?: boolean;
    slow?: boolean;
  },
): Combatant {
  return {
    id: partial.id ?? partial.name.toLowerCase().replace(/\s+/g, '_'),
    name: partial.name,
    power: partial.power,
    keywords: partial.keywords ?? [],
    tough: partial.tough,
    fast: partial.fast,
    slow: partial.slow,
  };
}
