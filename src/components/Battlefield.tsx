import { useCallback, useMemo, useState } from 'react';
import { UNITS } from '../data/catalog';
import { combatantFrom, resolveMelee } from '../game/combat';
import {
  MAPS,
  mapById,
  tileLabel,
  type Side,
  type Tile,
} from '../game/maps';
import type { Card } from '../game/types';
import { CardView } from './CardView';
import { HandCard } from './HandCard';
import { UnitCoin, type BoardUnit } from './UnitCoin';

type Pos = { r: number; c: number };

function uid() {
  return `u_${Math.random().toString(36).slice(2, 9)}`;
}

function pickHand(faction: string, n: number): Card[] {
  const pool = UNITS.filter((u) => u.faction === faction && u.power != null);
  const src = pool.length >= n ? pool : UNITS.filter((u) => u.power != null);
  const copy = [...src];
  const out: Card[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const j = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(j, 1)[0]);
  }
  return out;
}

function findDeployGates(tiles: Tile[][], side: Side): Pos[] {
  const out: Pos[] = [];
  tiles.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t.kind === 'gate' && (t.home === side || t.home == null)) {
        out.push({ r, c });
      }
      if (t.kind === 'stronghold' && t.home === side) out.push({ r, c });
    }),
  );
  return out;
}

function neighbors(r: number, c: number): Pos[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < 5 && p.c >= 0 && p.c < 5);
}

