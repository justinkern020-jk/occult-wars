import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UNITS } from '../data/catalog';
import { pickTrainingAction, type AiSnapshot } from '../game/ai';
import { combatantFrom, resolveMelee } from '../game/combat';
import {
  canDeployOn,
  initialControl,
  isEnemyStronghold,
  isPaintable,
  paintTile,
  type ControlGrid,
} from '../game/control';
import { buildShuffledWorking, drawFromDeck } from '../game/deck';
import {
  MAPS,
  mapById,
  tileLabel,
  type Side,
} from '../game/maps';
import {
  DOMINATION_WIN,
  applyBank,
  bankFromHoldings,
  countHoldings,
  sideLabel,
  victoryHeadline,
  victoryReason,
  type VictoryKind,
} from '../game/scoring';
import type { Card } from '../game/types';
import { CardView } from './CardView';
import { HandCard } from './HandCard';
import {
  RulesPrimer,
  hasSeenPrimer,
  markPrimerSeen,
} from './RulesPrimer';
import { UnitCoin, type BoardUnit } from './UnitCoin';

type Pos = { r: number; c: number };

const AZURE_FACTION = 'The Blackout Wardens';
const CRIMSON_FACTION = 'The Drowned Parish';
const PLAYER: Side = 'blue';
const AI_SIDE: Side = 'red';

function uid() {
  return `u_${Math.random().toString(36).slice(2, 9)}`;
}

function neighbors(r: number, c: number): Pos[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => p.r >= 0 && p.r < 5 && p.c >= 0 && p.c < 5);
}

function listUnits(
  board: (BoardUnit | null)[][],
): (BoardUnit & Pos)[] {
  const out: (BoardUnit & Pos)[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const u = board[r][c];
      if (u) out.push({ ...u, r, c });
    }
  return out;
}

function emptyBoard(): (BoardUnit | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(null));
}

type MatchOver = {
  winner: Side;
  kind: VictoryKind;
};

type BattlefieldProps = {
  initialMapId?: string;
  onLeave?: () => void;
};

