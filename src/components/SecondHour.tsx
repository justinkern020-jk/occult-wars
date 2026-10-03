import {
  SECOND_HOUR_SOCIETIES,
  SECOND_HOUR_ALLIES,
  SECOND_HOUR_BLURBS,
  isSecondHourSociety,
  type SecondHourSociety,
} from '../game/orders';
import { mapsForEra } from '../game/maps';
import { brassClick } from '../game/sfx';
import type { Profile } from '../game/profile';
import { CARDS } from '../data/catalog';
import { buildOrderAllyWorkingIds } from '../game/deck';
import { MapMini } from './MapMini';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onEnterYard: (mapId: string, order: SecondHourSociety) => void;
  onShop: () => void;
  onBack: () => void;
};

export function SecondHour({ profile, onUpdate, onEnterYard, onShop, onBack }: Props) {
  const sworn =
    profile.secondOrder && isSecondHourSociety(profile.secondOrder)
      ? profile.secondOrder
      : null;
  const yards = mapsForEra('second');

  function swear(order: SecondHourSociety) {
    brassClick();
    const hero = CARDS.find((c) => c.kind === 'hero' && c.faction === order);
    const cards = buildOrderAllyWorkingIds(order, 30);
    const collection =
      hero && !profile.collection.includes(hero.id)
        ? [...profile.collection, hero.id]
        : profile.collection;
    onUpdate({
      ...profile,
      collection,
      secondOrder: order,
      secondHero: hero?.id ?? null,
      secondCards: cards,
    });
  }

  if (!sworn) {
    return (
      <section className="second-hour plate-screen" data-testid="second-hour-oath">
        <p className="plate-kicker">The hour after</p>
        <h2>Swear an order of the hour after</h2>
        <p className="lede">
          Not floodlights, not a gala, not another sorcerer in a new coat. The
          Whitethorn Coven is witches, Celtic law, and the sidhe. The Helix Bureau
          is occult industry — mad scientists and machines that outran the decade.
          The Monad Faculty is alchemists and metaphysical mathematics. The
          Iconostasy is Slavic: grizzled shamans and mad monks. Swear one. Your
          ally jewel still fills the working. Their plates are sold at the night
          counter, not in the seals.
        </p>
        <div className="allegiance-grid">
          {SECOND_HOUR_SOCIETIES.map((order) => (
            <button
              key={order}
              type="button"
              className="allegiance-card brass-btn"
              data-testid={`second-swear-${order}`}
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
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onShop}>
          Night counter
        </button>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  return (
    <section className="second-hour plate-screen" data-testid="second-hour-yard">
      <p className="plate-kicker">Second Hour · {sworn}</p>
      <h2>Choose the yard</h2>
      <p className="lede">
        Ally jewel · {SECOND_HOUR_ALLIES[sworn]}. The rival across the yard is the
        other tradition, not your ally. Cabals dual-Power.
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
            <MapMini map={m} />
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
      <button type="button" className="brass-btn brass-btn-ghost" onClick={onShop}>
        Night counter
      </button>
      <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
        Return
      </button>
    </section>
  );
}
