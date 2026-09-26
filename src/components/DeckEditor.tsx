import { useMemo, useState } from 'react';
import { CARDS } from '../data/catalog';
import {
  allyOf,
  isLegalForOrder,
  type FirstHourOrder,
} from '../game/orders';
import {
  countOwned,
  heroesForOrder,
  isLegalDeck,
  type CustomDeck,
  type Profile,
} from '../game/profile';
import { validateDeck } from '../game/deck';
import { brassClick } from '../game/sfx';
import { CardArt } from './CardArt';
import { TarotPop } from './TarotPop';
import type { Card } from '../game/types';

type Props = {
  profile: Profile;
  onSave: (deck: CustomDeck) => void;
  onBack: () => void;
};

export function DeckEditor({ profile, onSave, onBack }: Props) {
  const [inspect, setInspect] = useState<Card | null>(null);
  const order = profile.allegiance as FirstHourOrder | null;
  const existing = profile.customDecks[0];
  const heroes = order ? heroesForOrder(order) : [];
  const [heroId, setHeroId] = useState(
    existing?.heroId || heroes[0]?.id || '',
  );
  const [name, setName] = useState(existing?.name || order || 'Untitled working');
  const [selected, setSelected] = useState<string[]>(existing?.cards ?? []);
  const [filter, setFilter] = useState('');
  const owned = useMemo(() => countOwned(profile.collection), [profile.collection]);
  const ally = order ? allyOf(order) : null;

  const pool = useMemo(() => {
    if (!order) return [];
    return CARDS.filter(
      (c) =>
        c.kind !== 'hero' &&
        isLegalForOrder(order, c.faction) &&
        (owned[c.id] ?? 0) > 0,
    ).filter((c) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q))
      );
    });
  }, [order, owned, filter]);

  const counts = useMemo(() => {
    const t: Record<string, number> = {};
    for (const id of selected) t[id] = (t[id] ?? 0) + 1;
    return t;
  }, [selected]);

  function add(id: string) {
    const have = counts[id] ?? 0;
    const max = Math.min(3, owned[id] ?? 0);
    if (have >= max) return;
    if (selected.length >= 40) return;
    brassClick();
    setSelected((s) => [...s, id]);
  }

  function remove(id: string) {
    const idx = selected.lastIndexOf(id);
    if (idx < 0) return;
    brassClick();
    setSelected((s) => s.filter((_, i) => i !== idx));
  }

  function save() {
    const v = validateDeck(heroId, selected);
    if (!v.ok) {
      alert(v.error);
      return;
    }
    const deck: CustomDeck = {
      id: existing?.id ?? 'first-working',
      name: name.slice(0, 32) || 'Untitled working',
      heroId,
      cards: selected,
    };
    if (!isLegalDeck(deck)) {
      alert('A working needs one leader and 30–40 cards from that order and its ally.');
      return;
    }
    brassClick();
    onSave(deck);
  }

  if (!order) {
    return (
      <section className="plate">
        <p>Swear an order before you ink a working.</p>
        <button type="button" className="brass-btn" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  return (
    <section className="deck-editor plate-screen" data-testid="deck-editor">
      <header className="deck-editor-head">
        <div>
          <p className="plate-kicker">Deck editor</p>
          <h2>Ink a working</h2>
          <p className="lede">
            1 leader · 30–40 plates · max 3 copies · {order}
            {ally ? ` + ${ally}` : ''}
          </p>
        </div>
        <div className="deck-editor-meta">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Leader
            <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
              {heroes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <p className="deck-count">{selected.length} / 30–40</p>
        </div>
      </header>

      <div className="deck-editor-body">
        <div className="deck-pool">
          <input
            type="search"
            placeholder="Filter owned plates…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="deck-pool-grid">
            {pool.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`deck-plate rarity-${c.rarity}`}
                onClick={() => add(c.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setInspect(c);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setInspect(c);
                }}
                title={`Own ${owned[c.id] ?? 0} · in working ${counts[c.id] ?? 0} · double-tap to inspect`}
              >
                <CardArt name={c.name} className="deck-plate-art" />
                <span className="deck-plate-name">{c.name}</span>
                <span className="deck-plate-stats">
                  <em>L{c.cost}</em>
                  {c.power != null ? <em>P{c.power}</em> : null}
                  <em>
                    {counts[c.id] ?? 0}/{Math.min(3, owned[c.id] ?? 0)}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="deck-selected">
          <h3>Working</h3>
          <ul>
            {[...new Set(selected)].map((id) => {
              const c = CARDS.find((x) => x.id === id);
              if (!c) return null;
              return (
                <li key={id}>
                  <button type="button" onClick={() => remove(id)}>
                    {c.name} ×{counts[id]}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="deck-editor-actions">
        <button type="button" className="brass-btn brass-btn-solid" onClick={save}>
          Seal the working
        </button>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </div>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
