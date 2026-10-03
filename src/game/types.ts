/** Occult Wars / Cabals card & combat types */

export type CardKind = 'unit' | 'rite' | 'device' | 'hero';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'patron';


/** On-board unit activated ability (from cards.json `act`). */
export type ActSpec = {
  op: string;
  n?: number;
  pay?: number;
  aim?: boolean;
  /** Once in a sitting (not once per rite). */
  once?: boolean;
  /** Copy must name a foe. */
  foe?: boolean;
};

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
  /** On-board activated ability (Sacrifice / Exhaust / Once each rite / Once in a sitting). */
  act?: ActSpec;
  leaderPower?: { op: string; n?: number };
  death?: number;
  deathBank?: number;
  alsoDraw?: number;
  alsoBank?: number;
  alsoHealth?: number;
  alsoTough?: boolean;
  /** Empower also locks the target: cannot move or attack on its next rite. */
  alsoLock?: boolean;
  /** After resolving, the caster discards a random card (Waking the Sleeper). */
  alsoDiscard?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  /** Current dual Power (vitality + damage). */
  power: number;
  keywords: string[];
  /** Runtime Toughness flag (or keyword `tough`). */
  tough?: boolean;
  /** Runtime Fast Attack flag (or keyword `fast`). */
  fast?: boolean;
  /** Runtime Slow Attack flag (or keyword `slow`). */
  slow?: boolean;
  /**
   * Extra strike Power for this fight only (e.g. adjacent allied Lamp/crown).
   * Added to the blow dealt; never added to the unit's lasting Power.
   */
  strikeBonus?: number;
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
  /** Power actually lost by the attacker / defender in this fight. */
  dmgToAtk: number;
  dmgToDef: number;
  log: string[];
}
