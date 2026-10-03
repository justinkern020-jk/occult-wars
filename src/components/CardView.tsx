import type { Card, Rarity } from '../game/types';
import { KEYWORDS, keywordLabel } from '../game/keywords';
import { cardGeneratesResources } from '../data/catalog';
import { CardArt } from './CardArt';
import { ArtMotion, FoilSheen, useFoilPointer } from './CardFx';

const KIND_LABEL: Record<string, string> = {
  unit: 'Unit',
  rite: 'Rite',
  device: 'Device',
  hero: 'Leader',
};

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  patron: 'Patron',
};

export type CardViewProps = {
  card: Card;
  /** Smaller face for collection / deck grids. */
  compact?: boolean;
  /** Live Power override (board inspect). */
  power?: number;
  className?: string;
  onClick?: () => void;
  /** A foil copy: pointer-follow sheen and tilt. */
  foil?: boolean;
};

/**
 * Rare trading-card / tarot face.
 * Left pip = Resources (muster). Right pip = Cabals Power for units.
 * Never show legacy ATK/HP on the pretty face.
 */
export function CardView({
  card,
  compact = false,
  power,
  className = '',
  onClick,
  foil = false,
}: CardViewProps) {
  const foilHandlers = useFoilPointer(foil);
  const shownPower = power ?? card.power;
  const combatKw = card.keywords.filter((k) => KEYWORDS[k]?.combat);
  const cls =
    `tarot rarity-${card.rarity}${compact ? ' tarot-compact' : ''}${foil ? ' is-foil' : ''} ${className}`.trim();

  const body = (
    <>
      <header className="tarot-banner">
        <span className="tarot-pip tarot-pip-l" title="Resources · muster cost">
          <abbr>L</abbr>
          {card.cost}
        </span>
        <h3 className="tarot-name">{card.name}</h3>
        <span
          className="tarot-pip tarot-pip-p"
          title={card.kind === 'unit' ? 'Power · vitality and damage' : 'Spoken'}
        >
          {card.kind === 'unit' && shownPower != null ? (
            <>
              <abbr>P</abbr>
              {shownPower}
            </>
          ) : (
            '·'
          )}
        </span>
      </header>

      <div className="tarot-window">
        <CardArt name={card.name} className="tarot-art" alt="" />
        <ArtMotion card={card} />
        <span className="tarot-foil" aria-hidden />
        {foil && <FoilSheen />}
        {cardGeneratesResources(card) && (
          <span
            className="tarot-resource-jewel"
            role="img"
            aria-label="Generates Resources"
            title="Generates Resources"
          />
        )}
      </div>

      <footer className="tarot-foot">
        <p className="tarot-faction">{card.faction}</p>
        <p className="tarot-life">
          {card.kind === 'unit'
            ? `Power ${shownPower ?? '—'}`
            : KIND_LABEL[card.kind] ?? card.kind}
        </p>
      </footer>

      {!compact && (
        <div className="tarot-lore">
          <p className="tarot-rarity-line">
            {KIND_LABEL[card.kind] ?? card.kind}
            {' · '}
            {RARITY_LABEL[card.rarity] ?? card.rarity}
            {card.cost > 0 ? ` · Resources ${card.cost}` : ''}
          </p>

          {card.keywords.length > 0 && (
            <ul className="tarot-keywords">
              {card.keywords.map((k) => (
                <li key={k} title={KEYWORDS[k]?.title ?? keywordLabel(k)}>
                  {KEYWORDS[k]?.glyph ? (
                    <abbr>{KEYWORDS[k].glyph}</abbr>
                  ) : null}{' '}
                  {keywordLabel(k)}
                  {combatKw.includes(k) ? ' ✦' : ''}
                </li>
              ))}
            </ul>
          )}

          <p className="tarot-text">{card.text}</p>

          {card.quote && (
            <blockquote className="tarot-quote">
              <p>“{card.quote}”</p>
              {card.quoted && <footer>— {card.quoted}</footer>}
            </blockquote>
          )}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        data-kind={card.kind}
        data-faction={card.faction}
        data-rarity={card.rarity}
        data-testid={compact ? 'tarot-compact' : 'tarot-card'}
        data-foil={foil || undefined}
        onClick={onClick}
        {...foilHandlers}
      >
        {body}
      </button>
    );
  }

  return (
    <article
      className={cls}
      data-kind={card.kind}
      data-faction={card.faction}
      data-rarity={card.rarity}
      data-testid={compact ? 'tarot-compact' : 'tarot-card'}
      data-foil={foil || undefined}
      {...foilHandlers}
    >
      {body}
    </article>
  );
}
