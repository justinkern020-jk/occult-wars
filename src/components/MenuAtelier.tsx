import { useEffect, useRef } from 'react';
import { MAPS, mapsForEra, type GameMap } from '../game/maps';
import { PACK_COST, type Profile } from '../game/profile';
import { brassClick } from '../game/sfx';

type Props = {
  profile: Profile;
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  onTraining: () => void;
  onCollection: () => void;
  onDeckEditor: () => void;
  onPack: () => void;
  onLeaden: () => void;
  onHotseat: () => void;
  onFriend: () => void;
  onSecond: () => void;
  onAllegiance: () => void;
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
  profile,
  selectedMapId,
  onSelectMap,
  onTraining,
  onCollection,
  onDeckEditor,
  onPack,
  onLeaden,
  onHotseat,
  onFriend,
  onSecond,
  onAllegiance,
  onSandbox,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firstMaps = mapsForEra('first');

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.22;
    const tryPlay = () => {
      void el.play().catch(() => {});
    };
    tryPlay();
    const unlock = () => tryPlay();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      el.pause();
    };
  }, []);

  const click = (fn: () => void) => () => {
    brassClick();
    fn();
  };

  return (
    <div className="menu-root" data-testid="main-menu">
      <audio
        ref={audioRef}
        src="/assets/audio/moonlight.mp3"
        loop
        preload="auto"
        aria-hidden
      />
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
          <p className="menu-shards" data-testid="shard-count">
            {profile.username} · {profile.alchemicalShards} shards
            {profile.allegiance ? ` · ${profile.allegiance}` : ' · unswear'}
          </p>

          <button
            type="button"
            className="menu-door brass-btn brass-btn-solid mt-door-hero"
            data-testid="start-training"
            onClick={click(onTraining)}
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
              data-testid="open-leaden"
              onClick={click(onLeaden)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⬡
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Leaden Hour</span>
                <span className="menu-door-sub">
                  Six stages. Close each circle.
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-hotseat"
              onClick={click(onHotseat)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⧉
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Pass the Grimoire</span>
                <span className="menu-door-sub">Two chairs, one working</span>
              </span>
            </button>
          </div>

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-friend"
              onClick={click(onFriend)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⟐
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Friend Working</span>
                <span className="menu-door-sub">4-letter room · WebRTC</span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-second"
              onClick={click(onSecond)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ◐
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The hour after</span>
                <span className="menu-door-sub">
                  Four societies · blackout yards
                </span>
              </span>
            </button>
          </div>

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-collection"
              onClick={click(onCollection)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✹
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Collection</span>
                <span className="menu-door-sub">
                  Owned plates · import / export
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-deck"
              onClick={click(onDeckEditor)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✎
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Deck Editor</span>
                <span className="menu-door-sub">1 leader · 30–40 plates</span>
              </span>
            </button>
          </div>

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn brass-btn-solid"
              data-testid="open-pack"
              onClick={click(onPack)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✧
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Break a Seal</span>
                <span className="menu-door-sub">
                  {PACK_COST} shards · five cards
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-allegiance"
              onClick={click(onAllegiance)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⚜
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">
                  {profile.allegiance ? 'Re-swear' : 'Swear an order'}
                </span>
                <span className="menu-door-sub">Primary + ally jewel</span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="plate field-picker">
        <p className="plate-kicker">Choose the field (Training)</p>
        <div className="map-grid">
          {firstMaps.map((m) => {
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
          onClick={click(onTraining)}
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
        <span aria-hidden> · </span>
        <span>{MAPS.length} maps loaded</span>
      </p>
    </div>
  );
}
