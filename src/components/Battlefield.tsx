import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { cardById } from '../data/catalog';
import { pickTrainingAction, type AiSnapshot } from '../game/ai';
import { applyDamage, combatantFrom, isDestroyed, resolveMelee } from '../game/combat';
import {
  canDeployOn,
  initialControl,
  isEnemyStronghold,
  isPaintable,
  paintTile,
  type ControlGrid,
} from '../game/control';
import {
  buildShuffledOrderWorking,
  buildShuffledWorking,
  cardsFromIds,
  drawFromDeck,
  shuffleInPlace,
  heroForFaction,
} from '../game/deck';
import {
  effectNeedsAim,
  leaderNeedsAim,
  resolveEffect,
  resolveLeaderPower,
  type EffectCtx,
  type EffectUnit,
} from '../game/effects';
import { canBeStruck, crownBonus, hasKeyword, manhattan } from '../game/keywords';
import { MAPS, mapById, tileLabel, type Side } from '../game/maps';
import {
  DOMINATION_WIN,
  HAND_CAP,
  applyBank,
  bankFromHoldings,
  countHoldings,
  sideLabel,
  victoryHeadline,
  victoryReason,
  type VictoryKind,
} from '../game/scoring';
import { clashSfx, gunshotSfx, defeatStinger, victoryStinger, brassClick, setMusicBed, unlockAudio, sirenSfx } from '../game/sfx';
import {
  recordMatchVisit,
  rollVisitTurn,
  pickCryptid,
  type Era,
} from '../game/visits';
import type { Card } from '../game/types';
import { TarotPop } from './TarotPop';
import { HandCard } from './HandCard';
import {
  RulesPrimer,
  hasSeenPrimer,
  markPrimerSeen,
} from './RulesPrimer';
import { UnitCoin, type BoardUnit } from './UnitCoin';

type Pos = { r: number; c: number };

export type MatchMode =
  | 'training'
  | 'hotseat'
  | 'campaign'
  | 'friend'
  | 'second';

export type BattlefieldProps = {
  initialMapId?: string;
  mode?: MatchMode;
  blueFaction?: string;
  redFaction?: string;
  blueHeroId?: string;
  redHeroId?: string;
  blueDeckIds?: string[];
  redDeckIds?: string[];
  onLeave?: () => void;
  onMatchEnd?: (result: {
    winner: Side;
    kind: VictoryKind;
    playerWon: boolean;
  }) => void;
};

const DEFAULT_BLUE = 'The Vril Syndicate';
const DEFAULT_RED = 'The Hermetic Circle';

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

function listUnits(board: (BoardUnit | null)[][]): (BoardUnit & Pos)[] {
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

function emptyDiscard(): { blue: Card[]; red: Card[] } {
  return { blue: [], red: [] };
}

type MatchOver = { winner: Side; kind: VictoryKind };

type AimMode =
  | null
  | { kind: 'cast'; handIndex: number; card: Card }
  | { kind: 'leader' };

function deckFor(
  faction: string,
  ids?: string[],
): Card[] {
  if (ids && ids.length >= 30) {
    return shuffleInPlace(cardsFromIds(ids));
  }
  try {
    return buildShuffledOrderWorking(faction);
  } catch {
    return buildShuffledWorking(faction);
  }
}

/** Absolute ghost that glides from one circle to the next. */
function CoinSlideLayer({
  slide,
  gridRef,
}: {
  slide: {
    unit: BoardUnit;
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    key: number;
  };
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    tx: number;
    ty: number;
    run: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const from = grid.querySelector(
      `[data-tile-r="${slide.fromR}"][data-tile-c="${slide.fromC}"]`,
    ) as HTMLElement | null;
    const to = grid.querySelector(
      `[data-tile-r="${slide.toR}"][data-tile-c="${slide.toC}"]`,
    ) as HTMLElement | null;
    if (!from || !to) return;
    const g = grid.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    setBox({
      left: a.left - g.left,
      top: a.top - g.top,
      width: a.width,
      height: a.height,
      tx: 0,
      ty: 0,
      run: false,
    });
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBox({
          left: a.left - g.left,
          top: a.top - g.top,
          width: a.width,
          height: a.height,
          tx: b.left - a.left,
          ty: b.top - a.top,
          run: true,
        });
      });
    });
    return () => cancelAnimationFrame(id);
  }, [slide.key, slide.fromR, slide.fromC, slide.toR, slide.toC, gridRef]);

  if (!box) return null;
  return (
    <div
      className="coin-slide-ghost"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        transform: `translate(${box.tx}px, ${box.ty}px)`,
        transition: box.run
          ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'none',
      }}
      aria-hidden
    >
      <UnitCoin unit={slide.unit} />
    </div>
  );
}