export function Battlefield({
  initialMapId = 'ashen-cross',
  onLeave,
}: BattlefieldProps = {}) {
  const [mapId, setMapId] = useState(initialMapId);
  useEffect(() => {
    setMapId(initialMapId);
  }, [initialMapId]);
  const gameMap = useMemo(() => mapById(mapId), [mapId]);

  const [showPrimer, setShowPrimer] = useState(() => !hasSeenPrimer());
  const [loyalty, setLoyalty] = useState({ blue: 0, red: 0 });
  const [domination, setDomination] = useState({ blue: 0, red: 0 });
  const [turn, setTurn] = useState(1);
  const [side, setSide] = useState<Side>('blue');
  const [phase, setPhase] = useState<'main' | 'melee' | 'over'>('main');
  const [matchOver, setMatchOver] = useState<MatchOver | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const [deck, setDeck] = useState(() => ({
    blue: buildShuffledWorking(AZURE_FACTION),
    red: buildShuffledWorking(CRIMSON_FACTION),
  }));
  const [hand, setHand] = useState<{ blue: Card[]; red: Card[] }>({
    blue: [],
    red: [],
  });

  const [board, setBoard] = useState<(BoardUnit | null)[][]>(emptyBoard);
  const [control, setControl] = useState<ControlGrid>(() =>
    initialControl(gameMap.tiles),
  );

  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [revealCard, setRevealCard] = useState<Card | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const pushLog = useCallback((msg: string) => {
    setLog((L) => [msg, ...L].slice(0, 10));
  }, []);

  const bankUnits = useCallback(
    (b: (BoardUnit | null)[][]) =>
      listUnits(b).map((u) => ({
        side: u.side,
        keywords: u.keywords,
        r: u.r,
        c: u.c,
      })),
    [],
  );

  const openRiteFor = useCallback(
    (
      nextSide: Side,
      tiles: typeof gameMap.tiles,
      ctrl: ControlGrid,
      b: (BoardUnit | null)[][],
      d: { blue: Card[]; red: Card[] },
      h: { blue: Card[]; red: Card[] },
      turnNum: number,
    ) => {
      // Reset act flags
      const cleared = b.map((row) =>
        row.map((u) => (u ? { ...u, moved: false, attacked: false } : null)),
      );
      setBoard(cleared);

      const drawn = drawFromDeck(d[nextSide], h[nextSide], 1);
      const nextDeck = { ...d, [nextSide]: drawn.deck };
      const nextHand = { ...h, [nextSide]: drawn.hand };
      setDeck(nextDeck);
      setHand(nextHand);
      if (drawn.sealed) {
        pushLog(`${sideLabel(nextSide)}'s hand is sealed.`);
      } else if (drawn.drawn > 0) {
        pushLog(`${sideLabel(nextSide)} draws ${drawn.drawn}.`);
      }

      let gain = bankFromHoldings(
        tiles,
        ctrl,
        nextSide,
        bankUnits(cleared),
      );
      // Second seat crumb: red on global turn 2
      if (nextSide === 'red' && turnNum === 2) gain += 1;
      setLoyalty((L) => ({
        ...L,
        [nextSide]: applyBank(L[nextSide], gain),
      }));
      pushLog(
        nextSide === 'red' && turnNum === 2
          ? `${sideLabel(nextSide)} banks ${gain} (holdings, plus the second seat's crumb).`
          : `${sideLabel(nextSide)} banks ${gain} from the stronghold and held nodes.`,
      );
      pushLog(`${sideLabel(nextSide)} opens the rite.`);
      return { nextDeck, nextHand, cleared };
    },
    [bankUnits, pushLog],
  );

  const bootMatch = useCallback(
    (id: string) => {
      const m = mapById(id);
      const ctrl = initialControl(m.tiles);
      let dBlue = buildShuffledWorking(AZURE_FACTION);
      let dRed = buildShuffledWorking(CRIMSON_FACTION);
      const blueDraw = drawFromDeck(dBlue, [], 5);
      const redDraw = drawFromDeck(dRed, [], 5);
      dBlue = blueDraw.deck;
      dRed = redDraw.deck;
      const h = { blue: blueDraw.hand, red: redDraw.hand };
      const d = { blue: dBlue, red: dRed };
      const b = emptyBoard();

      setControl(ctrl);
      setBoard(b);
      setDeck(d);
      setHand(h);
      setLoyalty({ blue: 0, red: 0 });
      setDomination({ blue: 0, red: 0 });
      setTurn(1);
      setSide('blue');
      setPhase('main');
      setMatchOver(null);
      setSelectedHand(null);
      setSelectedUnit(null);
      setAttacker(null);
      setRevealCard(null);
      setAiBusy(false);
      setLog([
        `The leaden hour opens on ${m.name}. Azure takes the first rite.`,
      ]);

      // Opening bank for Azure (no draw — already drew 5)
      const gain = bankFromHoldings(m.tiles, ctrl, 'blue', []);
      setLoyalty({ blue: applyBank(0, gain), red: 0 });
      setLog((L) => [
        `Azure banks ${gain} from the stronghold and held nodes.`,
        ...L,
      ]);
    },
    [],
  );

  // Boot / remap
  const bootedFor = useRef<string | null>(null);
  useEffect(() => {
    if (bootedFor.current === mapId) return;
    bootedFor.current = mapId;
    bootMatch(mapId);
  }, [mapId, bootMatch]);

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

  const findDeployGates = useCallback(
    (s: Side): Pos[] => {
      const out: Pos[] = [];
      gameMap.tiles.forEach((row, r) =>
        row.forEach((t, c) => {
          if (board[r][c]) return;
          if (canDeployOn(t, control, r, c, s)) out.push({ r, c });
        }),
      );
      return out;
    },
    [gameMap, control, board],
  );

  const deploySpots = useMemo(
    () => findDeployGates(side),
    [findDeployGates, side],
  );

  const finishMatch = useCallback(
    (winner: Side, kind: VictoryKind, msg: string) => {
      setPhase('over');
      setMatchOver({ winner, kind });
      setAttacker(null);
      setSelectedHand(null);
      setSelectedUnit(null);
      setAiBusy(false);
      pushLog(msg);
    },
    [pushLog],
  );

  const deployTo = useCallback(
    (r: number, c: number, handIndex: number, acting: Side) => {
      const card = hand[acting][handIndex];
      if (!card || card.kind !== 'unit' || card.power == null) return false;
      if (board[r][c]) {
        pushLog('That circle is occupied.');
        return false;
      }
      if (!canDeployOn(gameMap.tiles[r][c], control, r, c, acting)) {
        pushLog('Deploy onto your stronghold or a gate you hold.');
        return false;
      }
      if (loyalty[acting] < card.cost) {
        pushLog(`Not enough loyalty (need ${card.cost}).`);
        return false;
      }
      const unit: BoardUnit = {
        uid: uid(),
        cardId: card.id,
        name: card.name,
        side: acting,
        power: card.power,
        maxPower: card.power,
        loyalty: card.cost,
        keywords: card.keywords,
        moved: false,
        attacked: false,
      };
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        next[r][c] = unit;
        return next;
      });
      setLoyalty((L) => ({ ...L, [acting]: L[acting] - card.cost }));
      setHand((H) => ({
        ...H,
        [acting]: H[acting].filter((_, i) => i !== handIndex),
      }));
      setSelectedHand(null);
      pushLog(
        `${sideLabel(acting)} deploys ${card.name} (P${card.power} · L${card.cost}).`,
      );
      return true;
    },
    [hand, board, control, gameMap, loyalty, pushLog],
  );

  const moveUnit = useCallback(
    (uidStr: string, r: number, c: number): 'ok' | 'storm' | 'fail' => {
      const atk = findUnit(uidStr);
      if (!atk) return 'fail';
      if (atk.unit.moved || atk.unit.attacked) {
        pushLog(`${atk.unit.name} has already acted this rite.`);
        return 'fail';
      }
      const tile = gameMap.tiles[r][c];
      if (tile.kind === 'void') return 'fail';
      if (board[r][c]) {
        pushLog('That circle is occupied.');
        return 'fail';
      }
      const adj = neighbors(atk.r, atk.c).some((p) => p.r === r && p.c === c);
      if (!adj) {
        pushLog('Move only to an adjacent circle.');
        return 'fail';
      }

      if (isEnemyStronghold(tile, atk.unit.side)) {
        setBoard((b) => {
          const next = b.map((row) => [...row]);
          next[atk.r][atk.c] = null;
          next[r][c] = { ...atk.unit, moved: true };
          return next;
        });
        setControl((C) => {
          const next = C.map((row) => [...row]);
          next[r][c] = atk.unit.side;
          return next;
        });
        finishMatch(
          atk.unit.side,
          'stronghold',
          `${atk.unit.name} seizes the enemy stronghold. The hour is over.`,
        );
        return 'storm';
      }

      const prevOwner = control[r][c];
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        next[atk.r][atk.c] = null;
        next[r][c] = { ...atk.unit, moved: true };
        return next;
      });
      if (isPaintable(tile)) {
        setControl((C) => paintTile(C, gameMap.tiles, r, c, atk.unit.side));
        if (prevOwner !== atk.unit.side) {
          pushLog(
            `${atk.unit.name} claims the ${tileLabel(tile) || 'circle'}.`,
          );
        } else {
          pushLog(`${atk.unit.name} advances.`);
        }
      } else {
        pushLog(`${atk.unit.name} advances.`);
      }
      setAttacker(null);
      setSelectedUnit(null);
      return 'ok';
    },
    [findUnit, gameMap, board, control, pushLog, finishMatch],
  );

  const strike = useCallback(
    (atkUid: string, defR: number, defC: number): boolean => {
      const atk = findUnit(atkUid);
      const here = board[defR][defC];
      if (!atk || !here) return false;
      if (here.side === atk.unit.side) return false;
      if (atk.unit.moved || atk.unit.attacked) {
        pushLog(`${atk.unit.name} has already acted this rite.`);
        return false;
      }
      const adj = neighbors(atk.r, atk.c).some(
        (p) => p.r === defR && p.c === defC,
      );
      if (!adj) {
        pushLog('Strike only an adjacent foe.');
        return false;
      }
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
            attacked: true,
          };
        if (result.defenderDestroyed) next[defR][defC] = null;
        else
          next[defR][defC] = {
            ...here,
            power: result.defender.power,
          };
        return next;
      });
      result.log.forEach((line) => pushLog(line));
      setAttacker(null);
      setSelectedUnit(null);
      setTimeout(() => {
        setPhase((p) => (p === 'over' ? p : 'main'));
      }, 350);
      return true;
    },
    [findUnit, board, pushLog],
  );

  const endRite = useCallback(() => {
    if (phase === 'over' || matchOver) return;
    const acting = side;
    const holdings = countHoldings(gameMap.tiles, control, acting);
    const scored = domination[acting] + holdings;
    setDomination((D) => ({ ...D, [acting]: scored }));
    pushLog(
      `${sideLabel(acting)} holds ${holdings} circles. Domination ${scored}.`,
    );

    if (scored >= DOMINATION_WIN) {
      finishMatch(
        acting,
        'dominance',
        `${sideLabel(acting)} reaches ${DOMINATION_WIN} domination.`,
      );
      return;
    }

    const next: Side = acting === 'blue' ? 'red' : 'blue';
    const nextTurn = turn + 1;
    setTurn(nextTurn);
    setSide(next);
    setSelectedHand(null);
    setSelectedUnit(null);
    setAttacker(null);
    setPhase('main');

    openRiteFor(
      next,
      gameMap.tiles,
      control,
      board,
      deck,
      hand,
      nextTurn,
    );
  }, [
    phase,
    matchOver,
    side,
    gameMap,
    control,
    domination,
    turn,
    board,
    deck,
    hand,
    pushLog,
    finishMatch,
    openRiteFor,
  ]);

  const resign = useCallback(() => {
    if (phase === 'over' || matchOver) return;
    if (side !== PLAYER) return;
    finishMatch(
      AI_SIDE,
      'yield',
      `${sideLabel(PLAYER)} yields the circle.`,
    );
  }, [phase, matchOver, side, finishMatch]);

  const inputLocked =
    phase === 'over' || !!matchOver || side !== PLAYER || aiBusy;

  function onTileClick(r: number, c: number) {
    if (inputLocked) return;
    const tile = gameMap.tiles[r][c];
    if (tile.kind === 'void') return;

    if (selectedHand != null) {
      deployTo(r, c, selectedHand, PLAYER);
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
        moveUnit(attacker, r, c);
        return;
      }
      if (here.side === atk.unit.side) {
        setAttacker(here.uid);
        setSelectedUnit(here.uid);
        return;
      }
      strike(attacker, r, c);
      return;
    }

    if (here) {
      if (here.side !== PLAYER) {
        pushLog(`Enemy ${here.name} — P${here.power} · L${here.loyalty}.`);
        setSelectedUnit(here.uid);
        const card =
          UNITS.find((u) => u.id === here.cardId) ??
          UNITS.find((u) => u.name === here.name) ??
          null;
        if (card) setRevealCard(card);
        return;
      }
      if (here.moved || here.attacked) {
        pushLog(`${here.name} has already acted this rite.`);
        setSelectedUnit(here.uid);
        return;
      }
      setSelectedUnit(here.uid);
      setAttacker(here.uid);
      pushLog(
        `${here.name} ready. Click adjacent foe to strike, or empty tile to move.`,
      );
    } else {
      setSelectedUnit(null);
    }
  }

  // ——— Training AI (Crimson) ———
  // Schedule on red main-phase snapshots. Do not gate on aiBusy state —
  // toggling it would cancel the timer via effect cleanup.
  useEffect(() => {
    if (phase !== 'main' || matchOver) return;
    if (side !== AI_SIDE) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setAiBusy(true);

      const snap: AiSnapshot = {
        side: AI_SIDE,
        tiles: gameMap.tiles,
        control,
        board: board.map((row, r) =>
          row.map((u, c) =>
            u
              ? {
                  uid: u.uid,
                  side: u.side,
                  power: u.power,
                  keywords: u.keywords,
                  moved: !!u.moved,
                  attacked: !!u.attacked,
                  r,
                  c,
                }
              : null,
          ),
        ),
        hand: hand.red,
        loyalty: loyalty.red,
      };
      const action = pickTrainingAction(snap);

      if (action.type === 'deploy') {
        const ok = deployTo(action.r, action.c, action.index, AI_SIDE);
        setAiBusy(false);
        if (!ok) endRite();
        return;
      }
      if (action.type === 'move') {
        const result = moveUnit(action.uid, action.r, action.c);
        setAiBusy(false);
        if (result === 'fail') endRite();
        return;
      }
      if (action.type === 'attack') {
        const target = findUnit(action.targetUid);
        const ok = target ? strike(action.uid, target.r, target.c) : false;
        setAiBusy(false);
        if (!ok) endRite();
        return;
      }
      setAiBusy(false);
      endRite();
    }, 480);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Re-run after each AI mutation (board/hand/loyalty/control) or side change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, phase, matchOver, board, hand.red, loyalty.red, control]);

  const legalDeploy = useMemo(() => {
    if (selectedHand == null || inputLocked) return new Set<string>();
    return new Set(deploySpots.map((p) => `${p.r},${p.c}`));
  }, [selectedHand, deploySpots, inputLocked]);

  const playerWon = matchOver?.winner === PLAYER;

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
        <div className="bf-scores" aria-label="Score rail">
          <dl className="score-chip is-ally">
            <dt>Azure</dt>
            <dd>
              {loyalty.blue}
              <span>loyalty</span>
              <em>
                {domination.blue}
                <span className="score-cap"> / {DOMINATION_WIN}</span>
              </em>
              <span>dom</span>
            </dd>
          </dl>
          <div className="bf-turn">
            <span className="bf-turn-label">Rite</span>
            <strong>{turn}</strong>
            <span className={`bf-side is-${side}`}>
              {sideLabel(side)}
              {side === AI_SIDE ? ' · AI' : ''}
            </span>
            <span className="bf-phase">
              {phase === 'melee'
                ? 'Melee'
                : phase === 'over'
                  ? 'Closed'
                  : 'Main'}
            </span>
          </div>
          <dl className="score-chip is-enemy">
            <dt>Crimson</dt>
            <dd>
              {loyalty.red}
              <span>loyalty</span>
              <em>
                {domination.red}
                <span className="score-cap"> / {DOMINATION_WIN}</span>
              </em>
              <span>dom</span>
            </dd>
          </dl>
        </div>
        <div className="bf-tools">
          {onLeave && (
            <button
              type="button"
              className="brass-btn brass-btn-ghost"
              onClick={onLeave}
            >
              Atelier
            </button>
          )}
          <label className="bf-map-pick">
            <span>Map</span>
            <select
              value={mapId}
              onChange={(e) => {
                bootedFor.current = null;
                setMapId(e.target.value);
              }}
            >
              {MAPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="brass-btn"
            disabled={inputLocked}
            onClick={endRite}
          >
            End rite
          </button>
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            disabled={phase === 'over' || side !== PLAYER}
            onClick={resign}
            title="Yield the circle"
          >
            Yield
          </button>
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            onClick={() => {
              bootedFor.current = null;
              bootMatch(mapId);
            }}
          >
            New sitting
          </button>
        </div>
      </header>

      <div className="hand-rail is-foe">
        <p className="hand-kicker">Crimson hand</p>
        <div className="hand-row hand-row-backs">
          {Array.from({ length: hand.red.length }).map((_, i) => (
            <span key={i} className="hand-back" aria-hidden />
          ))}
        </div>
      </div>

      <div
        className="board-frame"
        style={{
          ['--map-url' as string]: `url(/assets/maps/${gameMap.id}.jpg)`,
        }}
      >
        <div className="board-stage">
          <div
            className="board-grid"
            role="grid"
            aria-label={`${gameMap.name} battlefield`}
          >
            {gameMap.tiles.map((row, r) =>
              row.map((tile, c) => {
                if (tile.kind === 'void') {
                  return <div key={`${r}-${c}`} className="stone-gap" />;
                }
                const unit = board[r][c];
                const held =
                  tile.kind === 'stronghold'
                    ? tile.home
                    : control[r][c] ?? undefined;
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
                    disabled={inputLocked && !unit}
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
                    {tile.kind === 'resource' && (
                      <span
                        className={`tile-mark resource-mark resource-${tile.symbols === 2 ? 'double' : 'single'}${unit ? ' mark-under' : ''}`}
                        aria-hidden
                      />
                    )}
                    {unit ? (
                      <UnitCoin
                        unit={unit}
                        selected={!!selected}
                        foe={unit.side !== PLAYER}
                        onClick={() => onTileClick(r, c)}
                      />
                    ) : (
                      <span className="stone-empty">
                        {tile.kind === 'resource' && (
                          <span className="stone-tag resource-tag">
                            {tileLabel(tile)}
                          </span>
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
          · banks 2 · always deploys
        </li>
        <li>
          <i className="legend-mark legend-gate" aria-hidden /> Gate you hold
        </li>
        <li>
          <i className="legend-mark legend-resource" aria-hidden /> Resource
        </li>
        <li>
          <i className="legend-jewels" aria-hidden /> Resource +2
        </li>
        <li>
          <span className="key-coin key-loyalty">L</span> Loyalty (cost)
        </li>
        <li>
          <span className="key-coin key-power">P</span> Power (combat)
        </li>
      </ul>

      <div className="hand-rail">
        <p className="hand-kicker">
          Azure hand · select a unit, then a highlighted Gate or Stronghold
          {side === AI_SIDE ? ' · Crimson is working…' : ''}
        </p>
        <div className="hand-row">
          {hand.blue.map((card, i) => (
            <HandCard
              key={`${card.id}-${i}`}
              card={card}
              selected={selectedHand === i}
              disabled={
                inputLocked ||
                card.kind !== 'unit' ||
                card.power == null ||
                card.cost > loyalty.blue
              }
              onClick={() => {
                if (inputLocked) return;
                if (card.kind !== 'unit') {
                  pushLog('Rites and devices wait for a later sitting.');
                  return;
                }
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

      {matchOver && (
        <div
          className={`match-veil ${playerWon ? 'is-victory' : 'is-defeat'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-over-title"
          data-testid="match-over"
        >
          <div className="match-plate">
            <p className="match-kicker">
              {matchOver.kind === 'dominance'
                ? 'Dominance'
                : matchOver.kind === 'stronghold'
                  ? 'Stronghold'
                  : 'Yield'}
            </p>
            <h2 id="match-over-title">
              {victoryHeadline(matchOver.kind, playerWon)}
            </h2>
            <p className="match-reason">
              {victoryReason(matchOver.kind, playerWon)}
            </p>
            <p className="match-score">
              Azure {domination.blue} / {DOMINATION_WIN} · Crimson{' '}
              {domination.red} / {DOMINATION_WIN}
            </p>
            <div className="match-actions">
              <button
                type="button"
                className="brass-btn brass-btn-solid"
                onClick={() => {
                  bootedFor.current = null;
                  bootMatch(mapId);
                }}
              >
                New sitting
              </button>
              {onLeave && (
                <button
                  type="button"
                  className="brass-btn brass-btn-ghost"
                  onClick={onLeave}
                >
                  Return to the atelier
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPrimer && (
        <RulesPrimer
          onDismiss={() => {
            markPrimerSeen();
            setShowPrimer(false);
          }}
        />
      )}
    </section>
  );
}
