import { useMemo, useState } from 'react';
import { UNITS } from '../data/catalog';
import { combatantFrom, resolveMelee } from '../game/combat';
import type { CombatResult } from '../game/types';

function pickDefault(kw?: string) {
  if (kw === 'fast') {
    return UNITS.find((u) => u.keywords.includes('fast')) ?? UNITS[0];
  }
  if (kw === 'slow') {
    // Prefer a unit tagged slow; else demo with synthetic slow
    return (
      UNITS.find((u) => u.keywords.includes('slow')) ??
      UNITS.find((u) => (u.power ?? 0) >= 4) ??
      UNITS[0]
    );
  }
  return UNITS.find((u) => !u.keywords.includes('fast')) ?? UNITS[0];
}

export function CombatDemo() {
  const [atkId, setAtkId] = useState(pickDefault('fast')!.id);
  const [defId, setDefId] = useState(pickDefault()!.id);
  const [forceSlow, setForceSlow] = useState(false);
  const [result, setResult] = useState<CombatResult | null>(null);

  const atkCard = useMemo(() => UNITS.find((u) => u.id === atkId), [atkId]);
  const defCard = useMemo(() => UNITS.find((u) => u.id === defId), [defId]);

  function run() {
    if (!atkCard || !defCard || atkCard.power == null || defCard.power == null)
      return;
    const keywords = [...atkCard.keywords];
    if (forceSlow && !keywords.includes('slow')) {
      keywords.push('slow');
      // Slow overrides: remove fast for demo clarity
      const i = keywords.indexOf('fast');
      if (i >= 0) keywords.splice(i, 1);
    }
    const r = resolveMelee(
      combatantFrom({
        id: atkCard.id,
        name: atkCard.name,
        power: atkCard.power,
        keywords,
      }),
      combatantFrom({
        id: defCard.id,
        name: defCard.name,
        power: defCard.power,
        keywords: defCard.keywords,
      }),
    );
    setResult(r);
  }

  return (
    <section className="combat-demo">
      <h2>Combat sandbox</h2>
      <p className="lede">
        Cabals dual-Power: one number is vitality and damage. Fast strikes first;
        Slow strikes last; otherwise simultaneous.
      </p>
      <div className="combat-pickers">
        <label>
          Attacker
          <select value={atkId} onChange={(e) => setAtkId(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · P{u.power}
                {u.keywords.includes('fast') ? ' · Fast' : ''}
                {u.keywords.includes('slow') ? ' · Slow' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Defender
          <select value={defId} onChange={(e) => setDefId(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · P{u.power}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={forceSlow}
            onChange={(e) => setForceSlow(e.target.checked)}
          />
          Force Slow Attack on attacker
        </label>
        <button type="button" onClick={run}>
          Resolve melee
        </button>
      </div>
      {result && (
        <div className="combat-result">
          <p className="mode">
            Mode: <strong>{result.mode}</strong>
          </p>
          <div className="combat-scores">
            <div>
              {result.attacker.name}:{' '}
              <strong>P{result.attacker.power}</strong>
              {result.attackerDestroyed ? ' — destroyed' : ''}
            </div>
            <div>
              {result.defender.name}:{' '}
              <strong>P{result.defender.power}</strong>
              {result.defenderDestroyed ? ' — destroyed' : ''}
            </div>
          </div>
          <ol className="combat-log">
            {result.log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
