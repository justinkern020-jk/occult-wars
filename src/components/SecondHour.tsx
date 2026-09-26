import {
  SECOND_HOUR_SOCIETIES,
  SECOND_HOUR_ALLIES,
  SECOND_HOUR_BLURBS,
  type SecondHourSociety,
} from '../game/orders';
import { mapsForEra } from '../game/maps';
import { brassClick } from '../game/sfx';
import type { Profile } from '../game/profile';
import { CARDS } from '../data/catalog';
import { buildOrderAllyWorkingIds } from '../game/deck';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onEnterYard: (mapId: string, order: string) => void;
  onBack: () => void;
};

export function SecondHour({ profile, onUpdate, onEnterYard, onBack }: Props) {
  const sworn = profile.secondOrder as SecondHourSociety | null;
  const yards = mapsForEra('second');

  function swear(order: SecondHourSociety) {
    brassClick();
    const hero = CARDS.find((c) => c.kind === 'hero' && c.faction === order);
    const cards = buildOrderAllyWorkingIds(order, 30);
    onUpdate({
      ...profile,
      secondOrder: order,
      secondHero: hero?.id ?? null,
      secondCards: cards,
    });
  }

  if (!sworn) {
    return (
      <section className="second-hour" data-testid="second-hour-oath">
        <p className="plate-kicker">The hour after</p>
        <h2>Four societies took what the six left</h2>
        <p className="lede">
          Swear a second-hour society. Blackout streets. Ally jewel still binds.
        </p>
        <div className="allegiance-grid">
          {SECOND_HOUR_SOCIETIES.map((order) => (
            <button
              key={order}
              type="button"
              className="allegiance-card brass-btn"
              onClick={() => swear(order)}
            >
              <span className="allegiance-order">{order}</span>
              <span className="allegiance-ally">
                Ally · {SECOND_HOUR_ALLIES[order]}
              </span>
              <span className="allegiance-blurb">{SECOND_HOUR_BLURBS[order]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  return (
    <section className="second-hour" data-testid="second-hour-yard">
      <p className="plate-kicker">Second Hour · {sworn}</p>
      <h2>Choose the yard</h2>
      <p className="lede">
        Ally jewel · {SECOND_HOUR_ALLIES[sworn]}. Blackout street rules — same
        Cabals dual-Power, darker ground.
      </p>
      <div className="map-grid">
        {yards.map((m) => (
          <button
            key={m.id}
            type="button"
            className="map-card brass-btn brass-btn-solid"
            data-testid={`yard-${m.id}`}
            onClick={() => {
              brassClick();
              onEnterYard(m.id, sworn);
            }}
          >
            <span className="map-card-name">{m.name}</span>
            <span className="map-card-sub">{m.epithet}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="brass-btn brass-btn-ghost"
        onClick={() =>
          onUpdate({
            ...profile,
            secondOrder: null,
            secondHero: null,
            secondCards: null,
          })
        }
      >
        Break the second oath
      </button>
      <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
        Return
      </button>
    </section>
  );
}
