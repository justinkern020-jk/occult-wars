import raw from './cards.json';
import type { Card } from '../game/types';

export const FACTIONS = [
  'The Blackout Wardens',
  'The Drowned Parish',
  'The Numbers Station',
  'The Dust Ballot',
  'The Vril Syndicate',
  'Order of the Lead Dawn',
  'Sons of the Green Lion',
  'The Hermetic Circle',
  'The Midnight Assembly',
  'The Columbia Lodge',
] as const;

export const CARDS: Card[] = raw as Card[];

export const UNITS: Card[] = CARDS.filter((c) => c.kind === 'unit');

export function cardById(id: string): Card | undefined {
  return CARDS.find((c) => c.id === id);
}

export function unitsByFaction(faction: string): Card[] {
  return UNITS.filter((c) => c.faction === faction);
}

/**
 * Conversion used when porting from the live Grok app's attack+health schema:
 *   power = Math.max(attack, health)
 * so tanks keep soaking capacity and hitters keep striking weight.
 * See README / REPUBLISH.md.
 */
export function convertLegacyPower(attack: number, health: number): number {
  return Math.max(attack, health);
}
