import raw from './cards.json';
import type { Card } from '../game/types';

export const FACTIONS = [
  'The Whitethorn Coven',
  'The Helix Bureau',
  'The Monad Faculty',
  'The Iconostasy',
  'The Briar Sidhe',
  'The Mercury Works',
  'The Closed Proof',
  'The Birch Vigil',
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

/** Effect ops that bank or steal Resources for the player. */
const RESOURCE_EFFECT_OPS = new Set([
  'bank',
  'bank_draw',
  'leech',
  'sacrifice_bank',
  'destroy_refund',
]);

/** Activated abilities that bank Resources. */
const RESOURCE_ACT_OPS = new Set(['tap-bank', 'sacrifice-bank']);

/** Keywords that generate Resources (income / node double / salvage / conquer toll). */
const RESOURCE_KEYWORDS = new Set([
  'tithe',
  'tithe2',
  'hearth',
  'salvage',
  'toll',
]);

/** Leader powers that bank Resources. */
const RESOURCE_LEADER_OPS = new Set(['master']);

/**
 * True when the card generates Resources (banks, tithes, steals, refunds).
 * Muster cost alone does not count — spending is not generating.
 */
export function cardGeneratesResources(card: Card): boolean {
  if (card.effect && RESOURCE_EFFECT_OPS.has(card.effect.op)) return true;
  if ((card.alsoBank ?? 0) > 0) return true;
  if ((card.deathBank ?? 0) > 0) return true;
  if (card.act && RESOURCE_ACT_OPS.has(card.act.op)) return true;
  if (card.leaderPower && RESOURCE_LEADER_OPS.has(card.leaderPower.op)) return true;
  if (card.keywords.some((k) => RESOURCE_KEYWORDS.has(k))) return true;
  const t = card.text.toLowerCase();
  if (/\bbank(?:s|ed)?\b/.test(t) && /\bresources?\b/.test(t)) return true;
  if (/yields?\s+\+?\d*\s*resources?/.test(t)) return true;
  if (/resource node/.test(t)) return true;
  if (/takes?\s+up\s+to\s+\d+\s+resources?/.test(t)) return true;
  return false;
}

/** Nuke TarotPop rites — never pack/deck/owned plates (Collection shows archive faces). */
export const NUKE_AFTERMATH_IDS = [
  'radiation_poisoning',
  'nuclear_winter',
] as const;

export function isNukeAftermathId(id: string): boolean {
  return (NUKE_AFTERMATH_IDS as readonly string[]).includes(id);
}

export function isNukeAftermathCard(card: Card): boolean {
  return isNukeAftermathId(card.id);
}

/**
 * Secret code unlocks (siren + dismissible reveal + one-shot hand drop).
 * Never pack / deck-editor / shuffle plates — unlock injects into hand
 * mid-match or next circle via pending flag only. Collection still shows
 * the plate as an archive face (not auto-unlocked).
 */
export const SECRET_HAND_DROP_IDS = ['south_haven_dispatch', 'justin_kern', 'seth_kern'] as const;

export function isSecretHandDropId(id: string): boolean {
  return (SECRET_HAND_DROP_IDS as readonly string[]).includes(id);
}

/**
 * Plates excluded from packs, workings, deck editor, and shuffleable hands.
 * The Collection encyclopedia still shows them as archive-only faces
 * (never auto-unlocked / never owned).
 */
export function isExcludedPlateId(id: string): boolean {
  return isNukeAftermathId(id) || isSecretHandDropId(id);
}

/**
 * Loss-inject comeback plates (e.g. Black Monday after a match loss).
 * Never pack / auto-built working plates — only enter via loss inject
 * into collection (+ optional custom-deck insert). validateDeck accepts
 * them once owned; DeckEditor shows them only when owned.
 */
export const LOSS_INJECT_IDS = ['black_monday'] as const;

export const BLACK_MONDAY_ID = 'black_monday';

export function isLossInjectId(id: string): boolean {
  return (LOSS_INJECT_IDS as readonly string[]).includes(id);
}
