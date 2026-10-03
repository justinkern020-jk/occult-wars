import { notePack } from '../game/achievements';
import { keywordLabel } from '../game/keywords';
import { useMemo, useState } from 'react';
import {
  SEALED_CENTURY_ORDERS,
  SECOND_HOUR_SOCIETIES,
  isLegalForOrder,
} from '../game/orders';
import {
  SHOP_PRICES,
  buyPlate,
  ownedForEra,
  countOwned,
  shopCopyLimit,
  shopStock,
  type Profile,
  type ShopCounter,
} from '../game/profile';
import { brassClick } from '../game/sfx';
import type { Card } from '../game/types';
import { CardArt } from './CardArt';
import { TarotPop } from './TarotPop';
import { PackOpening, type PackItem } from './PackOpening';

const KIND_LABEL: Record<Card['kind'], string> = {
  unit: 'Unit',
  rite: 'Rite',
  device: 'Device',
  hero: 'Leader',
};

const SOCIETY_SHORT: Record<string, string> = {
  'The Whitethorn Coven': 'Coven',
  'The Helix Bureau': 'Helix',
  'The Monad Faculty': 'Monad',
  'The Iconostasy': 'Icon',
  'The Briar Sidhe': 'Briar',
  'The Mercury Works': 'Mercury',
  'The Closed Proof': 'Proof',
  'The Birch Vigil': 'Birch',
  Unaligned: 'Unaligned',
};

const COUNTERS: Record<
  ShopCounter,
  { kicker: string; title: string; groups: readonly string[]; back: string; testId: string }
> = {
  night: {
    kicker: 'The night counter',
    title: 'Plates the seals will not break',
    groups: SECOND_HOUR_SOCIETIES,
    back: 'Return to the atelier',
    testId: 'card-shop',
  },
  sealed: {
    kicker: 'The sealed counter',
    title: 'Plates of the old work',
    groups: SEALED_CENTURY_ORDERS,
    back: 'Return to the Sealed Century',
    testId: 'sealed-shop',
  },
};

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onBack: () => void;
  /** Which counter: the night counter (Second Hour) or the sealed counter (Sealed Century). */
  counter?: ShopCounter;
  /** Opens the deck editor on this counter's hour (sealed counter only). */
  onDeckEditor?: () => void;
};

/**
 * A plate counter. The night counter sells the Second Hour plates the seals will
 * not break; the sealed counter sells the Sealed Century's four orders.
 */