export function Battlefield({
  initialMapId = 'ashen-cross',
  mode = 'training',
  blueFaction = DEFAULT_BLUE,
  redFaction = DEFAULT_RED,
  blueHeroId,
  redHeroId,
  blueDeckIds,
  redDeckIds,
  onLeave,
  onMatchEnd,
}: BattlefieldProps = {}) {
  const [mapId, setMapId] = useState(initialMapId);
  useEffect(() => {
    setMapId(initialMapId);
  }, [initialMapId]);
  const gameMap = useMemo(() => mapById(mapId), [mapId]);

  const hotseat = mode === 'hotseat';
  const PLAYER: Side = 'blue';
  const AI_SIDE: Side = 'red';

  const blueHero = useMemo(
    () =>
      (blueHeroId && cardById(blueHeroId)) ||
      heroForFaction(blueFaction) ||
      null,
    [blueHeroId, blueFaction],
  );
  const redHero = useMemo(
    () =>
      (redHeroId && cardById(redHeroId)) ||
      heroForFaction(redFaction) ||
      null,
    [redHeroId, redFaction],
  );

  const [showPrimer, setShowPrimer] = useState(() => !hasSeenPrimer());
  const [loyalty, setLoyalty] = useState({ blue: 0, red: 0 });
  const [domination, setDomination] = useState({ blue: 0, red: 0 });
  const [turn, setTurn] = useState(1);
  const [side, setSide] = useState<Side>('blue');
  const [phase, setPhase] = useState<'main' | 'melee' | 'over'>('main');
  const [matchOver, setMatchOver] = useState<MatchOver | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [deck, setDeck] = useState(() => ({
    blue: deckFor(blueFaction, blueDeckIds),
    red: deckFor(redFaction, redDeckIds),
  }));
  const [hand, setHand] = useState<{ blue: Card[]; red: Card[] }>({
    blue: [],
    red: [],
  });
  const [discard, setDiscard] = useState(emptyDiscard);
  const [board, setBoard] = useState<(BoardUnit | null)[][]>(emptyBoard);
  const [control, setControl] = useState<ControlGrid>(() =>
    initialControl(gameMap.tiles),
  );
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [revealCard, setRevealCard] = useState<Card | null>(null);
  /** Brief glide overlay when a coin steps to an adjacent circle. */
  const [coinSlide, setCoinSlide] = useState<null | {
    unit: BoardUnit;
    fromR: number;
    fromC: number;
    toR: number;
    toC: number;
    key: number;
  }>(null);
  const boardGridRef = useRef<HTMLDivElement | null>(null);
  const slideTimerRef = useRef<number | null>(null);
  const [inspectCard, setInspectCard] = useState<Card | null>(null);
  const [inspectPower, setInspectPower] = useState<number | undefined>(undefined);
  /** Hand index being dragged to muster (units only). */
  const [dragHand, setDragHand] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragHandRef = useRef<number | null>(null);
  const [cryptidSight, setCryptidSight] = useState<string | null>(null);
  const visitTurnRef = useRef<number | null>(null);
  const sightingFiredRef = useRef(false);
  const eraRef = useRef<Era>('first');
  const [aiBusy, setAiBusy] = useState(false);
  /** Live match state for the AI turn loop (avoids stale-closure flash loops). */
  const liveRef = useRef({
    board,
    hand,
    loyalty,
    control,
    gameMap,
  });
  liveRef.current = { board, hand, loyalty, control, gameMap };
  const aiTimersRef = useRef<number[]>([]);
  const revealTimerRef = useRef<number | null>(null);
  const [aim, setAim] = useState<AimMode>(null);
  const [leaderUsed, setLeaderUsed] = useState({ blue: false, red: false });
  const [passPrompt, setPassPrompt] = useState(false);

  const pushLog = useCallback((msg: string) => {
    setLog((L) => [msg, ...L].slice(0, 12));
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
      const cleared = b.map((row) =>
        row.map((u) => {
          if (!u) return null;
          // Clear lock from previous; keep sick only for delay muster this rite
          const next = {
            ...u,
            moved: false,
            attacked: false,
            powder: false,
          };
          if (u.powder) {
            // was locked by foe — stays sick one rite then clears
            next.sick = false;
          }
          return next;
        }),
      );
      setBoard(cleared);

      const drawn = drawFromDeck(d[nextSide], h[nextSide], 1);
      const nextDeck = { ...d, [nextSide]: drawn.deck };
      let nextHand = { ...h, [nextSide]: drawn.hand };
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

      // Cryptid visit: inject into both hands on the scheduled turn.
      if (
        visitTurnRef.current != null &&
        turnNum === visitTurnRef.current &&
        !sightingFiredRef.current
      ) {
        sightingFiredRef.current = true;
        const era = eraRef.current;
        const names: string[] = [];
        let handAfter = { ...nextHand };
        for (const s of ['blue', 'red'] as const) {
          if (handAfter[s].length >= HAND_CAP) continue;
          const faction = s === 'blue' ? blueFaction : redFaction;
          const card = pickCryptid(faction, era);
          if (!card) continue;
          handAfter = {
            ...handAfter,
            [s]: [...handAfter[s], card],
          };
          names.push(card.name);
          pushLog(`Cryptid sighted. ${card.name} joins ${sideLabel(s)}.`);
        }
        if (names.length > 0) {
          setHand(handAfter);
          nextHand = handAfter;
          setCryptidSight(names[0]);
          setTimeout(() => setCryptidSight(null), 2400);
        }
      }

      return { nextDeck, nextHand, cleared };
    },
    [bankUnits, pushLog, blueFaction, redFaction],
  );

  const bootMatch = useCallback(
    (id: string) => {
      const m = mapById(id);
      const ctrl = initialControl(m.tiles);
      let dBlue = deckFor(blueFaction, blueDeckIds);
      let dRed = deckFor(redFaction, redDeckIds);
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
      setDiscard(emptyDiscard());
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
      setAim(null);
      setLeaderUsed({ blue: false, red: false });
      setAiBusy(false);
      setPassPrompt(false);
      setCryptidSight(null);
      const era: Era =
        mode === 'second' || m.era === 'second' ? 'second' : 'first';
      eraRef.current = era;
      sightingFiredRef.current = false;
      if (recordMatchVisit(era)) {
        visitTurnRef.current = rollVisitTurn();
        // sighting fires when that turn opens
      } else {
        visitTurnRef.current = null;
      }
      setLog([
        `The leaden hour opens on ${m.name}. ${sideLabel('blue')} takes the first rite.`,
      ]);

      const gain = bankFromHoldings(m.tiles, ctrl, 'blue', []);
      setLoyalty({ blue: applyBank(0, gain), red: 0 });
      setLog((L) => [
        `Azure banks ${gain} from the stronghold and held nodes.`,
        ...L,
      ]);
    },
    [blueFaction, redFaction, blueDeckIds, redDeckIds, mode],
  );

  const bootedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${mapId}|${blueFaction}|${redFaction}|${mode}`;
    if (bootedFor.current === key) return;
    bootedFor.current = key;
    bootMatch(mapId);
  }, [mapId, blueFaction, redFaction, mode, bootMatch]);

  useEffect(() => {
    unlockAudio();
    setMusicBed('match');
    return () => {
      setMusicBed('none');
    };
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
      setAim(null);
      setAiBusy(false);
      pushLog(msg);
      const playerWon = hotseat ? winner === side : winner === PLAYER;
      if (playerWon) victoryStinger();
      else defeatStinger();
      onMatchEnd?.({ winner, kind, playerWon: winner === PLAYER });
    },
    [pushLog, onMatchEnd, hotseat, side],
  );

  const buildEffectCtx = useCallback(
    (acting: Side): EffectCtx => {
      const units: Record<string, EffectUnit> = {};
      const b: (string | null)[][] = Array.from({ length: 5 }, () =>
        Array(5).fill(null),
      );
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++) {
          const u = board[r][c];
          if (u) {
            b[r][c] = u.uid;
            units[u.uid] = {
              uid: u.uid,
              cardId: u.cardId,
              name: u.name,
              side: u.side,
              power: u.power,
              maxPower: u.maxPower,
              loyalty: u.loyalty,
              keywords: [...u.keywords],
              moved: u.moved,
              attacked: u.attacked,
              sick: u.sick,
              tough: u.tough,
              fast: u.fast,
              shutter: u.shutter,
              silenced: u.silenced,
              powder: u.powder,
            };
          }
        }
      return {
        side: acting,
        loyalty: { ...loyalty },
        hand: {
          blue: [...hand.blue],
          red: [...hand.red],
        },
        deck: {
          blue: [...deck.blue],
          red: [...deck.red],
        },
        discard: {
          blue: [...discard.blue],
          red: [...discard.red],
        },
        units,
        board: b,
        control: control.map((row) => [...row]),
        log: [],
      };
    },
    [board, loyalty, hand, deck, discard, control],
  );

  const applyEffectCtx = useCallback(
    (ctx: EffectCtx) => {
      const nextBoard = emptyBoard();
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++) {
          const id = ctx.board[r][c];
          if (!id) continue;
          const u = ctx.units[id];
          if (!u) continue;
          nextBoard[r][c] = {
            uid: u.uid,
            cardId: u.cardId,
            name: u.name,
            side: u.side,
            power: u.power,
            maxPower: u.maxPower,
            loyalty: u.loyalty,
            keywords: u.keywords,
            moved: u.moved,
            attacked: u.attacked,
            sick: u.sick,
            tough: u.tough,
            fast: u.fast,
            shutter: u.shutter,
            silenced: u.silenced,
            powder: u.powder,
          };
        }
      setBoard(nextBoard);
      setLoyalty(ctx.loyalty);
      setHand(ctx.hand);
      setDeck(ctx.deck);
      setDiscard(ctx.discard);
      setControl(ctx.control);
      ctx.log.forEach((line) => pushLog(line));

      for (const u of Object.values(ctx.units)) {
        if (hasKeyword(u, 'cryptid')) {
          setCryptidSight(u.name);
          setTimeout(() => setCryptidSight(null), 2200);
          break;
        }
      }
    },
    [pushLog],
  );

  const castCard = useCallback(
    (
      acting: Side,
      handIndex: number,
      targetUid?: string,
      aimPos?: Pos,
    ): boolean => {
      const card = hand[acting][handIndex];
      if (!card || (card.kind !== 'rite' && card.kind !== 'device')) return false;
      if (loyalty[acting] < card.cost) {
        pushLog(`Not enough loyalty (need ${card.cost}).`);
        return false;
      }
      if (!card.effect) {
        pushLog(`${card.name} has no working.`);
        return false;
      }
      if (effectNeedsAim(card.effect, card.aim) && !targetUid && !aimPos) {
        setAim({ kind: 'cast', handIndex, card });
        pushLog(`Name a target for ${card.name}.`);
        return false;
      }
      const ctx = buildEffectCtx(acting);
      ctx.loyalty[acting] -= card.cost;
      const err = resolveEffect(
        ctx,
        card.effect,
        {
          name: card.name,
          alsoDraw: card.alsoDraw,
          alsoBank: card.alsoBank,
          alsoHealth: card.alsoHealth,
          alsoTough: card.alsoTough,
          aim: card.aim,
        },
        targetUid,
        aimPos,
      );
      if (err) {
        pushLog(err);
        return false;
      }
      // spend card from hand into discard
      const spent = ctx.hand[acting][handIndex];
      ctx.hand[acting] = ctx.hand[acting].filter((_, i) => i !== handIndex);
      if (spent) ctx.discard[acting].push(spent);
      applyEffectCtx(ctx);
      setSelectedHand(null);
      setAim(null);
      if (hasKeyword(card, 'gas')) sirenSfx();
      else brassClick();
      return true;
    },
    [hand, loyalty, buildEffectCtx, applyEffectCtx, pushLog],
  );

  const useLeader = useCallback(
    (acting: Side, targetUid?: string, aimPos?: Pos): boolean => {
      const hero = acting === 'blue' ? blueHero : redHero;
      if (!hero) {
        pushLog('No leader sworn for this chair.');
        return false;
      }
      if (leaderUsed[acting]) {
        pushLog(`${hero.name} has already spoken this sitting.`);
        return false;
      }
      if (leaderNeedsAim(hero) && !targetUid && !(hero.leaderPower?.op === 'claim' && aimPos)) {
        setAim({ kind: 'leader' });
        pushLog(`Name a target for ${hero.name}.`);
        return false;
      }
      const ctx = buildEffectCtx(acting);
      const err = resolveLeaderPower(ctx, hero, targetUid, aimPos);
      if (err) {
        pushLog(err);
        return false;
      }
      applyEffectCtx(ctx);
      setLeaderUsed((L) => ({ ...L, [acting]: true }));
      setAim(null);
      brassClick();
      return true;
    },
    [
      blueHero,
      redHero,
      leaderUsed,
      buildEffectCtx,
      applyEffectCtx,
      pushLog,
    ],
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
      const delayed = hasKeyword(card, 'delay');
      const unit: BoardUnit = {
        uid: uid(),
        cardId: card.id,
        name: card.name,
        side: acting,
        power: card.power,
        maxPower: card.power,
        loyalty: card.cost,
        keywords: [...card.keywords],
        moved: delayed,
        attacked: delayed,
        sick: delayed,
      };
      // Relay: draw when mustering another unit
      const relays = listUnits(board).filter(
        (u) => u.side === acting && hasKeyword(u, 'relay'),
      );
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
        `${sideLabel(acting)} deploys ${card.name} (P${card.power} · L${card.cost})${
          delayed ? ' · slow muster' : ''
        }.`,
      );
      if (hasKeyword(card, 'cryptid')) {
        setCryptidSight(card.name);
        setTimeout(() => setCryptidSight(null), 2200);
      }
      if (relays.length > 0) {
        setDeck((D) => {
          setHand((H) => {
            const drawn = drawFromDeck(D[acting], H[acting], relays.length);
            if (drawn.drawn > 0) {
              pushLog(`Relay: draw ${drawn.drawn}.`);
            }
            setTimeout(() => {
              setDeck((prev) => ({ ...prev, [acting]: drawn.deck }));
            }, 0);
            return { ...H, [acting]: drawn.hand };
          });
          return D;
        });
      }
      brassClick();
      return true;
    },
    [hand, board, control, gameMap, loyalty, pushLog],
  );

  const strikePower = useCallback(
    (unit: BoardUnit, r: number, c: number) => {
      return unit.power + crownBonus(board, unit.side, r, c);
    },
    [board],
  );

  const canStrikeTarget = useCallback(
    (atk: BoardUnit & Pos, def: BoardUnit & Pos): boolean => {
      if (def.side === atk.side) return false;
      const dist = manhattan(atk.r, atk.c, def.r, def.c);
      return canBeStruck(atk, def, dist);
    },
    [],
  );

  const kickCoinSlide = useCallback(
    (unit: BoardUnit, fromR: number, fromC: number, toR: number, toC: number) => {
      if (slideTimerRef.current != null) {
        window.clearTimeout(slideTimerRef.current);
        slideTimerRef.current = null;
      }
      setCoinSlide({
        unit,
        fromR,
        fromC,
        toR,
        toC,
        key: Date.now(),
      });
      slideTimerRef.current = window.setTimeout(() => {
        slideTimerRef.current = null;
        setCoinSlide(null);
      }, 320);
    },
    [],
  );

  const moveUnit = useCallback(
    (uidStr: string, r: number, c: number): 'ok' | 'storm' | 'fail' => {
      const atk = findUnit(uidStr);
      if (!atk) return 'fail';
      if (atk.unit.sick || atk.unit.moved || atk.unit.attacked) {
        pushLog(`${atk.unit.name} cannot act.`);
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
        kickCoinSlide(atk.unit, atk.r, atk.c, r, c);
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
      const veiled = hasKeyword(atk.unit, 'veiled');
      kickCoinSlide(atk.unit, atk.r, atk.c, r, c);
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        next[atk.r][atk.c] = null;
        next[r][c] = { ...atk.unit, moved: true };
        return next;
      });
      if (veiled) {
        pushLog(`${atk.unit.name} advances without claiming (veiled).`);
      } else if (isPaintable(tile)) {
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
    [findUnit, gameMap, board, control, pushLog, finishMatch, kickCoinSlide],
  );

  const strike = useCallback(
    (atkUid: string, defR: number, defC: number): boolean => {
      const atk = findUnit(atkUid);
      const here = board[defR][defC];
      if (!atk || !here) return false;
      if (atk.unit.sick || atk.unit.moved || atk.unit.attacked) {
        pushLog(`${atk.unit.name} cannot act.`);
        return false;
      }
      if (
        !canStrikeTarget(
          { ...atk.unit, r: atk.r, c: atk.c },
          { ...here, r: defR, c: defC },
        )
      ) {
        pushLog('That foe cannot be struck (out of reach, shuttered, or veiled).');
        return false;
      }
      const atkPow = strikePower(atk.unit, atk.r, atk.c);
      const dist = manhattan(atk.r, atk.c, defR, defC);
      const rangedShot = dist > 1 && hasKeyword(atk.unit, 'ranged');

      if (rangedShot) {
        // Ranged: attacker deals only, no counter
        const resultAtk = combatantFrom({
          id: atk.unit.uid,
          name: atk.unit.name,
          power: atkPow,
          keywords: atk.unit.keywords,
          tough: atk.unit.tough,
        });
        const resultDef = combatantFrom({
          id: here.uid,
          name: here.name,
          power: here.power,
          keywords: here.keywords,
          tough: here.tough,
        });
        const dmg = applyDamage(resultDef, atkPow);
        pushLog(
          `Ranged: ${atk.unit.name} strikes ${here.name} for ${dmg} from ${dist} away.`,
        );
        gunshotSfx();
        setPhase('melee');
        setBoard((b) => {
          const next = b.map((row) => [...row]);
          next[atk.r][atk.c] = { ...atk.unit, attacked: true };
          if (isDestroyed(resultDef)) next[defR][defC] = null;
          else
            next[defR][defC] = {
              ...here,
              power: resultDef.power,
            };
          return next;
        });
        setAttacker(null);
        setSelectedUnit(null);
        setTimeout(() => setPhase((p) => (p === 'over' ? p : 'main')), 350);
        void resultAtk;
        return true;
      }

      const result = resolveMelee(
        combatantFrom({
          id: atk.unit.uid,
          name: atk.unit.name,
          power: atkPow,
          keywords: atk.unit.keywords,
          tough: atk.unit.tough,
        }),
        combatantFrom({
          id: here.uid,
          name: here.name,
          power: here.power,
          keywords: here.keywords,
          tough: here.tough,
        }),
      );
      clashSfx();
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
    [findUnit, board, pushLog, canStrikeTarget, strikePower],
  );

  const endRite = useCallback(() => {
    if (phase === 'over' || matchOver) return;
    brassClick();
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
    setAim(null);
    setPhase('main');

    if (hotseat) {
      setPassPrompt(true);
    }

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
    hotseat,
  ]);

  const resign = useCallback(() => {
    if (phase === 'over' || matchOver) return;
    const loser = hotseat ? side : PLAYER;
    const winner: Side = loser === 'blue' ? 'red' : 'blue';
    finishMatch(winner, 'yield', `${sideLabel(loser)} yields the circle.`);
  }, [phase, matchOver, side, finishMatch, hotseat]);

  const inputSide: Side = hotseat ? side : PLAYER;
  const inputLocked =
    phase === 'over' ||
    !!matchOver ||
    (!hotseat && (side !== PLAYER || aiBusy)) ||
    (hotseat && passPrompt);

  function onTileClick(r: number, c: number) {
    if (inputLocked) return;
    const tile = gameMap.tiles[r][c];
    if (tile.kind === 'void') return;

    if (aim) {
      const here = unitAt(r, c);
      if (aim.kind === 'cast') {
        if (aim.card.effect?.op === 'shove' || aim.card.effect?.op === 'claim') {
          castCard(inputSide, aim.handIndex, here?.uid, { r, c });
        } else if (here) {
          castCard(inputSide, aim.handIndex, here.uid);
        } else {
          pushLog('Name a unit.');
        }
        return;
      }
      if (aim.kind === 'leader') {
        const hero = inputSide === 'blue' ? blueHero : redHero;
        if (hero?.leaderPower?.op === 'claim') {
          useLeader(inputSide, undefined, { r, c });
        } else if (here) {
          useLeader(inputSide, here.uid, { r, c });
        } else {
          pushLog('Name a unit.');
        }
        return;
      }
    }

    const here = unitAt(r, c);

    // Tap own ready coin → select for move/strike (wins over hand deploy).
    if (
      !attacker &&
      here &&
      here.side === inputSide &&
      !here.sick &&
      !here.moved &&
      !here.attacked
    ) {
      setSelectedUnit(here.uid);
      setAttacker(here.uid);
      setSelectedHand(null);
      return;
    }

    if (selectedHand != null) {
      const card = hand[inputSide][selectedHand];
      if (card?.kind === 'unit') {
        deployTo(r, c, selectedHand, inputSide);
      } else if (card && (card.kind === 'rite' || card.kind === 'device')) {
        // keep aim flow elsewhere; bare tap with rite selected does nothing here
      }
      return;
    }

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
      if (here.side !== atk.unit.side) {
        strike(attacker, r, c);
        return;
      }
      // Same-side coin: switch selection (or clear if already acted).
      if (!here.sick && !here.moved && !here.attacked) {
        setSelectedUnit(here.uid);
        setAttacker(here.uid);
      } else {
        setAttacker(null);
        setSelectedUnit(null);
        pushLog(`${here.name} has already acted this rite.`);
      }
      return;
    }

    if (here && here.side === inputSide) {
      if (here.sick || here.moved || here.attacked) {
        pushLog(`${here.name} has already acted this rite.`);
      }
      return;
    }
  }

  // AI loop for training / campaign / second / friend-vs-ai
  useEffect(() => {
    if (hotseat) return;
    if (phase === 'over' || matchOver) return;
    if (side !== AI_SIDE) return;
    if (aiBusy) return;

    let cancelled = false;
    let steps = 0;
    setAiBusy(true);

    const clearAiTimers = () => {
      for (const id of aiTimersRef.current) window.clearTimeout(id);
      aiTimersRef.current = [];
    };

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        aiTimersRef.current = aiTimersRef.current.filter((x) => x !== id);
        if (cancelled) return;
        fn();
      }, ms);
      aiTimersRef.current.push(id);
    };

    const showAiReveal = (card: Card) => {
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      setRevealCard(card);
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        setRevealCard(null);
      }, 1100);
    };

    const run = () => {
      if (cancelled) return;
      steps += 1;
      if (steps > 14) {
        setAiBusy(false);
        setRevealCard(null);
        endRite();
        return;
      }

      const live = liveRef.current;
      const snap: AiSnapshot = {
        side: AI_SIDE,
        tiles: live.gameMap.tiles,
        control: live.control,
        board: live.board.map((row, r) =>
          row.map((u, c) =>
            u
              ? {
                  uid: u.uid,
                  side: u.side,
                  power: u.power,
                  keywords: u.keywords,
                  moved: !!u.moved || !!u.sick,
                  attacked: !!u.attacked || !!u.sick,
                  r,
                  c,
                }
              : null,
          ),
        ),
        hand: live.hand.red,
        loyalty: live.loyalty.red,
      };
      const action = pickTrainingAction(snap);

      const castIdx = live.hand.red.findIndex(
        (c, i) =>
          (c.kind === 'rite' || c.kind === 'device') &&
          c.effect &&
          !effectNeedsAim(c.effect, c.aim) &&
          c.cost <= live.loyalty.red &&
          i === live.hand.red.findIndex((x) => x.id === c.id),
      );
      if (castIdx >= 0 && Math.random() < 0.28) {
        const ok = castCard(AI_SIDE, castIdx);
        later(run, ok ? 420 : 80);
        return;
      }

      if (action.type === 'deploy') {
        const card = live.hand.red[action.index];
        if (card?.kind === 'unit') {
          const ok = deployTo(action.r, action.c, action.index, AI_SIDE);
          if (ok) {
            showAiReveal(card);
            later(run, 520);
            return;
          }
        }
        // Deploy failed (stale or illegal) — do not reflash; try again next tick once.
        later(run, 120);
        return;
      }
      if (action.type === 'move') {
        const res = moveUnit(action.uid, action.r, action.c);
        if (res === 'storm') {
          setAiBusy(false);
          return;
        }
        if (res === 'fail') {
          later(run, 120);
          return;
        }
        later(run, 420);
        return;
      }
      if (action.type === 'attack') {
        const def = findUnit(action.targetUid);
        if (def) {
          const ok = strike(action.uid, def.r, def.c);
          later(run, ok ? 500 : 120);
          return;
        }
        later(run, 120);
        return;
      }
      // end
      setAiBusy(false);
      setRevealCard(null);
      endRite();
    };

    later(run, 550);
    return () => {
      cancelled = true;
      clearAiTimers();
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, phase, matchOver, hotseat]);

  const legalMove = useMemo(() => {
    const empty = new Set<string>();
    const dirs = new Map<string, 'n' | 's' | 'e' | 'w'>();
    if (!attacker || inputLocked) return { empty, dirs };
    const atk = findUnit(attacker);
    if (!atk) return { empty, dirs };
    for (const p of neighbors(atk.r, atk.c)) {
      const tile = gameMap.tiles[p.r][p.c];
      if (tile.kind === 'void') continue;
      if (board[p.r][p.c]) continue;
      const key = `${p.r},${p.c}`;
      empty.add(key);
      let dir: 'n' | 's' | 'e' | 'w';
      if (p.r < atk.r) dir = 'n';
      else if (p.r > atk.r) dir = 's';
      else if (p.c < atk.c) dir = 'w';
      else dir = 'e';
      dirs.set(key, dir);
    }
    return { empty, dirs };
  }, [attacker, inputLocked, findUnit, gameMap, board]);

  const legalStrike = useMemo(() => {
    const out = new Set<string>();
    if (!attacker || inputLocked) return out;
    const atk = findUnit(attacker);
    if (!atk) return out;
    const atkPos = { ...atk.unit, r: atk.r, c: atk.c };
    for (const foe of listUnits(board)) {
      if (foe.side === atk.unit.side) continue;
      if (canStrikeTarget(atkPos, foe)) out.add(`${foe.r},${foe.c}`);
    }
    return out;
  }, [attacker, inputLocked, findUnit, board, canStrikeTarget]);

  const selectedHint = useMemo(() => {
    if (!attacker || inputLocked) return null;
    const atk = findUnit(attacker);
    if (!atk) return null;
    const ranged = hasKeyword(atk.unit, 'ranged');
    const chips: string[] = [];
    if (hasKeyword(atk.unit, 'fast')) chips.push('Fast');
    if (hasKeyword(atk.unit, 'slow')) chips.push('Slow');
    if (ranged) chips.push('Ranged');
    return {
      name: atk.unit.name,
      strikeLabel: ranged ? 'ranged within 2' : 'melee adjacent',
      chips,
    };
  }, [attacker, inputLocked, findUnit]);

  const legalDeploy = useMemo(() => {
    const idx = dragHand ?? selectedHand;
    if (idx == null || inputLocked) return new Set<string>();
    const card = hand[inputSide][idx];
    if (!card || card.kind !== 'unit') return new Set<string>();
    return new Set(deploySpots.map((p) => `${p.r},${p.c}`));
  }, [selectedHand, dragHand, deploySpots, inputLocked, hand, inputSide]);

  const startDragDeploy = useCallback(
    (handIndex: number, e: ReactPointerEvent) => {
      if (inputLocked) return;
      const card = hand[inputSide][handIndex];
      if (!card || card.kind !== 'unit' || card.power == null) return;
      if (card.cost > loyalty[inputSide]) {
        pushLog(`Not enough loyalty (need ${card.cost}).`);
        return;
      }
      dragHandRef.current = handIndex;
      setDragHand(handIndex);
      setDragPos({ x: e.clientX, y: e.clientY });
      setSelectedHand(handIndex);
      setAttacker(null);
      setSelectedUnit(null);
      setAim(null);

      const onMove = (ev: PointerEvent) => {
        setDragPos({ x: ev.clientX, y: ev.clientY });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        const idx = dragHandRef.current;
        dragHandRef.current = null;
        setDragHand(null);
        setDragPos(null);
        if (idx == null) return;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const tile = el?.closest?.('[data-tile-r][data-tile-c]') as HTMLElement | null;
        if (!tile) {
          setSelectedHand(null);
          return;
        }
        const r = Number(tile.dataset.tileR);
        const c = Number(tile.dataset.tileC);
        if (!Number.isFinite(r) || !Number.isFinite(c)) {
          setSelectedHand(null);
          return;
        }
        const ok = deployTo(r, c, idx, inputSide);
        if (!ok) setSelectedHand(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [inputLocked, hand, inputSide, loyalty, pushLog, deployTo],
  );

  const playerWon = matchOver ? matchOver.winner === PLAYER : false;
  const activeHand = hand[inputSide];
  const activeHero = inputSide === 'blue' ? blueHero : redHero;

  return (
    <section className="battlefield" data-testid="battlefield" data-mode={mode} data-phase={phase}>
      <header className="bf-hud">
        <div className="bf-score">
          <span className="bf-side is-blue">
            Azure · {blueFaction.split(' ').slice(-1)[0]}
            <strong>
              {domination.blue}/{DOMINATION_WIN}
            </strong>
            <em>L{loyalty.blue}</em>
          </span>
          <span className="bf-turn">
            Rite {turn} · {sideLabel(side)}
            {hotseat ? ' · Pass the Grimoire' : ''}
          </span>
          <span className="bf-side is-red">
            Crimson · {redFaction.split(' ').slice(-1)[0]}
            <strong>
              {domination.red}/{DOMINATION_WIN}
            </strong>
            <em>L{loyalty.red}</em>
          </span>
        </div>
        <div className="bf-actions">
          {activeHero && (
            <button
              type="button"
              className="brass-btn"
              data-testid="leader-power"
              disabled={
                inputLocked ||
                leaderUsed[inputSide] ||
                loyalty[inputSide] < (activeHero.cost ?? 0)
              }
              onClick={() => useLeader(inputSide)}
              title={activeHero.text}
            >
              {activeHero.name}
              {leaderUsed[inputSide] ? ' · spent' : ` · L${activeHero.cost}`}
            </button>
          )}
          <button
            type="button"
            className="brass-btn brass-btn-solid"
            data-testid="end-rite"
            disabled={inputLocked}
            onClick={endRite}
          >
            End rite
          </button>
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            disabled={inputLocked}
            onClick={resign}
          >
            Yield
          </button>
          {MAPS.filter((m) => (m.era ?? 'first') === (gameMap.era ?? 'first'))
            .length > 1 &&
            mode === 'training' && (
              <select
                aria-label="Field"
                value={mapId}
                onChange={(e) => {
                  bootedFor.current = null;
                  setMapId(e.target.value);
                }}
              >
                {MAPS.filter((m) => (m.era ?? 'first') === 'first').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
        </div>
      </header>

      <div className="bf-banner-slot" aria-live="polite">
      {aim ? (
        <p className="aim-banner" data-testid="aim-banner">
          Aiming {aim.kind === 'cast' ? aim.card.name : activeHero?.name} — name a
          target on the field.{' '}
          <button type="button" className="dev-link" onClick={() => setAim(null)}>
            Cancel
          </button>
        </p>
      ) : selectedHint ? (
        <p className="move-banner" data-testid="move-banner">
          <strong>{selectedHint.name}</strong>
          <span className="move-banner-sep">·</span>
          Step to{' '}
          <svg className="move-banner-chevron" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 4.2 L18.6 13.2 H15.2 V19.2 H8.8 V13.2 H5.4 Z"
              fill="#9ec8ff"
              stroke="#5a7aa8"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="move-banner-sep">·</span>
          strike ({selectedHint.strikeLabel})
          {selectedHint.chips.map((chip) => (
            <span key={chip} className="move-banner-chip">
              {chip}
            </span>
          ))}
        </p>
      ) : null}
      </div>

      <div className="bf-stage">
        <div
          className="board-wrap"
          style={{
            backgroundImage: `url(/assets/maps/${gameMap.id}.jpg)`,
          }}
        >
          <div className="board-grid" role="grid" ref={boardGridRef}>
            {gameMap.tiles.map((row, r) =>
              row.map((tile, c) => {
                if (tile.kind === 'void') {
                  return <div key={`${r}-${c}`} className="stone tile-void" />;
                }
                const here = board[r][c];
                const owned = control[r][c];
                const key = `${r},${c}`;
                const deployOk = legalDeploy.has(key);
                const moveOk = legalMove.empty.has(key);
                const moveDir = legalMove.dirs.get(key);
                const strikeOk = legalStrike.has(key);
                const isOrigin =
                  !!here &&
                  (selectedUnit === here.uid || attacker === here.uid);
                const unit = here;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={`stone tile-${tile.kind} ${
                      tile.kind === 'resource' && tile.symbols === 2
                        ? 'tile-resource-2'
                        : ''
                    } ${owned ? `owned-${owned}` : ''} ${
                      deployOk ? 'legal-tile' : ''
                    } ${moveOk ? 'legal-move' : ''} ${
                      strikeOk ? 'legal-strike' : ''
                    } ${isOrigin ? 'stone-origin' : ''} ${
                      dragHand != null && deployOk ? 'drag-target' : ''
                    } ${unit ? 'has-unit' : ''}`.trim()}
                    data-tile-r={r}
                    data-tile-c={c}
                    onClick={(e) => {
                      onTileClick(r, c);
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
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
                    <span className="cell-label">{tileLabel(tile)}</span>
                    {moveOk && moveDir && (
                      <svg
                        className={`move-way move-${moveDir}`}
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          d="M12 4.2 L18.6 13.2 H15.2 V19.2 H8.8 V13.2 H5.4 Z"
                          fill="#e7d7a4"
                          stroke="#8c6d32"
                          strokeWidth="1.1"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 6.4 L16.4 12.6 H14 V17.2 H10 V12.6 H7.6 Z"
                          fill="#c6a15b"
                          opacity="0.85"
                        />
                      </svg>
                    )}
                    {strikeOk && (
                      <svg
                        className="strike-way"
                        viewBox="0 0 48 48"
                        aria-hidden
                      >
                        <circle
                          cx="24"
                          cy="24"
                          r="18"
                          fill="none"
                          stroke="#c6a15b"
                          strokeWidth="1.6"
                          opacity="0.95"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="11"
                          fill="none"
                          stroke="#f3e2b8"
                          strokeWidth="1.1"
                          opacity="0.75"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="3.2"
                          fill="#e8c870"
                          opacity="0.9"
                        />
                        <path
                          d="M24 4 V10 M24 38 V44 M4 24 H10 M38 24 H44"
                          fill="none"
                          stroke="#c6a15b"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    {unit && (
                      <UnitCoin
                        unit={unit}
                        selected={selectedUnit === unit.uid || attacker === unit.uid}
                        foe={unit.side !== inputSide}
                        sliding={
                          !!coinSlide &&
                          coinSlide.unit.uid === unit.uid &&
                          coinSlide.toR === r &&
                          coinSlide.toC === c
                        }
                        onClick={() => onTileClick(r, c)}
                        onInspect={() => {
                          const def = cardById(unit.cardId);
                          if (def) {
                            setInspectPower(unit.power);
                            setInspectCard(def);
                          }
                        }}
                      />
                    )}
                  </button>
                );
              }),
            )}
            {coinSlide && (
              <CoinSlideLayer slide={coinSlide} gridRef={boardGridRef} />
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
          {sideLabel(inputSide)} hand · drag units to muster · tap coins to move · rites & devices speak
          {!hotseat && side === AI_SIDE ? ' · Crimson is working…' : ''}
        </p>
        <div className="hand-row">
          {activeHand.map((card, i) => {
            const isUnit = card.kind === 'unit';
            const isSpell = card.kind === 'rite' || card.kind === 'device';
            const tooCostly = card.cost > loyalty[inputSide];
            return (
              <HandCard
                key={`${card.id}-${i}`}
                card={card}
                selected={selectedHand === i || dragHand === i}
                disabled={inputLocked || tooCostly}
                onClick={() => {
                  if (inputLocked) return;
                  if (isSpell) {
                    if (tooCostly) {
                      pushLog(`Not enough loyalty (need ${card.cost}).`);
                      return;
                    }
                    if (effectNeedsAim(card.effect, card.aim)) {
                      setSelectedHand(i);
                      setAim({ kind: 'cast', handIndex: i, card });
                      setAttacker(null);
                      pushLog(`Name a target for ${card.name}.`);
                    } else {
                      castCard(inputSide, i);
                    }
                    return;
                  }
                  if (!isUnit || card.power == null) return;
                  setSelectedHand(selectedHand === i ? null : i);
                  setAttacker(null);
                  setSelectedUnit(null);
                  setAim(null);
                }}
                onInspect={() => { setInspectPower(undefined); setInspectCard(card); }}
                onDragDeployStart={
                  isUnit
                    ? (e) => startDragDeploy(i, e)
                    : undefined
                }
              />
            );
          })}
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

      {passPrompt && hotseat && (
        <div className="pass-grimoire" data-testid="pass-grimoire">
          <div className="match-plate">
            <h2>Pass the Grimoire</h2>
            <p>
              {sideLabel(side)} sits next. Hand the working across the table.
            </p>
            <button
              type="button"
              className="brass-btn brass-btn-solid"
              onClick={() => {
                brassClick();
                setPassPrompt(false);
              }}
            >
              {sideLabel(side)} is ready
            </button>
          </div>
        </div>
      )}

      {cryptidSight && (
        <div className="cryptid-sight" data-testid="cryptid-sight">
          <p className="cryptid-word">Sighting</p>
          <p className="cryptid-name">{cryptidSight}</p>
        </div>
      )}

      {dragHand != null && dragPos && activeHand[dragHand] && (
        <div
          className="drag-ghost"
          data-testid="drag-ghost"
          style={{
            left: dragPos.x,
            top: dragPos.y,
          }}
          aria-hidden
        >
          <HandCard card={activeHand[dragHand]} selected />
        </div>
      )}

      {inspectCard && (
        <TarotPop
          card={inspectCard}
          power={inspectPower}
          onClose={() => {
            setInspectCard(null);
            setInspectPower(undefined);
          }}
        />
      )}

      {revealCard && (
        <TarotPop
          card={revealCard}
          onClose={() => {
            if (revealTimerRef.current != null) {
              window.clearTimeout(revealTimerRef.current);
              revealTimerRef.current = null;
            }
            setRevealCard(null);
          }}
          caption="Crimson plays"
        />
      )}

      {matchOver && (
        <div
          className={`match-veil ${playerWon ? 'is-victory' : 'is-defeat'}`}
          role="dialog"
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
            <h2>{victoryHeadline(matchOver.kind, playerWon)}</h2>
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

      {showPrimer && mode === 'training' && (
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
