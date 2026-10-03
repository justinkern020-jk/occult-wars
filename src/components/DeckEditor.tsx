import { useEffect, useMemo, useRef, useState } from 'react';
import { CARDS, cardById, isExcludedPlateId } from '../data/catalog';
import {
  allyOf,
  isLegalForOrder,
  type FirstHourOrder,
} from '../game/orders';
import {
  eraOrder,
  heroesForOrder,
  isLegalDeck,
  oldDecksForOrder,
  ownedForEra,
  type CustomDeck,
  type DeckEra,
  type Profile,
} from '../game/profile';
import { buildOrderAllyWorkingIds, validateDeck } from '../game/deck';
import { strongestBySims, strongestDeck } from '../game/autoDeck';
import { brassClick } from '../game/sfx';
import { readHourOpen } from '../game/hourUnlock';
import { CardArt } from './CardArt';
import { TarotPop } from './TarotPop';
import type { Card } from '../game/types';

/** A shelf holds this many workings. */
export const MAX_WORKINGS = 8;

export type { DeckEra };
export { eraOrder, ownedForEra };
export const DECK_ERA_NAME: Record<DeckEra, string> = {
  first: 'First Hour',
  second: 'Second Hour',
  old: 'Sealed Century',
};
const ERA_FIELDS: Record<DeckEra, string> = {
  first: 'Training, the Leaden Hour, Pass the Grimoire and friend matches',
  second: 'the Second Hour yard',
  old: 'the Sealed Century',
};

/** Eras whose editor keeps a shelf of up to eight workings. */
export function eraHasShelf(era: DeckEra): boolean {
  return era === 'first' || era === 'old';
}

/** Where to buy more plates for an era's working. */
function eraShopHint(era: DeckEra): string {
  if (era === 'old') return ' Buy plates at the sealed counter in the Sealed Century.';
  return ` Break a seal${readHourOpen() ? ' or visit the night counter' : ''}.`;
}

export function eraDraft(profile: Profile, era: DeckEra): DraftWorking[] {
  const order = eraOrder(profile, era);
  if (!order) return [];
  if (era === 'old') {
    const shelf = oldDecksForOrder(profile, order);
    if (shelf.length > 0) {
      return shelf.map((d) => ({ id: d.id, name: d.name, heroId: d.heroId, cards: [...d.cards], fresh: false }));
    }
  }
  const heroId = (era === 'second' ? profile.secondHero : profile.oldHero) ?? heroesForOrder(order)[0]?.id ?? '';
  const cards = (era === 'second' ? profile.secondCards : profile.oldCards) ?? buildOrderAllyWorkingIds(order, 30);
  return [{ id: `${era}-working`, name: `${DECK_ERA_NAME[era]} working`, heroId, cards: [...cards], fresh: false }];
}

/** Plates the editor offers for a working: owned, seatable, and legal for the order (+ ally). */
export function editorPool(
  order: string | null,
  owned: Record<string, number>,
  filter = '',
): Card[] {
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
}