export function NightCounter({ profile, onUpdate, onBack, counter = 'night', onDeckEditor }: Props) {
  const cfg = COUNTERS[counter];
  const sworn = counter === 'sealed' ? profile.oldOrder : null;
  const [society, setSociety] = useState<string>(sworn ? 'yours' : 'all');
  const [kind, setKind] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);
  const [inspect, setInspect] = useState<Card | null>(null);
  /** A purchase comes wrapped: the envelope opens over the counter. */
  const [opening, setOpening] = useState<PackItem[] | null>(null);
  // The sealed counter also counts the sworn order's starter working (the editor seats it too).
  const owned = useMemo(
    () => (counter === 'sealed' ? ownedForEra(profile, 'old') : countOwned(profile.collection)),
    [counter, profile],
  );

  const stock = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shopStock(counter).filter((c) => {
      if (society === 'yours') {
        if (!sworn || !isLegalForOrder(sworn, c.faction)) return false;
      } else if (society !== 'all' && c.faction !== society) return false;
      if (kind !== 'all' && c.kind !== kind) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.keywords.some((k) => keywordLabel(k).toLowerCase().includes(q)) ||
        c.text.toLowerCase().includes(q)
      );
    });
  }, [society, kind, query, counter, sworn]);

  function buy(id: string) {
    const r = buyPlate(profile, id, counter);
    if ('error' in r) {
      setNote(r.error);
      setNoteIsError(true);
      return;
    }
    const n = (owned[id] ?? 0) + 1;
    const fits = counter === 'sealed' && sworn && isLegalForOrder(sworn, r.card.faction);
    setNote(
      `${r.card.name}${r.foil ? ' (foil)' : ''} is wrapped · ${n}/${shopCopyLimit(r.card)}.${fits ? ' It waits in the deck editor.' : ''}`,
    );
    setNoteIsError(false);
    brassClick();
    onUpdate(notePack(r.profile, 'counter'));
    setOpening([{ card: r.card, foil: r.foil }]);
  }

  return (
    <section className="card-shop plate-screen" data-testid={cfg.testId} data-counter={counter}>
      <p className="plate-kicker">{cfg.kicker}</p>
      <h2>{cfg.title}</h2>
      {counter === 'sealed' ? (
        <p className="lede">
          No seal carries the four orders of the old work. Buy a copy here and it joins
          your collection — a plate of your order or its ally jewel waits in the deck
          editor. Units, rites, and devices seat three at most; a leader is kept once.
          Copies from your sworn starter working count. A Sealed Century win pays 50
          shards, a loss 15. You hold{' '}
          <strong data-testid="shop-shards">{profile.alchemicalShards}</strong> shards.
        </p>
      ) : (
        <p className="lede">
          First Hour boosters never carry the four societies of the hour after. Buy a
          copy here. Units, rites, and devices seat in a working, three at most. A
          leader is kept once. You hold{' '}
          <strong data-testid="shop-shards">{profile.alchemicalShards}</strong> shards.
        </p>
      )}
      {note && (
        <p className={noteIsError ? 'deck-note' : 'shop-note'} role="status" data-testid="shop-note">
          {note}
        </p>
      )}
      <div className="deck-tabs" role="tablist" aria-label="Society">
        {sworn && (
          <button
            type="button"
            className={`brass-btn deck-tab${society === 'yours' ? ' brass-btn-solid' : ''}`}
            aria-pressed={society === 'yours'}
            data-testid="shop-tab-yours"
            onClick={() => setSociety('yours')}
          >
            Your working
          </button>
        )}
        <button
          type="button"
          className={`brass-btn deck-tab${society === 'all' ? ' brass-btn-solid' : ''}`}
          aria-pressed={society === 'all'}
          onClick={() => setSociety('all')}
        >
          All four
        </button>
        {cfg.groups.map((s) => (
          <button
            key={s}
            type="button"
            className={`brass-btn deck-tab${society === s ? ' brass-btn-solid' : ''}`}
            aria-pressed={society === s}
            onClick={() => setSociety(s)}
          >
            {SOCIETY_SHORT[s]}
          </button>
        ))}
      </div>
      <div className="shop-filters">
        <input
          type="search"
          placeholder="Search the counter…"
          aria-label="Search the counter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Kind of plate" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          <option value="unit">Units</option>
          <option value="rite">Rites</option>
          <option value="device">Devices</option>
          <option value="hero">Leaders</option>
        </select>
        <span className="count">{stock.length} plates</span>
      </div>
      <div className="deck-pool-grid shop-grid">
        {stock.map((c) => {
          const have = owned[c.id] ?? 0;
          const limit = shopCopyLimit(c);
          const price = SHOP_PRICES[c.rarity];
          const full = have >= limit;
          const poor = profile.alchemicalShards < price;
          return (
            <article key={c.id} className={`deck-plate rarity-${c.rarity}`} data-testid={`shop-plate-${c.id}`}>
              <button type="button" className="deck-plate-look" onClick={() => setInspect(c)}>
                <CardArt name={c.name} className="deck-plate-art" />
                <span className="deck-plate-name">{c.name}</span>
              </button>
              <span className="shop-society">{SOCIETY_SHORT[c.faction] ?? c.faction}</span>
              <span className="shop-meta">
                <em>{KIND_LABEL[c.kind]}</em>
                <em>
                  {have}/{limit}
                </em>
              </span>
              <button
                type="button"
                className="brass-btn brass-btn-solid shop-buy"
                data-testid={`shop-buy-${c.id}`}
                disabled={full || poor}
                onClick={() => buy(c.id)}
              >
                {full ? 'Shelf full' : `${price} shards`}
              </button>
            </article>
          );
        })}
      </div>
      {onDeckEditor && (
        <button
          type="button"
          className="brass-btn brass-btn-solid mt-door"
          data-testid="shop-deck-editor"
          onClick={onDeckEditor}
        >
          Open the deck editor
        </button>
      )}
      <button type="button" className="brass-btn brass-btn-ghost mt-door" data-testid="shop-return" onClick={onBack}>
        {cfg.back}
      </button>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
      {opening && (
        <PackOpening
          items={opening}
          label={cfg.kicker}
          wax={counter === 'sealed' ? 'emerald' : 'crimson'}
          onClose={() => setOpening(null)}
        />
      )}
    </section>
  );
}
