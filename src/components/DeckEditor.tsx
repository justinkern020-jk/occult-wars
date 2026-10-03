import { useMemo, useState } from 'react';
import { CARDS, cardById, isExcludedPlateId } from '../data/catalog';
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

/** A shelf holds this many workings. */
export const MAX_WORKINGS = 8;

type Props = {
  profile: Profile;
  onSave: (deck: CustomDeck) => void;
  /** Drop a sealed working from the profile. */
  onDelete?: (id: string) => void;
  onBack: () => void;
};

/** A working on the editor's shelf; `fresh` = never sealed. */
export type DraftWorking = CustomDeck & { fresh: boolean };

export function draftsFromProfile(profile: Profile): DraftWorking[] {
  if (profile.customDecks.length > 0) {
    return profile.customDecks.map((d) => ({
      id: d.id,
      name: d.name,
      heroId: d.heroId,
      cards: [...d.cards],
      fresh: false,
    }));
  }
  const heroes = profile.allegiance ? heroesForOrder(profile.allegiance) : [];
  return [
    {
      id: 'first-working',
      name: profile.allegiance || 'Untitled working',
      heroId: heroes[0]?.id ?? '',
      cards: [],
      fresh: true,
    },
  ];
}

export function DeckEditor({ profile, onSave, onDelete, onBack }: Props) {
  const [inspect, setInspect] = useState<Card | null>(null);
  const order = profile.allegiance as FirstHourOrder | null;
  const [drafts, setDrafts] = useState<DraftWorking[]>(() => draftsFromProfile(profile));
  const [activeId, setActiveId] = useState(() => draftsFromProfile(profile)[0]?.id ?? '');
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const owned = useMemo(() => countOwned(profile.collection), [profile.collection]);
  const ally = order ? allyOf(order) : null;
  const heroes = order ? heroesForOrder(order) : [];
  const active = drafts.find((d) => d.id === activeId) ?? drafts[0];
  /** The working the field takes (first sealed). */
  const fieldId = profile.customDecks[0]?.id;

  const pool = useMemo(() => {
    if (!order) return [];
    const q = filter.trim().toLowerCase();
    return CARDS.filter(
      (c) =>
        c.kind !== 'hero' &&
        !c.keywords.includes('cryptid') &&
        !isExcludedPlateId(c.id) &&
        isLegalForOrder(order, c.faction) &&
        (owned[c.id] ?? 0) > 0,
    )
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.keywords.some((k) => k.includes(q)) ||
          c.faction.toLowerCase().includes(q),
      )
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  }, [order, owned, filter]);

  const counts = useMemo(() => {
    const t: Record<string, number> = {};
    for (const id of active?.cards ?? []) t[id] = (t[id] ?? 0) + 1;
    return t;
  }, [active?.cards]);

  function patch(next: Partial<DraftWorking>) {
    if (!active) return;
    setDrafts((all) => all.map((d) => (d.id === active.id ? { ...d, ...next } : d)));
  }

  function add(id: string) {
    if (!active) return;
    const have = counts[id] ?? 0;
    if (have >= Math.min(3, owned[id] ?? 0)) {
      setNote(have >= 3 ? 'At most 3 copies.' : 'You do not own another copy.');
      return;
    }
    if (active.cards.length >= 40) {
      setNote('A working holds at most 40 plates.');
      return;
    }
    brassClick();
    setNote(null);
    patch({ cards: [...active.cards, id] });
  }

  function remove(id: string) {
    if (!active) return;
    const idx = active.cards.lastIndexOf(id);
    if (idx < 0) return;
    brassClick();
    const next = active.cards.slice();
    next.splice(idx, 1);
    setNote(null);
    patch({ cards: next });
  }

  function newWorking() {
    if (drafts.length >= MAX_WORKINGS) {
      setNote('Eight workings is the shelf. Delete one first.');
      return;
    }
    const id = `working-${Date.now()}`;
    brassClick();
    setDrafts((all) => [
      ...all,
      { id, name: 'Untitled working', heroId: heroes[0]?.id ?? '', cards: [], fresh: true },
    ]);
    setActiveId(id);
    setNote('New working. Seal it to keep it — and to take it onto the field.');
  }

  function deleteWorking() {
    if (!active) return;
    if (drafts.length <= 1) {
      setNote('Keep at least one working.');
      return;
    }
    const rest = drafts.filter((d) => d.id !== active.id);
    brassClick();
    setDrafts(rest);
    setActiveId(rest[0]?.id ?? '');
    if (!active.fresh) onDelete?.(active.id);
    setNote(active.fresh ? 'Discarded the unsealed working.' : 'That working left the ledger.');
  }

  function save() {
    if (!active) return;
    const v = validateDeck(active.heroId, active.cards);
    if (!v.ok) {
      setNote(v.error);
      return;
    }
    for (const [id, n] of Object.entries(counts)) {
      const have = owned[id] ?? 0;
      if (n > have) {
        setNote(`You only own ${have} of ${cardById(id)?.name ?? 'that plate'}.`);
        return;
      }
    }
    const deck: CustomDeck = {
      id: active.id,
      name: active.name.slice(0, 32).trim() || 'Untitled working',
      heroId: active.heroId,
      cards: active.cards,
    };
    if (!isLegalDeck(deck)) {
      setNote('A working needs one leader and 30–40 cards from that order and its ally.');
      return;
    }
    brassClick();
    onSave(deck);
  }

  if (!order || !active) {
    return (
      <section className="plate">
        <p>Swear an order before you ink a working.</p>
        <button type="button" className="brass-btn" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  const leaders = heroes.some((h) => h.id === active.heroId)
    ? heroes
    : [...heroes, ...CARDS.filter((c) => c.id === active.heroId)];
  const seated = [...new Set(active.cards)];

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
            <input
              value={active.name}
              maxLength={32}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label>
            Leader
            <select
              value={active.heroId}
              onChange={(e) => {
                patch({ heroId: e.target.value });
                setNote(null);
              }}
            >
              {leaders.map((h) => (
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
              const h = leaders.find((x) => x.id === active.heroId);
              if (h) setInspect(h);
            }}
          >
            Read the leader
          </button>
          <p className="deck-count" data-testid="deck-count">
            {active.cards.length} / 30–40
            {active.id === fieldId && !active.fresh ? ' · on the field' : ''}
            {active.fresh ? ' · not sealed' : ''}
          </p>
        </div>
      </header>

      <div className="deck-tabs" role="tablist" aria-label="Workings">
        {drafts.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === active.id}
            className={d.id === active.id ? 'brass-btn brass-btn-solid deck-tab' : 'brass-btn deck-tab'}
            onClick={() => {
              setActiveId(d.id);
              setNote(null);
            }}
          >
            {d.name || 'Untitled'}
            {d.id === fieldId && !d.fresh ? ' · field' : ''}
          </button>
        ))}
        <button
          type="button"
          className="brass-btn brass-btn-ghost deck-tab"
          data-testid="new-working"
          disabled={drafts.length >= MAX_WORKINGS}
          onClick={newWorking}
        >
          New working
        </button>
      </div>

      {note && (
        <p className="deck-note" role="alert" data-testid="deck-note">
          {note}
        </p>
      )}

      <div className="deck-editor-body">
        <div className="deck-pool">
          <input
            type="search"
            placeholder="Filter owned plates…"
            aria-label="Filter owned plates"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {pool.length === 0 && (
            <p className="lede">
              {filter.trim()
                ? 'No owned plate matches that.'
                : 'You do not own a plate that can sit in this working yet. Break a seal, or visit the night counter.'}
            </p>
          )}
          <div className="deck-pool-grid">
            {pool.map((c) => {
              const have = counts[c.id] ?? 0;
              const cap = Math.min(3, owned[c.id] ?? 0);
              return (
                <article key={c.id} className={`deck-plate rarity-${c.rarity}`}>
                  <button
                    type="button"
                    className="deck-plate-look"
                    onClick={() => setInspect(c)}
                    title={`Own ${owned[c.id] ?? 0} · in working ${have} · tap to read`}
                  >
                    <CardArt name={c.name} className="deck-plate-art" />
                    <span className="deck-plate-name">{c.name}</span>
                  </button>
                  <span className="deck-plate-stats">
                    <em>L{c.cost}</em>
                    {c.power != null ? <em>P{c.power}</em> : <em>{c.kind}</em>}
                  </span>
                  <div className="deck-stepper">
                    <button
                      type="button"
                      className="brass-btn"
                      disabled={have === 0}
                      aria-label={`Remove one ${c.name}`}
                      onClick={() => remove(c.id)}
                    >
                      −
                    </button>
                    <span>
                      {have}/{cap}
                    </span>
                    <button
                      type="button"
                      className="brass-btn brass-btn-solid"
                      disabled={have >= cap || active.cards.length >= 40}
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
          <p className="lede">
            Tap a name to set one copy aside. Tap the portrait to read the plate — that no longer
            seats a copy.
          </p>
          <ul>
            {seated.map((id) => {
              const c = cardById(id);
              if (!c) return null;
              const over = (counts[id] ?? 0) > Math.min(3, owned[id] ?? 0);
              return (
                <li key={id}>
                  <button type="button" onClick={() => remove(id)}>
                    {c.name} ×{counts[id]}
                    {over ? ' · over owned' : ''}
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
        <button
          type="button"
          className="brass-btn brass-btn-ghost"
          data-testid="delete-working"
          onClick={deleteWorking}
          disabled={drafts.length <= 1}
        >
          Delete working
        </button>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </div>
      <p className="lede">
        Sealing puts this working on the field for Training, the Leaden Hour, and the Grimoire.
        Friend Working can still pick any sealed list.
      </p>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
