import { useMemo, useState } from 'react';
import { CARDS, cardById, isExcludedPlateId } from '../data/catalog';
import {
  SEALED_CENTURY_ALLIES,
  SEALED_CENTURY_BLURBS,
  SEALED_CENTURY_ORDERS,
  SEALED_CENTURY_RIVALS,
  allyOf,
  isLegalForOrder,
  isSealedCenturyOrder,
  type SealedCenturyOrder,
} from '../game/orders';
import { mapsForEra } from '../game/maps';
import { brassClick } from '../game/sfx';
import { heroesForOrder, type Profile } from '../game/profile';
import { buildOrderAllyWorkingIds, validateDeck } from '../game/deck';
import type { Card } from '../game/types';
import { CardArt } from './CardArt';
import { MapMini } from './MapMini';
import { TarotPop } from './TarotPop';
import { AiMindPicker } from './AiMindPicker';
import type { AiDifficulty } from '../game/ai';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onEnter: (mapId: string, order: SealedCenturyOrder, rival: SealedCenturyOrder) => void;
  onBack: () => void;
  aiDifficulty?: AiDifficulty;
  onAiDifficulty?: (next: AiDifficulty) => void;
};

/** The Sealed Century: four loyalties of the old work, seven grounds. */
export function SealedCentury({
  profile,
  onUpdate,
  onEnter,
  onBack,
  aiDifficulty = 'expert',
  onAiDifficulty,
}: Props) {
  const sworn =
    profile.oldOrder && isSealedCenturyOrder(profile.oldOrder) ? profile.oldOrder : null;
  const [editing, setEditing] = useState(false);
  const grounds = mapsForEra('old');

  function swear(order: SealedCenturyOrder) {
    brassClick();
    const hero = CARDS.find((c) => c.kind === 'hero' && c.faction === order);
    const cards = buildOrderAllyWorkingIds(order, 30);
    const collection =
      hero && !profile.collection.includes(hero.id)
        ? [...profile.collection, hero.id]
        : profile.collection;
    onUpdate({
      ...profile,
      collection,
      oldOrder: order,
      oldHero: hero?.id ?? null,
      oldCards: cards,
    });
  }

  if (!sworn) {
    return (
      <section className="second-hour plate-screen" data-testid="old-work-oath">
        <p className="plate-kicker">The sealed century</p>
        <h2>Swear an order</h2>
        <p className="lede">
          Four orders, and not one of them is a sorcerer in a different hat. The
          Briar Sidhe is witches, Celtic law, and the sidhe — fairy magic of hedge
          and water. The Mercury Works is an interwar cartel of occult engineers:
          coils, patents, and machines that should not exist yet. The Closed Proof
          is a faculty of alchemists and metaphysical mathematicians. The Birch
          Vigil is Slavic: grizzled shamans, mad monks, and the spirits of birch,
          bathhouse, and stove. Swear one. Your ally jewel still fills the working.
        </p>
        <div className="allegiance-grid">
          {SEALED_CENTURY_ORDERS.map((order) => (
            <button
              key={order}
              type="button"
              className="allegiance-card brass-btn"
              data-testid={`old-swear-${order}`}
              onClick={() => swear(order)}
            >
              <span className="allegiance-order">{order}</span>
              <span className="allegiance-ally">Ally · {SEALED_CENTURY_ALLIES[order]}</span>
              <span className="allegiance-blurb">{SEALED_CENTURY_BLURBS[order]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  if (editing) {
    return (
      <OldWorkingEditor
        order={sworn}
        heroId={profile.oldHero}
        cardIds={profile.oldCards ?? buildOrderAllyWorkingIds(sworn, 30)}
        onSeal={(heroId, cards) => {
          onUpdate({ ...profile, oldHero: heroId, oldCards: cards });
          setEditing(false);
        }}
        onBack={() => setEditing(false)}
      />
    );
  }

  const rival = SEALED_CENTURY_RIVALS[sworn];
  return (
    <section className="second-hour plate-screen" data-testid="old-work-field">
      <p className="plate-kicker">The sealed century · {sworn}</p>
      <h2>Choose the ground</h2>
      <p className="lede">
        Ally jewel · {SEALED_CENTURY_ALLIES[sworn]}. The rival across the circle is{' '}
        {rival}. The grounds are not the same shape. Some seals sit under your
        door. Some you only reach by crossing. A shot is still a straight line.
      </p>
      {onAiDifficulty && <AiMindPicker value={aiDifficulty} onChange={onAiDifficulty} />}
      <div className="map-grid">
        {grounds.map((m) => (
          <button
            key={m.id}
            type="button"
            className="map-card brass-btn brass-btn-solid"
            data-testid={`old-map-${m.id}`}
            onClick={() => {
              brassClick();
              onEnter(m.id, sworn, rival);
            }}
          >
            <MapMini map={m} />
            <span className="map-card-name">{m.name}</span>
            <span className="map-card-sub">{m.epithet}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="brass-btn brass-btn-solid"
        data-testid="old-edit-working"
        onClick={() => setEditing(true)}
      >
        Edit the working
      </button>
      <button
        type="button"
        className="brass-btn brass-btn-ghost"
        onClick={() => onUpdate({ ...profile, oldOrder: null, oldHero: null, oldCards: null })}
      >
        Swear a different order
      </button>
      <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
        Return
      </button>
    </section>
  );
}

function OldWorkingEditor({
  order,
  heroId: initialHero,
  cardIds,
  onSeal,
  onBack,
}: {
  order: SealedCenturyOrder;
  heroId: string | null;
  cardIds: string[];
  onSeal: (heroId: string, cards: string[]) => void;
  onBack: () => void;
}) {
  const heroes = heroesForOrder(order);
  const ally = allyOf(order);
  const [heroId, setHeroId] = useState(
    initialHero && heroes.some((h) => h.id === initialHero) ? initialHero : (heroes[0]?.id ?? ''),
  );
  const [selected, setSelected] = useState<string[]>(cardIds);
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Card | null>(null);

  const counts = useMemo(() => {
    const t: Record<string, number> = {};
    for (const id of selected) t[id] = (t[id] ?? 0) + 1;
    return t;
  }, [selected]);

  const pool = useMemo(
    () =>
      CARDS.filter(
        (c) =>
          c.kind !== 'hero' &&
          !c.keywords.includes('cryptid') &&
          !isExcludedPlateId(c.id) &&
          isLegalForOrder(order, c.faction),
      )
        .filter((c) => {
          const q = filter.trim().toLowerCase();
          if (!q) return true;
          return (
            c.name.toLowerCase().includes(q) ||
            c.text.toLowerCase().includes(q) ||
            c.keywords.some((k) => k.includes(q)) ||
            c.faction.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)),
    [order, filter],
  );

  function add(id: string) {
    if ((counts[id] ?? 0) >= 3) {
      setNote('At most 3 copies.');
      return;
    }
    if (selected.length >= 40) {
      setNote('A working holds at most 40 plates.');
      return;
    }
    brassClick();
    setNote(null);
    setSelected((s) => [...s, id]);
  }

  function remove(id: string) {
    const idx = selected.lastIndexOf(id);
    if (idx < 0) return;
    brassClick();
    setNote(null);
    setSelected((s) => s.filter((_, i) => i !== idx));
  }

  function seal() {
    const v = validateDeck(heroId, selected);
    if (!v.ok) {
      setNote(v.error);
      return;
    }
    brassClick();
    onSeal(heroId, selected);
  }

  return (
    <section className="deck-editor plate-screen" data-testid="old-deck">
      <header className="deck-editor-head">
        <div>
          <p className="plate-kicker">The sealed century · deck</p>
          <h2>Ink the old working</h2>
          <p className="lede">
            Sworn to {order}
            {ally ? `, with ${ally} as the ally jewel` : ''}. Spend Resources on the
            field — the cost on a plate is what it takes to muster. 1 leader · 30–40
            plates · max 3 copies. Cryptid sightings are not seated.
          </p>
        </div>
        <div className="deck-editor-meta">
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
          <button
            type="button"
            className="brass-btn"
            onClick={() => {
              const h = cardById(heroId);
              if (h) setInspect(h);
            }}
          >
            Read the leader
          </button>
          <p className="deck-count" data-testid="old-deck-count">
            {selected.length} / 30–40
          </p>
        </div>
      </header>
      {note && (
        <p className="deck-note" role="alert">
          {note}
        </p>
      )}
      <div className="deck-editor-body">
        <div className="deck-pool">
          <input
            type="search"
            placeholder="Filter plates…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="deck-pool-grid">
            {pool.map((c) => {
              const n = counts[c.id] ?? 0;
              return (
                <article key={c.id} className={`deck-plate rarity-${c.rarity}`}>
                  <button type="button" className="deck-plate-look" onClick={() => setInspect(c)}>
                    <CardArt name={c.name} className="deck-plate-art" />
                    <span className="deck-plate-name">{c.name}</span>
                  </button>
                  <span className="deck-plate-stats">
                    <em>L{c.cost}</em>
                    {c.power == null ? <em>{c.kind}</em> : <em>P{c.power}</em>}
                  </span>
                  <div className="deck-stepper">
                    <button
                      type="button"
                      className="brass-btn"
                      disabled={n === 0}
                      aria-label={`Remove one ${c.name}`}
                      onClick={() => remove(c.id)}
                    >
                      −
                    </button>
                    <span>{n}/3</span>
                    <button
                      type="button"
                      className="brass-btn brass-btn-solid"
                      disabled={n >= 3 || selected.length >= 40}
                      aria-label={`Seat one ${c.name}`}
                      onClick={() => add(c.id)}
                    >
                      +
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="deck-selected">
          <h3>Working</h3>
          <p className="lede">Tap a name to set one copy aside. Tap the portrait to read the plate.</p>
          <ul>
            {[...new Set(selected)].map((id) => {
              const c = cardById(id);
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
        <button type="button" className="brass-btn brass-btn-solid" onClick={seal}>
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
