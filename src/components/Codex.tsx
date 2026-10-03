/**
 * The Codex: a book of every plate, filled in as the adept collects or meets
 * them. Shut pages show only a silhouette; cryptids show nothing until
 * sighted. Each open page carries the art, the epigraph and a short note of
 * the real history or folklore behind it. Justin and Seth Kern have no page.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Card } from '../game/types';
import type { Profile } from '../game/profile';
import { CODEX_CARDS, codexOpen, isCryptid } from '../game/codexUnlock';
import { FIRST_HOUR_ORDERS, SECOND_HOUR_SOCIETIES, SEALED_CENTURY_ORDERS } from '../game/orders';
import { readHourOpen } from '../game/hourUnlock';
import { codexBlurb, ORDER_LORE } from '../data/codexLore';
import { CardArt } from './CardArt';
import { brassClick } from '../game/sfx';

type Era = 'first' | 'second' | 'old';
const ERA_ORDERS: Record<Era, readonly string[]> = {
  first: [...FIRST_HOUR_ORDERS, 'Unaligned'],
  second: SECOND_HOUR_SOCIETIES,
  old: SEALED_CENTURY_ORDERS,
};
const ERA_LABEL: Record<Era, string> = {
  first: 'The First Hour',
  second: 'The Second Hour',
  old: 'The Sealed Century',
};
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, patron: 3 };

export function Codex({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const hourOpen = readHourOpen();
  const eras: Era[] = hourOpen ? ['first', 'second', 'old'] : ['first', 'old'];
  const [era, setEra] = useState<Era>('first');
  const [page, setPage] = useState<Card | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const owned = useMemo(() => new Set(profile.collection), [profile.collection]);
  const visible = useMemo(
    () => CODEX_CARDS.filter((c) => hourOpen || !(SECOND_HOUR_SOCIETIES as readonly string[]).includes(c.faction)),
    [hourOpen],
  );
  const openCount = visible.filter((c) => codexOpen(profile, c, owned)).length;

  const byOrder = useMemo(() => {
    const out: { order: string; cards: Card[] }[] = [];
    for (const order of ERA_ORDERS[era]) {
      const cards = visible
        .filter((c) => c.faction === order)
        .sort(
          (a, b) =>
            (a.kind === 'hero' ? -1 : 0) - (b.kind === 'hero' ? -1 : 0) ||
            RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] ||
            a.name.localeCompare(b.name),
        );
      if (cards.length) out.push({ order, cards });
    }
    return out;
  }, [era, visible]);

  return (
    <section className="codex" data-testid="codex">
      <header className="codex-head">
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return to the atelier
        </button>
        <div>
          <p className="plate-kicker">A book of what walks the field</p>
          <h1 className="codex-title">The Codex</h1>
          <p className="codex-count" data-testid="codex-count">
            {openCount} of {visible.length} pages written
          </p>
        </div>
      </header>
      <nav className="codex-tabs" role="tablist" aria-label="Era">
        {eras.map((e) => (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={era === e}
            className={`codex-tab${era === e ? ' is-on' : ''}`}
            onClick={() => {
              brassClick();
              setEra(e);
            }}
          >
            {ERA_LABEL[e]}
          </button>
        ))}
      </nav>
      {byOrder.map(({ order, cards }) => {
        const got = cards.filter((c) => codexOpen(profile, c, owned)).length;
        return (
          <div key={order} className="codex-order">
            <h2 className="codex-order-name">
              {order} <small>{got} / {cards.length}</small>
            </h2>
            {got > 0 && <p className="codex-order-lore">{ORDER_LORE[order]}</p>}
            <ul className="codex-grid">
              {cards.map((c) => {
                const open = codexOpen(profile, c, owned);
                const hidden = !open && isCryptid(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`codex-entry rarity-${c.rarity}${open ? '' : ' is-shut'}${hidden ? ' is-unseen' : ''}`}
                      data-testid={open ? 'codex-open' : 'codex-shut'}
                      onClick={() => {
                        if (!open) return;
                        brassClick();
                        setPage(c);
                      }}
                      aria-label={open ? c.name : hidden ? 'An unsighted thing' : 'A page not yet written'}
                      disabled={!open}
                    >
                      <span className="codex-entry-art">
                        {hidden ? <span className="codex-unseen">?</span> : <CardArt name={c.name} />}
                      </span>
                      <span className="codex-entry-name">{open ? c.name : hidden ? 'Unsighted' : '· · ·'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {page && (
        <div className="codex-page-scrim" role="dialog" aria-modal aria-label={page.name} onClick={() => setPage(null)}>
          <article className="codex-page" onClick={(e) => e.stopPropagation()} data-testid="codex-page">
            <div className="codex-page-art">
              <CardArt name={page.name} alt={page.name} />
            </div>
            <div className="codex-page-text">
              <p className="plate-kicker">
                {page.faction} · {page.rarity === 'patron' ? 'patron' : page.rarity} {page.kind}
              </p>
              <h2>{page.name}</h2>
              {page.quote && (
                <blockquote className="codex-quote">
                  “{page.quote}”{page.quoted && <cite>— {page.quoted}</cite>}
                </blockquote>
              )}
              <p className="codex-blurb">{codexBlurb(page)}</p>
              <button type="button" className="brass-btn" onClick={() => setPage(null)}>
                Close the page
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
