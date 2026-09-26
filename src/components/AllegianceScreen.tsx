import {
  FIRST_HOUR_ORDERS,
  FIRST_HOUR_PAIR_BLURBS,
  FIRST_HOUR_ALLIES,
  type FirstHourOrder,
} from '../game/orders';
import { brassClick } from '../game/sfx';

type Props = {
  onSwear: (order: FirstHourOrder) => void;
  onBack?: () => void;
};

export function AllegianceScreen({ onSwear, onBack }: Props) {
  return (
    <section className="allegiance-root plate-screen" data-testid="allegiance">
      <p className="plate-kicker">The first hour</p>
      <h2 className="allegiance-title">Swear your order</h2>
      <p className="lede">
        Choose a primary order. Its ally jewel sits with you in the yard — legal
        plates are order and ally only. Six pairs. One leaden hour.
      </p>
      <div className="allegiance-grid">
        {FIRST_HOUR_ORDERS.map((order) => {
          const ally = FIRST_HOUR_ALLIES[order];
          return (
            <button
              key={order}
              type="button"
              className="allegiance-card brass-btn"
              data-testid={`swear-${order}`}
              onClick={() => {
                brassClick();
                onSwear(order);
              }}
            >
              <span className="allegiance-order">{order}</span>
              <span className="allegiance-ally">Ally jewel · {ally}</span>
              <span className="allegiance-blurb">{FIRST_HOUR_PAIR_BLURBS[order]}</span>
            </button>
          );
        })}
      </div>
      {onBack && (
        <button type="button" className="brass-btn brass-btn-ghost mt-door" onClick={onBack}>
          Return
        </button>
      )}
    </section>
  );
}
