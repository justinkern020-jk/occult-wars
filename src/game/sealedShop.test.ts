import { describe, expect, it } from 'vitest';
import { CARDS, cardById, isExcludedPlateId, isLossInjectId } from '../data/catalog';
import {
  SEALED_CENTURY_ORDERS,
  SECOND_HOUR_SOCIETIES,
  isLegalForOrder,
} from './orders';
import {
  SHARD_REWARDS,
  SHOP_PRICES,
  awardShards,
  buyPlate,
  defaultProfile,
  deleteEraDeck,
  isLegalDeck,
  isShopPlate,
  migrateProfile,
  oldDecksForOrder,
  ownedForEra,
  saveEraDeck,
  sealedCenturyLoadout,
  shopOwnedCount,
  shopStock,
  stripNukeAftermathPlates,
  type CustomDeck,
  type Profile,
} from './profile';
import { buildOrderAllyWorkingIds, deckForWorking, drawFromDeck, validateDeck } from './deck';
import { strongestDeck } from './autoDeck';
import { editorPool, eraDraft } from '../components/DeckEditor';

const ORDER = 'The Briar Sidhe';
const ALLY = 'The Birch Vigil';

/** A freshly sworn Sealed Century player (as SealedCentury.swear leaves them). */
function sworn(shards = 1500): Profile {
  return {
    ...defaultProfile(),
    allegiance: 'The Vril Syndicate',
    alchemicalShards: shards,
    collection: ['the_whitethorn_queen'],
    oldOrder: ORDER,
    oldHero: 'the_whitethorn_queen',
    oldCards: buildOrderAllyWorkingIds(ORDER, 30),
  };
}

function bought(p: Profile, id: string): Profile {
  const r = buyPlate(p, id, 'sealed');
  if ('error' in r) throw new Error(r.error);
  return r.profile;
}

const sorted = (ids: string[]) => [...ids].sort();

describe('the sealed counter (Sealed Century shop)', () => {
  it('stocks the four orders only — no cryptids, Kern code-drops, nuke aftermath or Black Monday', () => {
    const stock = shopStock('sealed');
    expect(stock.length).toBeGreaterThan(50);
    for (const c of stock) {
      expect(SEALED_CENTURY_ORDERS as readonly string[]).toContain(c.faction);
      expect(c.keywords).not.toContain('cryptid');
      expect(isExcludedPlateId(c.id)).toBe(false);
      expect(isLossInjectId(c.id)).toBe(false);
    }
    for (const id of ['justin_kern', 'seth_kern', 'south_haven_dispatch', 'radiation_poisoning', 'nuclear_winter', 'black_monday']) {
      expect(isShopPlate(cardById(id)!, 'sealed')).toBe(false);
    }
    // Every order's leader and its non-cryptid plates are on the counter.
    for (const o of SEALED_CENTURY_ORDERS) {
      const want = CARDS.filter((c) => c.faction === o && !c.keywords.includes('cryptid'));
      expect(stock.filter((c) => c.faction === o).map((c) => c.id).sort()).toEqual(want.map((c) => c.id).sort());
    }
    // The two counters never overlap.
    const night = new Set(shopStock('night').map((c) => c.id));
    expect(stock.some((c) => night.has(c.id))).toBe(false);
    const coven = CARDS.find((c) => c.faction === SECOND_HOUR_SOCIETIES[0] && c.kind === 'unit')!;
    expect(buyPlate(sworn(), coven.id, 'sealed')).toEqual({ error: 'The sealed counter does not stock that plate.' });
    const briar = stock.find((c) => c.faction === ORDER && c.kind === 'unit')!;
    expect(buyPlate(sworn(), briar.id)).toEqual({ error: 'The night counter does not stock that plate.' });
  });

  it('charges shards by rarity and counts the sworn starter working toward three copies', () => {
    const gift = buildOrderAllyWorkingIds(ORDER, 30);
    const giftN = countIds(gift);
    const own = cardById(Object.keys(giftN).find((id) => giftN[id] === 2)!)!; // two gift copies already
    let p = sworn();
    expect(shopOwnedCount(p, own.id, 'sealed')).toBe(2);
    p = bought(p, own.id);
    expect(p.alchemicalShards).toBe(1500 - SHOP_PRICES[own.rarity]);
    expect(p.collection.filter((x) => x === own.id)).toHaveLength(1);
    expect(buyPlate(p, own.id, 'sealed')).toEqual({ error: 'Three copies is the shelf.' });
    const leader = shopStock('sealed').find((c) => c.kind === 'hero' && c.faction === ALLY)!;
    p = bought(p, leader.id);
    expect(buyPlate(p, leader.id, 'sealed')).toEqual({ error: 'You already keep that leader.' });
    const pricey = shopStock('sealed').find((c) => c.kind !== 'hero')!;
    expect('error' in buyPlate({ ...p, alchemicalShards: 0 }, pricey.id, 'sealed')).toBe(true);
  });

  it('Sealed Century matches pay shards (50 a win, 15 a loss)', () => {
    expect(SHARD_REWARDS.old).toEqual({ win: 50, loss: 15 });
    expect(awardShards(sworn(0), 'old', true).alchemicalShards).toBe(50);
    expect(awardShards(sworn(0), 'old', false).alchemicalShards).toBe(15);
  });
});

