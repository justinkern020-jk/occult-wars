import { useMemo, useState } from 'react';
import { CARDS } from '../data/catalog';
import {
  countOwned,
  exportLedger,
  importLedger,
  type Profile,
} from '../game/profile';
import { CardView } from './CardView';
import { TarotPop } from './TarotPop';
import { FIRST_HOUR_ORDERS, isSecondHourSociety } from '../game/orders';
import { isExcludedPlateId } from '../data/catalog';

type Props = {
  profile?: Profile;
  onUpdate?: (p: Profile) => void;
};

export function Catalog({ profile, onUpdate }: Props) {
  const [faction, setFaction] = useState<string>('all');
  const [q, setQ] = useState('');
  const [unitsOnly, setUnitsOnly] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(!!profile);
  const [kind, setKind] = useState<string>('all');
  const [inspect, setInspect] = useState<(typeof CARDS)[number] | null>(null);
  const owned = useMemo(
    () => (profile ? countOwned(profile.collection) : {}),
    [profile],
  );

  const list = useMemo(() => {
    let rows = CARDS.filter(
      (c) => !isSecondHourSociety(c.faction) && !isExcludedPlateId(c.id),
    );
    if (unitsOnly) rows = rows.filter((c) => c.kind === 'unit');
    if (kind !== 'all') rows = rows.filter((c) => c.kind === kind);
    if (faction !== 'all') rows = rows.filter((c) => c.faction === faction);
    if (ownedOnly && profile) {
      rows = rows.filter((c) => (owned[c.id] ?? 0) > 0);
    }
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
  }, [faction, q, unitsOnly, ownedOnly, kind, profile, owned]);

  function doExport() {
    if (!profile) return;
    const blob = new Blob([exportLedger(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'occult-wars-ledger.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport() {
    if (!onUpdate) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = importLedger(text);
      if ('error' in result) {
        alert(result.error);
        return;
      }
      onUpdate(result.profile);
    };
    input.click();
  }

  return (
    <section className="catalog plate-screen" data-testid="collection">
      <h2>The Collection</h2>
      <p className="lede">
        Archive of every plate in this working. Cabals dual-Power.
        {profile ? (
          <>
            {' '}
            You hold <strong>{profile.collection.length}</strong> plates ·{' '}
            <strong>{profile.alchemicalShards}</strong> shards.
          </>
        ) : null}
      </p>
      <div className="catalog-filters">
        <input
          type="search"
          placeholder="Search name, text, keyword…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={faction} onChange={(e) => setFaction(e.target.value)}>
          <option value="all">All factions</option>
          {FIRST_HOUR_ORDERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          <option value="unit">Units</option>
          <option value="rite">Rites</option>
          <option value="device">Devices</option>
          <option value="hero">Leaders</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={unitsOnly}
            onChange={(e) => setUnitsOnly(e.target.checked)}
          />
          Units only
        </label>
        {profile && (
          <label className="check">
            <input
              type="checkbox"
              checked={ownedOnly}
              onChange={(e) => setOwnedOnly(e.target.checked)}
            />
            Owned plates
          </label>
        )}
        <span className="count">{list.length} cards</span>
      </div>
      {profile && onUpdate && (
        <div className="catalog-ledger">
          <button type="button" className="brass-btn" onClick={doExport}>
            Export ledger
          </button>
          <button type="button" className="brass-btn" onClick={doImport}>
            Import ledger
          </button>
        </div>
      )}
      <div className="card-grid">
        {list.map((c) => (
          <div key={`${c.faction}-${c.id}`} className="catalog-card-wrap">
            <CardView card={c} onClick={() => setInspect(c)} />
            {profile && (
              <p className="owned-count">
                Owned ×{owned[c.id] ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
