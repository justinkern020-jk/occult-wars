import type { GameMap } from '../game/maps';

/** Tiny 5×5 glyph of a field's shape (voids, seals, gates, strongholds). */
export function MapMini({ map }: { map: GameMap }) {
  return (
    <span className="map-mini map-mini-plain" aria-hidden>
      {map.tiles.flat().map((t, i) => (
        <span
          key={i}
          className={`mini-cell ${
            t.kind === 'void'
              ? 'mini-void'
              : t.kind === 'stronghold'
                ? 'mini-stronghold'
                : t.kind === 'gate'
                  ? 'mini-gate'
                  : t.kind === 'resource'
                    ? t.symbols === 2
                      ? 'mini-res-2'
                      : 'mini-res'
                    : 'mini-street'
          }`}
        />
      ))}
    </span>
  );
}
