import { useMemo, useState } from 'react';
import { SECOND_HOUR_SOCIETIES } from '../game/orders';
import {
  SHOP_PRICES,
  buyPlate,
  countOwned,
  shopCopyLimit,
  shopStock,
  type Profile,
} from '../game/profile';
import { brassClick } from '../game/sfx';
import type { Card } from '../game/types';
import { CardArt } from './CardArt';
import { TarotPop } from './TarotPop';

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
};

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onBack: () => void;
};

/** The night counter: Second Hour plates the seals will not break. */
export function NightCounter({ profile, onUpdate, onBack }: Props) {
  const [society, setSociety] = useState<string>('all');
  const [kind, setKind] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [noteIsError, setNoteIsError] = useState(false);
  const [inspect, setInspect] = useState<Card | null>(null);
  const owned = useMemo(() => countOwned(profile.collection), [profile.collection]);

  const stock = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shopStock().filter((c) => {
      if (society !== 'all' && c.faction !== society) return false;
      if (kind !== 'all' && c.kind !== kind) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)) ||
        c.text.toLowerCase().includes(q)
      );
    });
  }, [society, kind, query]);

  function buy(id: string) {
    const r = buyPlate(profile, id);
    if ('error' in r) {
      setNote(r.error);
      setNoteIsError(true);
      return;
    }
    const n = r.profile.collection.filter((x) => x === id).length;
    setNote(`${r.card.name} is wrapped · ${n}/${shopCopyLimit(r.card)}.`);
    setNoteIsError(false);
    brassClick();
    onUpdate(r.profile);
  }

  return (
    <section className="card-shop plate-screen" data-testid="card-shop">
      <p className="plate-kicker">The night counter</p>
      <h2>Plates the seals will not break</h2>
      <p className="lede">
        First Hour boosters never carry the four societies of the hour after. Buy a
        copy here. Units, rites, and devices seat in a working, three at most. A
        leader is kept once. You hold{' '}
        <strong data-testid="shop-shards">{profile.alchemicalShards}</strong> shards.
      </p>
      {note && (
        <p className={noteIsError ? 'deck-note' : 'shop-note'} role="status" data-testid="shop-note">
          {note}
        </p>
      )}
      <div className="deck-tabs" role="tablist" aria-label="Society">
        <button
          type="button"
          className={`brass-btn deck-tab${society === 'all' ? ' brass-btn-solid' : ''}`}
          aria-pressed={society === 'all'}
          onClick={() => setSociety('all')}
        >
          All four
        </button>
        {SECOND_HOUR_SOCIETIES.map((s) => (
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
      <button type="button" className="brass-btn brass-btn-ghost mt-door" onClick={onBack}>
        Return to the atelier
      </button>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
