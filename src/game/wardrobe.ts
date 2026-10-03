/**
 * The Wardrobe: card backs and coin skins. Pure cosmetics, drawn in CSS/SVG
 * (no new art). Most unlock from honours and stats already kept in `ach`;
 * the gilt patron back unlocks with a patron code the owner gives out
 * (checked by /api/patron, then kept in the profile).
 */
import type { Profile } from './profile';

export type Wardrobe = {
  /** Chosen card back id. */
  back?: string;
  /** Chosen coin skin id. */
  coin?: string;
  /** A redeemed patron code (server-checked when entered). */
  patron?: string;
};

type Unlock = {
  /** What to do, as the player reads it. */
  how: string;
  /** [have, need] toward it. */
  progress: (p: Profile) => [number, number];
};

export type CardBack = { id: string; name: string; blurb: string; unlock?: Unlock };
export type CoinSkin = { id: string; name: string; blurb: string; unlock?: Unlock };

const stat = (p: Profile, k: string) => Math.max(0, Math.floor(p.ach?.stats[k] ?? 0));
const capped = (have: number, need: number): [number, number] => [Math.min(have, need), need];
const honourCount = (p: Profile) => Object.keys(p.ach?.got ?? {}).length;

export const CARD_BACKS: readonly CardBack[] = [
  { id: 'lodge', name: 'Lodge Lattice', blurb: 'Soot-black lattice, a brass cross, the emerald glow of the house.' },
  {
    id: 'wax',
    name: 'Wax Seal',
    blurb: 'Oxblood wax pressed with a ring, on a field of folded vellum.',
    unlock: { how: 'Win a match.', progress: (p) => capped(stat(p, 'wins'), 1) },
  },
  {
    id: 'brass',
    name: 'Sealed Century Brass',
    blurb: 'Engraved brass with rivets and a century dial.',
    unlock: { how: 'Win 5 Sealed Century matches.', progress: (p) => capped(stat(p, 'sealedWins'), 5) },
  },
  {
    id: 'laurel',
    name: 'Laurel of Honours',
    blurb: 'A green laurel wreath round a star, for the much-decorated.',
    unlock: { how: 'Earn 10 Honours.', progress: (p) => capped(honourCount(p), 10) },
  },
  {
    id: 'cryptid',
    name: 'Cryptid Watch',
    blurb: 'Pine forest at night and a pair of eyes that do not blink.',
    unlock: { how: 'Sight 3 different cryptids.', progress: (p) => capped((p.ach?.sets.cryptids ?? []).length, 3) },
  },
  {
    id: 'patron',
    name: 'Patron’s Gilt',
    blurb: 'Gold leaf over black lacquer, an emerald at the heart. For patrons of the work.',
    unlock: { how: 'Enter a patron code.', progress: (p) => [p.wardrobe?.patron ? 1 : 0, 1] },
  },
];

export const COIN_SKINS: readonly CoinSkin[] = [
  { id: 'brass', name: 'Lodge Brass', blurb: 'The house coin: gilt rim, soot face.' },
  {
    id: 'obsidian',
    name: 'Obsidian',
    blurb: 'Black volcanic glass, like Dee’s shew-stone.',
    unlock: { how: 'Win 10 matches.', progress: (p) => capped(stat(p, 'wins'), 10) },
  },
  {
    id: 'verdigris',
    name: 'Verdigris Bronze',
    blurb: 'Old bronze gone green in the rain.',
    unlock: { how: 'Win by taking the enemy stronghold.', progress: (p) => capped(stat(p, 'stormWins'), 1) },
  },
  {
    id: 'bone',
    name: 'Bone',
    blurb: 'Carved ossuary bone, yellowed at the edge.',
    unlock: { how: 'Destroy 100 enemy units.', progress: (p) => capped(stat(p, 'slain'), 100) },
  },
];

export const CARD_BACK_IDS = CARD_BACKS.map((b) => b.id);
export const COIN_SKIN_IDS = COIN_SKINS.map((c) => c.id);

export function isUnlocked(p: Profile, item: { unlock?: Unlock }): boolean {
  if (!item.unlock) return true;
  const [have, need] = item.unlock.progress(p);
  return have >= need;
}

/** The back to draw (falls back to the default if a choice is no longer open). */
export function wornBack(p: Profile): string {
  const b = CARD_BACKS.find((x) => x.id === p.wardrobe?.back);
  return b && isUnlocked(p, b) ? b.id : 'lodge';
}
export function wornCoin(p: Profile): string {
  const c = COIN_SKINS.find((x) => x.id === p.wardrobe?.coin);
  return c && isUnlocked(p, c) ? c.id : 'brass';
}

/** Only known ids, only the patron code shape; anything else is dropped. */
export function migrateWardrobe(raw: unknown): Wardrobe | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Wardrobe = {};
  if (typeof r.back === 'string' && CARD_BACK_IDS.includes(r.back)) out.back = r.back;
  if (typeof r.coin === 'string' && COIN_SKIN_IDS.includes(r.coin)) out.coin = r.coin;
  if (typeof r.patron === 'string' && /^PATRON-[2-9A-HJ-NP-Z]{6}-[2-9A-HJ-NP-Z]{8}$/.test(r.patron)) out.patron = r.patron;
  return Object.keys(out).length ? out : undefined;
}

/** A coin skin id from the other chair (friend matches): known ids only. */
export function cleanCoinSkin(v: unknown): string | undefined {
  return typeof v === 'string' && COIN_SKIN_IDS.includes(v) && v !== 'brass' ? v : undefined;
}

/** Paint the chosen back and coin onto the page (CSS reads these attributes). */
export function applyWardrobe(p: Profile): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.dataset.cardBack = wornBack(p);
  el.dataset.coinSkin = wornCoin(p);
}
/** The other chair's coin skin in a friend match (cleared when it ends). */
export function applyFoeCoin(skin: string | undefined): void {
  if (typeof document === 'undefined') return;
  const s = cleanCoinSkin(skin);
  if (s) document.documentElement.dataset.foeCoinSkin = s;
  else delete document.documentElement.dataset.foeCoinSkin;
}
