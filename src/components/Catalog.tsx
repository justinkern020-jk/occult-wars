import { useMemo, useState } from 'react';
import { CARDS, FACTIONS, UNITS } from '../data/catalog';
import { CardView } from './CardView';

export function Catalog() {
  const [faction, setFaction] = useState<string>('all');
  const [q, setQ] = useState('');
  const [unitsOnly, setUnitsOnly] = useState(true);

  const list = useMemo(() => {
    let rows = unitsOnly ? UNITS : CARDS;
    if (faction !== 'all') rows = rows.filter((c) => c.faction === faction);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(n) ||
          c.text.toLowerCase().includes(n) ||
          c.keywords.some((k) => k.includes(n)),
      );
    }
    return rows;
  }, [faction, q, unitsOnly]);

  return (
    <section className="catalog">
      <h2>Card catalog</h2>
      <div className="catalog-filters">
        <input
          type="search"
          placeholder="Search name, text, keyword…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={faction} onChange={(e) => setFaction(e.target.value)}>
          <option value="all">All factions</option>
          {FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={unitsOnly}
            onChange={(e) => setUnitsOnly(e.target.checked)}
          />
          Units only
        </label>
        <span className="count">{list.length} cards</span>
      </div>
      <div className="card-grid">
        {list.map((c) => (
          <CardView key={`${c.faction}-${c.id}`} card={c} />
        ))}
      </div>
    </section>
  );
}
