type Props = {
  onDismiss: () => void;
};

const POINTS = [
  'Each side owns one stronghold. It banks 2 resources every rite and is always a deployment square. It also counts as a circle.',
  'Deployment gates you hold, and your stronghold, are the only muster squares. A conquered node stays painted in your color and banks its seals, but you do not deploy on it.',
  'At the end of your rite, score 1 domination for every circle you hold. First to 60 wins.',
  'A card costs the one number printed on it. If the bank can pay that number, you may play it.',
  'One step a rite. Stepping into an enemy is the blow. Fast Attack lands first — a killing stroke is not answered. Power is vitality and damage as one number.',
  'Storm the enemy stronghold to end the sitting at once. You may yield the circle if the hour turns against you.',
];

export function RulesPrimer({ onDismiss }: Props) {
  return (
    <div
      className="primer-veil"
      role="dialog"
      aria-modal="true"
      aria-labelledby="primer-title"
      data-testid="rules-primer"
    >
      <div className="primer-plate">
        <h2 id="primer-title">How a rite is fought</h2>
        <ul>
          {POINTS.map((p) => (
            <li key={p.slice(0, 24)}>{p}</li>
          ))}
        </ul>
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="primer-dismiss"
          onClick={onDismiss}
        >
          I understand the circle
        </button>
      </div>
    </div>
  );
}

export const PRIMER_STORAGE_KEY = 'seenPrimer';

export function hasSeenPrimer(): boolean {
  try {
    return localStorage.getItem(PRIMER_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPrimerSeen(): void {
  try {
    localStorage.setItem(PRIMER_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}