type Props = {
  profile: Profile;
  onSave: (deck: CustomDeck, era: DeckEra) => void;
  /** Drop a sealed working from that era's shelf. */
  onDelete?: (id: string, era: DeckEra) => void;
  onBack: () => void;
  /** Open on this hour's tab (e.g. from the Sealed Century screen). */
  initialEra?: DeckEra;
  /** Label for the Return button. */
  returnLabel?: string;
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

export function DeckEditor({ profile, onSave, onDelete, onBack, initialEra, returnLabel = 'Return' }: Props) {
  const [inspect, setInspect] = useState<Card | null>(null);
  const eras = (['first', 'second', 'old'] as DeckEra[]).filter((e) => !!eraOrder(profile, e));
  const [era, setEra] = useState<DeckEra>(
    initialEra && eras.includes(initialEra) ? initialEra : (eras[0] ?? 'first'),
  );
  const shelf = eraHasShelf(era);
  const order = eraOrder(profile, era) as FirstHourOrder | null;
  const [shelves, setShelves] = useState<Record<DeckEra, DraftWorking[]>>(() => ({
    first: draftsFromProfile(profile),
    second: eraDraft(profile, 'second'),
    old: eraDraft(profile, 'old'),
  }));
  const drafts = shelves[era];
  const setDrafts = (fn: (all: DraftWorking[]) => DraftWorking[]) =>
    setShelves((sh) => ({ ...sh, [era]: fn(sh[era]) }));
  const [activeByEra, setActiveByEra] = useState<Record<DeckEra, string>>(() => ({
    first: draftsFromProfile(profile)[0]?.id ?? '',
    second: 'second-working',
    old: eraDraft(profile, 'old')[0]?.id ?? 'old-working',
  }));
  const activeId = activeByEra[era];
  const setActiveId = (id: string) => setActiveByEra((m) => ({ ...m, [era]: id }));
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  /** Trial sittings in progress (0–1), or null. */
  const [testing, setTesting] = useState<number | null>(null);
  const testTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (testTimer.current != null) window.clearTimeout(testTimer.current);
    },
    [],
  );
  const owned = useMemo(() => ownedForEra(profile, era), [profile, era]);
  const ally = order ? allyOf(order) : null;
  const heroes = order ? heroesForOrder(order) : [];
  const active = drafts.find((d) => d.id === activeId) ?? drafts[0];
  /** The working the field takes (first sealed). */
  const fieldId =
    era === 'first'
      ? profile.customDecks[0]?.id
      : era === 'old'
        ? (oldDecksForOrder(profile)[0]?.id ?? 'old-working')
        : `${era}-working`;

  const pool = useMemo(() => editorPool(order, owned, filter), [order, owned, filter]);

  const counts = useMemo(() => {
    const t: Record<string, number> = {};
    for (const id of active?.cards ?? []) t[id] = (t[id] ?? 0) + 1;
    return t;
  }, [active?.cards]);

  function patch(next: Partial<DraftWorking>) {
    if (!active) return;
    setDirty(true);
    setDrafts((all) => all.map((d) => (d.id === active.id ? { ...d, ...next } : d)));
  }

  function strongest() {
    if (!active || !order || testing != null) return;
    const hero = cardById(active.heroId);
    const faction = hero?.faction ?? order;
    brassClick();
    const quick = strongestDeck(faction, owned);
    if (quick.short > 0) {
      patch({ cards: quick.cards });
      setNote({ text: `You own only ${quick.cards.length} plates this working may hold — it needs 30.${eraShopHint(era)}` });
      return;
    }
    // Let the candidate lists spar in short slices so the page stays live.
    const it = strongestBySims(faction, active.heroId, owned, active.cards);
    const forId = active.id;
    setTesting(0);
    const step = () => {
      const until = performance.now() + 40;
      for (;;) {
        const r = it.next();
        if (r.done) {
          testTimer.current = null;
          setTesting(null);
          setDrafts((all) => all.map((d) => (d.id === forId ? { ...d, cards: r.value.cards } : d)));
          setDirty(true);
          setNote({
            text:
              r.value.games > 0
                ? `The strongest of ${r.value.candidates} candidate decks (won ${Math.round(r.value.winRate * 100)}% of ${r.value.games} trial sittings) is seated. Save the deck to take it onto the field.`
                : `The strongest ${r.value.cards.length} of your plates are seated. Save the deck to take it onto the field.`,
          });
          return;
        }
        setTesting(r.value);
        if (performance.now() > until) break;
      }
      testTimer.current = window.setTimeout(step, 0);
    };
    testTimer.current = window.setTimeout(step, 0);
  }

  function add(id: string) {
    if (!active) return;
    const have = counts[id] ?? 0;
    if (have >= Math.min(3, owned[id] ?? 0)) {
      setNote({ text: have >= 3 ? 'At most 3 copies.' : 'You do not own another copy.' });
      return;
    }
    if (active.cards.length >= 40) {
      setNote({ text: 'A working holds at most 40 plates.' });
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
      setNote({ text: 'Eight workings is the shelf. Delete one first.' });
      return;
    }
    const id = `${era === 'first' ? '' : `${era}-`}working-${Date.now()}`;
    brassClick();
    setDrafts((all) => [
      ...all,
      { id, name: 'Untitled working', heroId: heroes[0]?.id ?? '', cards: [], fresh: true },
    ]);
    setActiveId(id);
    setNote({ text: 'New working. Save it to keep it — and to take it onto the field.' });
  }

  function deleteWorking() {
    if (!active) return;
    if (drafts.length <= 1) {
      setNote({ text: 'Keep at least one working.' });
      return;
    }
    const rest = drafts.filter((d) => d.id !== active.id);
    brassClick();
    setDrafts(() => rest);
    setActiveId(rest[0]?.id ?? '');
    if (!active.fresh) onDelete?.(active.id, era);
    setNote({ text: active.fresh ? 'Discarded the unsealed working.' : 'That working left the ledger.' });
  }

  function save() {
    if (!active) return;
    const v = validateDeck(active.heroId, active.cards);
    if (!v.ok) {
      setNote({ text: v.error });
      return;
    }
    for (const [id, n] of Object.entries(counts)) {
      const have = owned[id] ?? 0;
      if (n > have) {
        setNote({ text: `You only own ${have} of ${cardById(id)?.name ?? 'that plate'}.` });
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
      setNote({ text: 'A working needs one leader and 30–40 cards from that order and its ally.' });
      return;
    }
    brassClick();
    onSave(deck, era);
    setDrafts((all) => all.map((d) => (d.id === deck.id ? { ...d, ...deck, fresh: false } : d)));
    setDirty(false);
    setNote({ text: `Saved. “${deck.name}” is your ${DECK_ERA_NAME[era]} deck on the field for ${ERA_FIELDS[era]}.`, ok: true });
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
    <section className="deck-editor plate-screen" data-testid="deck-editor" data-era={era}>
      {eras.length > 1 && (
        <div className="deck-eras" role="tablist" aria-label="Hour">
          {eras.map((e) => (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={e === era}
              data-testid={`deck-era-${e}`}
              disabled={testing != null}
              className={e === era ? 'brass-btn brass-btn-solid deck-tab' : 'brass-btn deck-tab'}
              onClick={() => {
                if (e === era) return;
                if (dirty && !window.confirm('Leave this hour without saving your changes?')) return;
                setEra(e);
                setDirty(false);
                setNote(null);
                setFilter('');
              }}
            >
              {DECK_ERA_NAME[e]}
            </button>
          ))}
        </div>
      )}
      <header className="deck-editor-head">
        <div>
          <p className="plate-kicker">Deck editor · {DECK_ERA_NAME[era]}</p>
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
            {active.fresh ? ' · not saved' : ''}
          </p>
        </div>
      </header>

      {shelf && (
      <div className="deck-tabs" role="tablist" aria-label="Workings" data-testid="deck-shelf">
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
                : `You do not own a plate that can sit in this working yet.${eraShopHint(era)}`}
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

      <p className="lede">
        Saving puts this deck on the field for {ERA_FIELDS[era]}.
        {era === 'first' ? ' Friend Working can still pick any saved deck.' : ''}
      </p>
      <div className="deck-editor-actions deck-save-bar" data-testid="deck-save-bar">
        <span className="deck-save-count" data-testid="deck-save-count">
          {active.cards.length} / 30–40{dirty ? ' · unsaved changes' : active.fresh ? ' · not saved' : ' · saved'}
        </span>
        {note && (
          <p
            className={`deck-note${note.ok ? ' deck-note-ok' : ''}`}
            role={note.ok ? 'status' : 'alert'}
            aria-live="polite"
            data-testid="deck-note"
          >
            {note.text}
          </p>
        )}
        <button
          type="button"
          className="brass-btn"
          data-testid="deck-strongest"
          onClick={strongest}
          disabled={testing != null}
          title="Builds the strongest legal deck from the plates you own (trial sittings between candidate lists)"
        >
          {testing != null ? `Testing decks… ${Math.round(testing * 100)}%` : 'Strongest deck'}
        </button>
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="deck-save"
          onClick={save}
          disabled={testing != null}
        >
          Save deck
        </button>
        {shelf && (
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            data-testid="delete-working"
            onClick={deleteWorking}
            disabled={drafts.length <= 1}
          >
            Delete working
          </button>
        )}
        <button
          type="button"
          className="brass-btn brass-btn-ghost"
          data-testid="deck-return"
          onClick={() => {
            if (dirty && !window.confirm('Return without saving your changes?')) return;
            onBack();
          }}
        >
          {returnLabel}
        </button>
      </div>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
