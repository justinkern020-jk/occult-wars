import type { GameMap } from '../game/maps';

/**
 * Tiny 5×5 glyph of a field's shape (voids, seals, gates, strongholds).
 * `overlay` sits it in the corner of a `.map-thumb` art card (as on the main menu).
 */
export function MapMini({ map, overlay = false }: { map: GameMap; overlay?: boolean }) {
  return (
    <span className={overlay ? 'map-mini' : 'map-mini map-mini-plain'} aria-hidden>
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
