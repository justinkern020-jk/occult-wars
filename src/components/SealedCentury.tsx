import { useState } from 'react';
import { CARDS } from '../data/catalog';
import {
  SEALED_CENTURY_ALLIES,
  SEALED_CENTURY_BLURBS,
  SEALED_CENTURY_ORDERS,
  SEALED_CENTURY_RIVALS,
  isSealedCenturyOrder,
  type SealedCenturyOrder,
} from '../game/orders';
import { mapsForEra } from '../game/maps';
import { brassClick } from '../game/sfx';
import { SHARD_REWARDS, oldDecksForOrder, type Profile } from '../game/profile';
import { buildOrderAllyWorkingIds } from '../game/deck';
import { MapMini } from './MapMini';
import { AiMindPicker } from './AiMindPicker';
import { NightCounter } from './NightCounter';
import type { AiDifficulty } from '../game/ai';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onEnter: (mapId: string, order: SealedCenturyOrder, rival: SealedCenturyOrder) => void;
  /** Open the deck editor on its Sealed Century tab. */
  onDeckEditor: () => void;
  onBack: () => void;
  aiDifficulty?: AiDifficulty;
  onAiDifficulty?: (next: AiDifficulty) => void;
  /** Open straight onto the sealed counter (e.g. returning from the editor). */
  initialView?: 'field' | 'shop';
};

/** The Sealed Century: four loyalties of the old work, seven grounds. */
export function SealedCentury({
  profile,
  onUpdate,
  onEnter,
  onDeckEditor,
  onBack,
  aiDifficulty = 'expert',
  onAiDifficulty,
  initialView = 'field',
}: Props) {
  const sworn =
    profile.oldOrder && isSealedCenturyOrder(profile.oldOrder) ? profile.oldOrder : null;
  const [view, setView] = useState<'field' | 'shop'>(initialView);
  const grounds = mapsForEra('old');

  function swear(order: SealedCenturyOrder) {
    brassClick();
    const hero = CARDS.find((c) => c.kind === 'hero' && c.faction === order);
    // A working saved for this order before still waits on the shelf: it takes the field.
    const saved = oldDecksForOrder(profile, order)[0];
    const cards = saved ? [...saved.cards] : buildOrderAllyWorkingIds(order, 30);
    const collection =
      hero && !profile.collection.includes(hero.id)
        ? [...profile.collection, hero.id]
        : profile.collection;
    onUpdate({
      ...profile,
      collection,
      oldOrder: order,
      oldHero: saved?.heroId ?? hero?.id ?? null,
      oldCards: cards,
    });
  }

  if (!sworn) {
    return (
      <section className="second-hour plate-screen" data-testid="old-work-oath">
        <p className="plate-kicker">The sealed century</p>
        <h2>Swear an order</h2>
        <p className="lede">
          Four orders, and not one of them is a sorcerer in a different hat. The
          Briar Sidhe is witches, Celtic law, and the sidhe — fairy magic of hedge
          and water. The Mercury Works is an interwar cartel of occult engineers:
          coils, patents, and machines that should not exist yet. The Closed Proof
          is a faculty of alchemists and metaphysical mathematicians. The Birch
          Vigil is Slavic: grizzled shamans, mad monks, and the spirits of birch,
          bathhouse, and stove. Swear one. Your ally jewel still fills the working.
        </p>
        <div className="allegiance-grid">
          {SEALED_CENTURY_ORDERS.map((order) => (
            <button
              key={order}
              type="button"
              className="allegiance-card brass-btn"
              data-testid={`old-swear-${order}`}
              onClick={() => swear(order)}
            >
              <span className="allegiance-order">{order}</span>
              <span className="allegiance-ally">Ally · {SEALED_CENTURY_ALLIES[order]}</span>
              <span className="allegiance-blurb">{SEALED_CENTURY_BLURBS[order]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  if (view === 'shop') {
    return (
      <NightCounter
        counter="sealed"
        profile={profile}
        onUpdate={onUpdate}
        onDeckEditor={() => {
          brassClick();
          onDeckEditor();
        }}
        onBack={() => setView('field')}
      />
    );
  }

  const field = oldDecksForOrder(profile)[0];
  const reward = SHARD_REWARDS.old;

  const rival = SEALED_CENTURY_RIVALS[sworn];
  return (
    <section className="second-hour plate-screen" data-testid="old-work-field">
      <p className="plate-kicker">The sealed century · {sworn}</p>
      <h2>Choose the ground</h2>
      <p className="lede">
        Ally jewel · {SEALED_CENTURY_ALLIES[sworn]}. The rival across the circle is{' '}
        {rival}. The grounds are not the same shape. Some seals sit under your
        door. Some you only reach by crossing. A shot is still a straight line.
      </p>
      <p className="lede" data-testid="old-purse">
        You hold <strong>{profile.alchemicalShards}</strong> shards · a win here pays{' '}
        {reward.win}, a loss {reward.loss}. On the field:{' '}
        <strong data-testid="old-field-working">{field?.name ?? 'your starter working'}</strong>.
      </p>
      {onAiDifficulty && <AiMindPicker value={aiDifficulty} onChange={onAiDifficulty} />}
      <div className="map-grid old-map-grid" data-testid="old-map-grid">
        {grounds.map((m) => (
          <button
            key={m.id}
            type="button"
            className="map-card brass-btn brass-btn-solid"
            data-testid={`old-map-${m.id}`}
            title={m.epithet}
            onClick={() => {
              brassClick();
              onEnter(m.id, sworn, rival);
            }}
          >
            {/* The same painted art card as the main menu's field picker. */}
            <span
              className="map-thumb"
              style={{ backgroundImage: `url(/assets/maps/${m.id}.jpg)` }}
            >
              <MapMini map={m} overlay />
            </span>
            <span className="map-card-name">{m.name}</span>
            <span className="map-card-sub">{m.epithet}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="brass-btn brass-btn-solid"
        data-testid="old-shop"
        onClick={() => {
          brassClick();
          setView('shop');
        }}
      >
        The sealed counter · buy plates
      </button>
      <button
        type="button"
        className="brass-btn brass-btn-solid"
        data-testid="old-edit-working"
        onClick={() => {
          brassClick();
          onDeckEditor();
        }}
      >
        Deck editor
      </button>
      <button
        type="button"
        className="brass-btn brass-btn-ghost"
        onClick={() => onUpdate({ ...profile, oldOrder: null, oldHero: null, oldCards: null })}
      >
        Swear a different order
      </button>
      <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
        Return
      </button>
    </section>
  );
}