export function Battlefield() {
  const [mapId, setMapId] = useState('ashen-cross');
  const gameMap = useMemo(() => mapById(mapId), [mapId]);

  const azureFaction = 'The Blackout Wardens';
  const crimsonFaction = 'The Drowned Parish';

  const [loyalty, setLoyalty] = useState({ blue: 6, red: 6 });
  const [domination, setDomination] = useState({ blue: 0, red: 0 });
  const [turn, setTurn] = useState(1);
  const [side, setSide] = useState<Side>('blue');
  const [phase, setPhase] = useState<'main' | 'melee'>('main');
  const [log, setLog] = useState<string[]>([
    'The circle opens. Deploy from your gate. Power is vitality and damage — one number.',
  ]);

  const [hand, setHand] = useState(() => ({
    blue: pickHand(azureFaction, 5),
    red: pickHand(crimsonFaction, 5),
  }));
  const [enemyHidden] = useState(5);

  const [board, setBoard] = useState<(BoardUnit | null)[][]>(() =>
    Array.from({ length: 5 }, () => Array(5).fill(null)),
  );

  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [revealCard, setRevealCard] = useState<Card | null>(null);

  const deploySpots = useMemo(
    () => findDeployGates(gameMap.tiles, side),
    [gameMap, side],
  );

  const pushLog = useCallback((msg: string) => {
    setLog((L) => [msg, ...L].slice(0, 8));
  }, []);

  const unitAt = useCallback(
    (r: number, c: number) => board[r][c],
    [board],
  );

  const findUnit = useCallback(
    (id: string): { unit: BoardUnit; r: number; c: number } | null => {
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++) {
          const u = board[r][c];
          if (u?.uid === id) return { unit: u, r, c };
        }
      return null;
    },
    [board],
  );

  function deployTo(r: number, c: number) {
    if (selectedHand == null) return;
    const card = hand[side][selectedHand];
    if (!card || card.power == null) return;
    if (board[r][c]) {
      pushLog('That circle is occupied.');
      return;
    }
    const legal = deploySpots.some((p) => p.r === r && p.c === c);
    if (!legal) {
      pushLog('Deploy onto a Gate (or your stronghold).');
      return;
    }
    if (loyalty[side] < card.cost) {
      pushLog(`Not enough loyalty (need ${card.cost}).`);
      return;
    }
    const unit: BoardUnit = {
      uid: uid(),
      cardId: card.id,
      name: card.name,
      side,
      power: card.power,
      maxPower: card.power,
      loyalty: card.cost,
      keywords: card.keywords,
    };
    setBoard((b) => {
      const next = b.map((row) => [...row]);
      next[r][c] = unit;
      return next;
    });
    setLoyalty((L) => ({ ...L, [side]: L[side] - card.cost }));
    setHand((H) => ({
      ...H,
      [side]: H[side].filter((_, i) => i !== selectedHand),
    }));
    setSelectedHand(null);
    pushLog(
      `${side === 'blue' ? 'Azure' : 'Crimson'} deploys ${card.name} (P${card.power} · L${card.cost}).`,
    );
  }

  function onTileClick(r: number, c: number) {
    const tile = gameMap.tiles[r][c];
    if (tile.kind === 'void') return;

    if (selectedHand != null) {
      deployTo(r, c);
      return;
    }

    const here = unitAt(r, c);
    if (attacker) {
      const atk = findUnit(attacker);
      if (!atk) {
        setAttacker(null);
        return;
      }
      if (!here) {
        // move one step
        const adj = neighbors(atk.r, atk.c).some((p) => p.r === r && p.c === c);
        if (!adj) {
          pushLog('Move only to an adjacent circle.');
          return;
        }
        if (tile.kind === 'stronghold' && tile.home && tile.home !== atk.unit.side) {
          pushLog(`${atk.unit.name} storms the enemy stronghold!`);
          setDomination((D) => ({
            ...D,
            [atk.unit.side]: D[atk.unit.side] + 2,
          }));
        }
        setBoard((b) => {
          const next = b.map((row) => [...row]);
          next[atk.r][atk.c] = null;
          next[r][c] = atk.unit;
          return next;
        });
        setAttacker(null);
        setSelectedUnit(null);
        pushLog(`${atk.unit.name} advances.`);
        return;
      }
      if (here.side === atk.unit.side) {
        setAttacker(here.uid);
        setSelectedUnit(here.uid);
        return;
      }
      // melee
      const result = resolveMelee(
        combatantFrom({
          id: atk.unit.uid,
          name: atk.unit.name,
          power: atk.unit.power,
          keywords: atk.unit.keywords,
        }),
        combatantFrom({
          id: here.uid,
          name: here.name,
          power: here.power,
          keywords: here.keywords,
        }),
      );
      setPhase('melee');
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        if (result.attackerDestroyed) next[atk.r][atk.c] = null;
        else
          next[atk.r][atk.c] = {
            ...atk.unit,
            power: result.attacker.power,
          };
        if (result.defenderDestroyed) next[r][c] = null;
        else
          next[r][c] = {
            ...here,
            power: result.defender.power,
          };
        return next;
      });
      result.log.forEach((line) => pushLog(line));
      setAttacker(null);
      setSelectedUnit(null);
      setTimeout(() => setPhase('main'), 400);
      return;
    }

    if (here) {
      if (here.side !== side) {
        pushLog(`Enemy ${here.name} — P${here.power} · L${here.loyalty}.`);
        setSelectedUnit(here.uid);
        const card =
          UNITS.find((u) => u.id === here.cardId) ??
          UNITS.find((u) => u.name === here.name) ??
          null;
        if (card) setRevealCard(card);
        return;
      }
      setSelectedUnit(here.uid);
      setAttacker(here.uid);
      pushLog(`${here.name} ready. Click adjacent foe to strike, or empty tile to move.`);
    } else {
      setSelectedUnit(null);
    }
  }

  function endRite() {
    const next: Side = side === 'blue' ? 'red' : 'blue';
    // bank +1 loyalty at rite start (simplified)
    setLoyalty((L) => ({
      ...L,
      [next]: Math.min(14, L[next] + 1),
    }));
    if (next === 'blue') setTurn((t) => t + 1);
    setSide(next);
    setSelectedHand(null);
    setSelectedUnit(null);
    setAttacker(null);
    // AI crumb: if red and empty board near gate, auto-hint
    pushLog(
      `${next === 'blue' ? 'Azure' : 'Crimson'} opens the rite. Loyalty banks +1.`,
    );
  }

  function resetMatch() {
    setBoard(Array.from({ length: 5 }, () => Array(5).fill(null)));
    setLoyalty({ blue: 6, red: 6 });
    setDomination({ blue: 0, red: 0 });
    setTurn(1);
    setSide('blue');
    setHand({
      blue: pickHand(azureFaction, 5),
      red: pickHand(crimsonFaction, 5),
    });
    setSelectedHand(null);
    setSelectedUnit(null);
    setAttacker(null);
    setRevealCard(null);
    setLog(['New sitting. The seals are cold.']);
  }

  const legalDeploy = useMemo(() => {
    if (selectedHand == null) return new Set<string>();
    return new Set(deploySpots.map((p) => `${p.r},${p.c}`));
  }, [selectedHand, deploySpots]);

  return (
    <section className="bf">
      <header className="bf-top">
        <div className="bf-brand">
          <p className="eyebrow">Cabals · dual-Power</p>
          <h2>The Field</h2>
          <p className="bf-sub">
            {gameMap.name} — {gameMap.epithet}
          </p>
        </div>
        <div className="bf-scores">
          <dl className="score-chip is-ally">
            <dt>Azure</dt>
            <dd>
              {loyalty.blue}
              <span>loyalty</span>
              <em>{domination.blue}</em>
              <span>dom</span>
            </dd>
          </dl>
          <div className="bf-turn">
            <span className="bf-turn-label">Rite</span>
            <strong>{turn}</strong>
            <span className={`bf-side is-${side}`}>
              {side === 'blue' ? 'Azure' : 'Crimson'}
            </span>
            <span className="bf-phase">{phase === 'melee' ? 'Melee' : 'Main'}</span>
          </div>
          <dl className="score-chip is-enemy">
            <dt>Crimson</dt>
            <dd>
              {loyalty.red}
              <span>loyalty</span>
              <em>{domination.red}</em>
              <span>dom</span>
            </dd>
          </dl>
        </div>
        <div className="bf-tools">
          <label className="bf-map-pick">
            <span>Map</span>
            <select value={mapId} onChange={(e) => { setMapId(e.target.value); resetMatch(); }}>
              {MAPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="brass-btn" onClick={endRite}>
            End rite
          </button>
          <button type="button" className="brass-btn brass-btn-ghost" onClick={resetMatch}>
            New sitting
          </button>
        </div>
      </header>

      {/* Enemy hand (hidden) */}
      <div className="hand-rail is-foe">
        <p className="hand-kicker">Crimson hand</p>
        <div className="hand-row hand-row-backs">
          {Array.from({ length: side === 'red' ? hand.red.length : enemyHidden }).map(
            (_, i) => (
              <span key={i} className="hand-back" aria-hidden />
            ),
          )}
        </div>
      </div>

      <div
        className="board-frame"
        style={{
          ['--map-url' as string]: `url(/assets/maps/${gameMap.id}.jpg)`,
        }}
      >
        <div className="board-stage">
          <div className="board-grid" role="grid" aria-label={`${gameMap.name} battlefield`}>
            {gameMap.tiles.map((row, r) =>
              row.map((tile, c) => {
                if (tile.kind === 'void') {
                  return <div key={`${r}-${c}`} className="stone-gap" />;
                }
                const unit = board[r][c];
                const held = tile.kind === 'stronghold' ? tile.home : undefined;
                const deployOk = legalDeploy.has(`${r},${c}`);
                const selected = unit && unit.uid === selectedUnit;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    role="gridcell"
                    className={`stone tile-${tile.kind} ${
                      tile.kind === 'resource' && tile.symbols === 2
                        ? 'tile-resource-2'
                        : ''
                    } ${held === 'blue' ? 'held-blue' : held === 'red' ? 'held-red' : ''} ${
                      deployOk ? 'legal-tile' : ''
                    } ${selected ? 'tile-selected' : ''}`}
                    onClick={() => onTileClick(r, c)}
                    title={tileLabel(tile)}
                  >
                    {tile.kind === 'gate' && (
                      <span
                        className={`tile-mark gate-mark gate-${tile.home ?? 'neutral'}${unit ? ' mark-under' : ''}`}
                        aria-hidden
                      />
                    )}
                    {tile.kind === 'stronghold' && (
                      <span
                        className={`tile-mark stronghold-mark stronghold-${tile.home ?? 'neutral'}${unit ? ' mark-under' : ''}`}
                        aria-hidden
                      />
                    )}
                    {unit ? (
                      <UnitCoin
                        unit={unit}
                        selected={!!selected}
                        foe={unit.side !== side}
                        onClick={() => onTileClick(r, c)}
                      />
                    ) : (
                      <span className="stone-empty">
                        {tile.kind === 'resource' && (
                          <>
                            <span className="stone-tag">{tileLabel(tile)}</span>
                            <span className="pip-row">
                              <i className="pip" />
                              {tile.symbols === 2 && <i className="pip" />}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <ul className="board-key">
        <li>
          <i className="legend-mark legend-stronghold" aria-hidden /> Stronghold
        </li>
        <li>
          <i className="legend-mark legend-gate" aria-hidden /> Gate
        </li>
        <li>
          <i className="swatch tile-resource" /> Resource
        </li>
        <li>
          <span className="key-coin key-loyalty">L</span> Loyalty (cost)
        </li>
        <li>
          <span className="key-coin key-power">P</span> Power (combat)
        </li>
      </ul>

      {/* Player hand */}
      <div className="hand-rail">
        <p className="hand-kicker">
          {side === 'blue' ? 'Azure' : 'Crimson'} hand · select a unit, then a
          highlighted Gate
        </p>
        <div className="hand-row">
          {hand[side].map((card, i) => (
            <HandCard
              key={`${card.id}-${i}`}
              card={card}
              selected={selectedHand === i}
              disabled={card.cost > loyalty[side]}
              onClick={() => {
                setSelectedHand(selectedHand === i ? null : i);
                setAttacker(null);
                setSelectedUnit(null);
              }}
            />
          ))}
        </div>
      </div>

      <aside className="bf-log" aria-live="polite">
        <h3>Chronicle</h3>
        <ol>
          {log.map((line, i) => (
            <li key={`${i}-${line.slice(0, 12)}`}>{line}</li>
          ))}
        </ol>
      </aside>

      {revealCard && (
        <div
          className="enemy-play"
          role="dialog"
          aria-modal="true"
          aria-label={`${revealCard.name} revealed. Tap to dismiss.`}
          onClick={() => setRevealCard(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setRevealCard(null);
            }
          }}
          tabIndex={0}
        >
          <div
            className="enemy-play-card"
            onClick={(e) => {
              e.stopPropagation();
              setRevealCard(null);
            }}
          >
            <CardView card={revealCard} />
            <p className="enemy-play-hint">Tap card or backdrop to dismiss</p>
          </div>
        </div>
      )}

    </section>
  );
}