describe('purchase → deck editor → saved working → Sealed Century match', () => {
  const allyUnit = shopStock('sealed').find((c) => c.faction === ALLY && c.kind === 'unit')!;

  it('a bought ally plate appears in the Sealed Century editor pool and Strongest deck may seat it', () => {
    const before = sworn();
    expect(editorPool(ORDER, ownedForEra(before, 'old')).map((c) => c.id)).not.toContain(allyUnit.id);
    let p = before;
    for (let i = 0; i < 3; i++) p = bought(p, allyUnit.id);
    const owned = ownedForEra(p, 'old');
    expect(owned[allyUnit.id]).toBe(3);
    expect(editorPool(ORDER, owned).map((c) => c.id)).toContain(allyUnit.id);
    expect(editorPool(ORDER, owned, allyUnit.name.slice(0, 6)).map((c) => c.id)).toContain(allyUnit.id);
    // Strongest deck only ever seats owned plates.
    const quick = strongestDeck(ORDER, owned);
    for (const [id, n] of Object.entries(countIds(quick.cards))) {
      expect(n).toBeLessThanOrEqual(Math.min(3, owned[id] ?? 0));
    }
    // A plate of another (unallied) order is bought into the collection but never offered.
    const merc = shopStock('sealed').find((c) => c.faction === 'The Mercury Works' && c.kind === 'unit')!;
    const q = bought(p, merc.id);
    expect(q.collection).toContain(merc.id);
    expect(editorPool(ORDER, ownedForEra(q, 'old')).map((c) => c.id)).not.toContain(merc.id);
  });

  it('the saved working goes on the shelf, survives the cloud round-trip, and is the deck the match shuffles', () => {
    let p = sworn();
    for (let i = 0; i < 3; i++) p = bought(p, allyUnit.id);
    const gift = buildOrderAllyWorkingIds(ORDER, 30);
    const deck: CustomDeck = {
      id: 'old-working-1',
      name: 'Hedge and birch',
      heroId: 'the_whitethorn_queen',
      cards: [allyUnit.id, allyUnit.id, allyUnit.id, ...gift.slice(0, 27)],
    };
    expect(validateDeck(deck.heroId, deck.cards).ok).toBe(true);
    expect(isLegalDeck(deck)).toBe(true);
    p = saveEraDeck(p, deck, 'old');
    expect(p.oldDecks[0]).toEqual(deck);
    expect(p.oldCards).toEqual(deck.cards);
    expect(p.oldHero).toBe(deck.heroId);
    // First-hour shelf untouched.
    expect(p.customDecks).toEqual([]);

    // Local storage / cloud page: JSON round-trip through migrateProfile keeps the shelf.
    const back = migrateProfile(JSON.parse(JSON.stringify(p)));
    expect(back.oldDecks).toEqual([deck]);
    expect(back.oldCards).toEqual(deck.cards);
    expect(back.collection.filter((x) => x === allyUnit.id)).toHaveLength(3);

    // Reopening the editor shows the shelf with the saved working first.
    const drafts = eraDraft(back, 'old');
    expect(drafts.map((d) => d.id)).toEqual([deck.id]);
    expect(drafts[0]!.cards).toEqual(deck.cards);

    // The match: App hands sealedCenturyLoadout to the field, which shuffles exactly that working.
    const loadout = sealedCenturyLoadout(back);
    expect(loadout.heroId).toBe(deck.heroId);
    const shuffled = deckForWorking(ORDER, loadout.deckIds);
    expect(sorted(shuffled.map((c) => c.id))).toEqual(sorted(deck.cards));
    expect(shuffled.filter((c) => c.id === allyUnit.id)).toHaveLength(3);
    // The starter working never carries the ally plate — so the field took the saved deck.
    expect(deckForWorking(ORDER, undefined).some((c) => c.id === allyUnit.id)).toBe(false);
    const opening = drawFromDeck(shuffled, [], 5).hand;
    expect(opening).toHaveLength(5);
    const allowed = countIds(deck.cards);
    for (const [id, n] of Object.entries(countIds(opening.map((c) => c.id)))) {
      expect(n).toBeLessThanOrEqual(allowed[id] ?? 0);
    }
  });

  it('keeps up to eight workings per order; deleting the field working hands the field to the next', () => {
    let p = sworn();
    const gift = buildOrderAllyWorkingIds(ORDER, 30);
    const a: CustomDeck = { id: 'old-a', name: 'A', heroId: 'the_whitethorn_queen', cards: gift };
    const b: CustomDeck = { id: 'old-b', name: 'B', heroId: 'the_whitethorn_queen', cards: [...gift.slice(0, 29), gift[0]!] };
    p = saveEraDeck(p, a, 'old');
    p = saveEraDeck(p, b, 'old');
    expect(oldDecksForOrder(p).map((d) => d.id)).toEqual(['old-b', 'old-a']);
    expect(p.oldCards).toEqual(b.cards);
    p = deleteEraDeck(p, 'old-b', 'old');
    expect(p.oldDecks.map((d) => d.id)).toEqual(['old-a']);
    expect(p.oldCards).toEqual(a.cards);
    // Another order's working stays on the profile but off this order's shelf.
    const swapped = { ...p, oldOrder: 'The Mercury Works' };
    expect(oldDecksForOrder(swapped)).toEqual([]);
    expect(oldDecksForOrder(swapped, ORDER).map((d) => d.id)).toEqual(['old-a']);
  });

  it('nuke aftermath / code-drop plates are stripped from Sealed Century workings too', () => {
    const p = { ...sworn(), oldDecks: [{ id: 'x', name: 'x', heroId: 'the_whitethorn_queen', cards: ['nuclear_winter', allyUnit.id] }] };
    expect(stripNukeAftermathPlates(p).oldDecks[0]!.cards).toEqual([allyUnit.id]);
    expect(isLegalForOrder(ORDER, allyUnit.faction)).toBe(true);
  });
});

function countIds(ids: string[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const id of ids) t[id] = (t[id] ?? 0) + 1;
  return t;
}
