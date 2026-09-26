import { MAPS, type GameMap } from '../game/maps';

type Props = {
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  onTraining: () => void;
  onCollection: () => void;
  onSandbox: () => void;
};

function doubleNodeCount(map: GameMap): number {
  return map.tiles.flat().filter((t) => t.kind === 'resource' && t.symbols === 2)
    .length;
}

function MiniTile({ kind, symbols }: { kind: string; symbols?: number }) {
  const cls =
    kind === 'void'
      ? 'mini-void'
      : kind === 'stronghold'
        ? 'mini-stronghold'
        : kind === 'gate'
          ? 'mini-gate'
          : kind === 'resource'
            ? symbols === 2
              ? 'mini-res-2'
              : 'mini-res'
            : 'mini-street';
  return <span className={`mini-cell ${cls}`} />;
}

export function MenuAtelier({
  selectedMapId,
  onSelectMap,
  onTraining,
  onCollection,
  onSandbox,
}: Props) {
  return (
    <div className="menu-root" data-testid="main-menu">
      <section
        className="menu-stage"
        style={{ backgroundImage: 'url(/assets/titles/menu-atelier.jpg)' }}
      >
        <div className="menu-veil">
          <p className="menu-presents">Kern presents...</p>
          <h1 className="menu-title">Occult Wars</h1>
          <p className="menu-lede">
            Six orders. One leaden hour. Cabals dual-Power — vitality and damage
            as one number. Loyalty banks the muster.
          </p>

          <button
            type="button"
            className="menu-door brass-btn brass-btn-solid mt-door-hero"
            data-testid="start-training"
            onClick={onTraining}
          >
            <span className="menu-door-glyph" aria-hidden>
              ✦
            </span>
            <span className="menu-door-copy">
              <span className="menu-door-title">Training Rite</span>
              <span className="menu-door-sub">
                A rival order, alone on the circle
              </span>
            </span>
          </button>

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-collection"
              onClick={onCollection}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✹
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Collection</span>
                <span className="menu-door-sub">
                  Archive of every plate in this working
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-leaden"
              onClick={onTraining}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⬡
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Leaden Hour</span>
                <span className="menu-door-sub">
                  Enter the field. Close each circle.
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="plate field-picker">
        <p className="plate-kicker">Choose the field</p>
        <div className="map-grid">
          {MAPS.map((m) => {
            const doubles = doubleNodeCount(m);
            const active = m.id === selectedMapId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                data-testid={`map-${m.id}`}
                className={`map-card brass-btn ${active ? 'brass-btn-solid' : ''}`}
                onClick={() => onSelectMap(m.id)}
              >
                <span
                  className="map-thumb"
                  style={{
                    backgroundImage: `url(/assets/maps/${m.id}.jpg)`,
                  }}
                >
                  <span className="map-mini" aria-hidden>
                    {m.tiles.flat().map((t, i) => (
                      <MiniTile key={i} kind={t.kind} symbols={t.symbols} />
                    ))}
                  </span>
                </span>
                <span className="map-card-name">{m.name}</span>
                <span className="map-card-sub">
                  {doubles === 0 ? 'No double seal' : `${doubles} nodes worth 2`}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="brass-btn brass-btn-solid enter-field-btn"
          onClick={onTraining}
        >
          Enter the field
        </button>
      </section>

      <p className="menu-dev">
        <button type="button" className="dev-link" onClick={onSandbox}>
          Rites desk
        </button>
        <span aria-hidden> · </span>
        <a href="https://occultwar.grok.me" target="_blank" rel="noreferrer">
          Reference on grok.me
        </a>
      </p>
    </div>
  );
}
