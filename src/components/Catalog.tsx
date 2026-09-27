import { useMemo, useState } from 'react';
import { CARDS, isExcludedPlateId } from '../data/catalog';
import {
  countOwned,
  exportLedger,
  importLedger,
  type Profile,
} from '../game/profile';
import { CardView } from './CardView';
import { TarotPop } from './TarotPop';
import { FIRST_HOUR_ORDERS, isSecondHourSociety } from '../game/orders';

type Props = {
  profile?: Profile;
  onUpdate?: (p: Profile) => void;
};

/**
 * The Collection is a full First Hour encyclopedia: every order plate,
 * cryptid, secret unlock, and nuke-aftermath Tarot — owned or not.
 * Second Hour societies stay on Second Hour matches (deliberately
 * filtered here since efa2bf7). Pack/deck/hand leak rules are unchanged;
 * excluded plates appear as archive-only faces, never auto-unlocked.
 */
export function Catalog({ profile, onUpdate }: Props) {
  const [faction, setFaction] = useState<string>('all');
  const [q, setQ] = useState('');
  const [unitsOnly, setUnitsOnly] = useState(false);
  /** Default off: Collection shows the full archive, not inventory. */
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [cryptidsOnly, setCryptidsOnly] = useState(false);
  const [kind, setKind] = useState<string>('all');
  const [inspect, setInspect] = useState<(typeof CARDS)[number] | null>(null);
  const owned = useMemo(
    () => (profile ? countOwned(profile.collection) : {}),
    [profile],
  );

  const list = useMemo(() => {
    // First Hour complete set + Unaligned specials (secrets / nuke aftermath).
    // Do NOT filter isExcludedPlateId — those plates browse here as archive faces.
    let rows = CARDS.filter((c) => !isSecondHourSociety(c.faction));
    if (unitsOnly) rows = rows.filter((c) => c.kind === 'unit');
    if (cryptidsOnly) rows = rows.filter((c) => c.keywords.includes('cryptid'));
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
  }, [faction, q, unitsOnly, ownedOnly, cryptidsOnly, kind, profile, owned]);

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

  function ownershipLabel(id: string): string {
    if (isExcludedPlateId(id)) return 'Archive · never owned';
    const n = owned[id] ?? 0;
    if (n > 0) return `Owned ×${n}`;
    return 'Locked';
  }

  return (
    <section className="catalog plate-screen" data-testid="collection">
      <h2>The Collection</h2>
      <p className="lede">
        Encyclopedia of every First Hour plate — units, rites, devices, leaders,
        cryptids, secrets, and nuke aftermath. Cabals dual-Power.
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
          <option value="Unaligned">Unaligned</option>
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
        <label className="check">
          <input
            type="checkbox"
            checked={cryptidsOnly}
            onChange={(e) => setCryptidsOnly(e.target.checked)}
          />
          Cryptids
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
        {list.map((c) => {
          const count = owned[c.id] ?? 0;
          const archiveOnly = isExcludedPlateId(c.id);
          const locked = !!profile && !archiveOnly && count === 0;
          const wrapCls = [
            'catalog-card-wrap',
            locked ? 'catalog-locked' : '',
            archiveOnly ? 'catalog-archive' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={`${c.faction}-${c.id}`} className={wrapCls}>
              <CardView card={c} onClick={() => setInspect(c)} />
              {profile && (
                <p
                  className={`owned-count${locked ? ' owned-locked' : ''}${
                    archiveOnly ? ' owned-archive' : ''
                  }`}
                >
                  {ownershipLabel(c.id)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {inspect && <TarotPop card={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
}
