/** Occult Wars / Cabals card & combat types */

export type CardKind = 'unit' | 'rite' | 'device' | 'hero';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'patron';

export interface Card {
  id: string;
  name: string;
  faction: string;
  kind: CardKind;
  rarity: Rarity;
  cost: number;
  oath: number;
  /** Dual Cabals Power: vitality AND damage. Units only. */
  power?: number;
  keywords: string[];
  text: string;
  quote?: string;
  quoted?: string;
  /** Legacy separate stats before Cabals conversion (documentation only). */
  legacyAttack?: number;
  legacyHealth?: number;
  aim?: boolean;
  effect?: { op: string; n?: number };
  act?: Record<string, unknown>;
  leaderPower?: { op: string; n?: number };
  death?: number;
  deathBank?: number;
  alsoDraw?: number;
  alsoBank?: number;
  alsoHealth?: number;
  alsoTough?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  /** Current dual Power (vitality + damage). */
  power: number;
  keywords: string[];
  /** Runtime Toughness flag (or keyword `tough`). */
  tough?: boolean;
}

export type CombatMode = 'normal' | 'fast' | 'slow';

export interface CombatLogEntry {
  message: string;
}

export interface CombatResult {
  mode: CombatMode;
  attacker: Combatant;
  defender: Combatant;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  log: string[];
}
