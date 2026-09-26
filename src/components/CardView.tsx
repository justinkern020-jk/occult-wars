import type { Card } from '../game/types';
import { KEYWORDS } from '../game/keywords';
import { CardArt } from './CardArt';

const KIND_LABEL: Record<string, string> = {
  unit: 'Unit',
  rite: 'Rite',
  device: 'Device',
  hero: 'Leader',
};

/**
 * Tarot-style card face.
 * Left pip = Loyalty (muster cost from the loyalty bank).
 * Right pip = Cabals Power (vitality + damage) for units.
 * These must NEVER be swapped — board coins use the same layout.
 */
export function CardView({ card }: { card: Card }) {
  const combatKw = card.keywords.filter((k) => KEYWORDS[k]?.combat);
  return (
    <article className="card tarot-card" data-kind={card.kind} data-faction={card.faction}>
      <header className="card-head">
        <span className="card-cost" title="Loyalty · muster cost from the bank">
          <abbr className="stat-abbr">L</abbr>
          {card.cost}
        </span>
        <div className="card-titles">
          <h3 className="card-name">{card.name}</h3>
          <p className="card-meta">
            {KIND_LABEL[card.kind] ?? card.kind} · {card.rarity} · {card.faction}
          </p>
        </div>
        {card.kind === 'unit' && card.power != null ? (
          <div className="card-power" title="Cabals Power: vitality and damage">
            <span className="power-label">P</span>
            <span className="power-value">{card.power}</span>
          </div>
        ) : (
          <div className="card-power card-power-mute" title="Spoken">
            <span className="power-label">·</span>
          </div>
        )}
      </header>
      <div className="card-art">
        <CardArt name={card.name} />
      </div>
      {card.keywords.length > 0 && (
        <ul className="card-keywords">
          {card.keywords.map((k) => (
            <li key={k} title={KEYWORDS[k]?.title ?? k}>
              {KEYWORDS[k]?.glyph ? <abbr>{KEYWORDS[k].glyph}</abbr> : null} {k}
              {combatKw.includes(k) ? ' ✦' : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="card-text">{card.text}</p>
      {card.legacyAttack != null &&
        card.legacyHealth != null &&
        (card.legacyAttack !== card.power || card.legacyHealth !== card.power) && (
          <p className="card-legacy">
            legacy ATK {card.legacyAttack} / HP {card.legacyHealth} → Power {card.power}
          </p>
        )}
    </article>
  );
}
