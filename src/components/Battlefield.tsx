import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { cardById } from '../data/catalog';
import { createOnceGate } from '../game/onceGate';
import { shardGainFor } from '../game/fortune';
import { matchOverWhisper, whisperFor } from '../game/secretHints';
import { FortuneReveal } from './FortuneReveal';
import { foilMask } from '../game/foil';
import { SeatInvite } from './SeatInvite';
import { HandScroller } from './HandScroller';
import {
  aiDifficultyLabel,
  aiStepCap,
  actionKey,
  pickAiAction,
  resetAiPlan,
  type AiDifficulty,
  type AiSnapshot,
} from '../game/ai';
import {
  canDeployOn,
  initialControl,
  isEnemyStronghold,
  isPaintable,
  paintTile,
  type ControlGrid,
} from '../game/control';
import {
  drawFromDeck,
  withSecretHandDrop,
  heroForFaction,
  deckForWorking,
} from '../game/deck';
import {
  actNeedsAim,
  applyPendingFieldPoison,
  castFromHand,
  effectNeedsAim,
  leaderNeedsAim,
  leaderNeedsChoice,
  resolveActivatedAbility,
  resolveLeaderPower,
  tickLeaderAuras,
  type EffectCtx,
  type EffectUnit,
  type DamagePip,
  type LeaderOpts,
} from '../game/effects';
import {
  airshipBeside,
  chillActive,
  cleanupDead,
  conquestTriggers,
  grazeAfterMove,
  isRootedOnBoard,
  leavesUnclaimed,
  musterPower,
  pollBonus,
  refreshForRite,
  resolveStrike,
  riteOpenUpkeep,
  sproutAtRiteEnd,
} from '../game/rules';
import { canBeStruck, hasKeyword, manhattan } from '../game/keywords';
import { isMainGameMap, mapById, mapsForEra, matchEra, tileLabel, tileLogName, type Side } from '../game/maps';
import {
  legalEmptySteps,
  orderedLegalDirs,
  orthoNeighbors,
  type MoveDir,
} from '../game/moves';
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
import { clashSfx, gunshotSfx, defeatStinger, victoryStinger, coinMoveSfx, unitDeathSfx, endTurnSfx, leaderCallSfx, powerCallSfx, softKnockSfx, preloadBattleSfx, preloadCoinMoveSfx, resetCoinMoveSong, spellCastSfx, preloadSpellCastSfx, setMusicBed, unlockAudio, sirenSfx, metalRiffSfx, nukeBoomSfx, nukemVoiceSfx, copSirenSfx } from '../game/sfx';
import {
  recordMatchVisit,
  recordMatchPlayed,
  rollVisitTurn,
  pickCryptid,
  type Era,
} from '../game/visits';
import type { Card } from '../game/types';
import { TarotPop } from './TarotPop';
import { HandCard } from './HandCard';
import { CardArt } from './CardArt';
import {
  LIVE_EVERY_MS,
  WATCHED_EVERY_MS,
  newMatchId,
  newMatchKey,
  reportLive,
  type FrameUnit,
  type MatchFrame,
  type PortalCode,
} from '../net/watch';
import { reportPlayed, setActivity } from '../net/table';
import { haptic } from '../game/haptics';
import { DeckPile } from './Wardrobe';
import { reportSecretFound, secretIdForCode } from '../net/secrets';
import {
  RulesPrimer,
  hasSeenPrimer,
  markPrimerSeen,
} from './RulesPrimer';
import { UnitCoin, type BoardUnit } from './UnitCoin';
import { WeatherLayer } from './WeatherLayer';
import { HighlightButton } from './HighlightShot';
import { leaderBark } from '../game/voice';
import { useEncounterLog } from '../hooks/useEncounterLog';
import { useBattleMusic } from '../hooks/useBattleMusic';
import { announce } from '../game/achievements';
import { MushroomCloud } from './MushroomCloud';
import { FalloutRain } from './FalloutRain';
import { BattleCountModal } from './BattleCountModal';
import {
  clearForceSighting,
  clearPendingJustinHand,
  clearPendingSethHand,
  clearPendingSouthHavenHand,
  isAthensCode,
  isBattleCountCode,
  isCodePrefix,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSecondHourCode,
  isSethKernCode,
  isSouthHavenPdCode,
  readForceSighting,
  readPendingJustinHand,
  readPendingSethHand,
  readPendingSouthHavenHand,
  writeHourOpen,
} from '../game/hourUnlock';
import { portalCodeFor } from '../game/portalCodes';
import { diffBoards, guestSounds, newOnPile, type FxBoard } from '../game/boardFx';
import { emptyTally, type MatchTally } from '../game/dailyRites';

/** Death-burst sparks: fixed spread so renders stay pure. */
const EMBERS = Array.from({ length: 11 }, (_, i) => ({
  a: (i * 360) / 11 + ((i * 37) % 19) - 9,
  d: 26 + ((i * 53) % 30),
  t: 0.75 + ((i * 29) % 5) * 0.09,
  s: 3 + (i % 3),
}));
import type {
  FriendMatchState,
  FriendMessage,
  FriendRole,
  FriendSession,
} from '../net/friendSession';
import {
  applyJustinKernUnlock,
  applyNukeAftermathUnlocks,
  applySethKernUnlock,
  applySouthHavenDispatchUnlock,
  type Profile,
} from '../game/profile';

type Pos = { r: number; c: number };

export type MatchMode =
  | 'training'
  | 'hotseat'
  | 'campaign'
  | 'friend'
  | 'second'
  | 'old';

export type BattlefieldProps = {
  initialMapId?: string;
  mode?: MatchMode;
  blueFaction?: string;
  redFaction?: string;
  blueHeroId?: string;
  redHeroId?: string;
  blueDeckIds?: string[];
  redDeckIds?: string[];
  /** Friend Working seat — host=Azure, guest=Crimson. */
  friendRole?: FriendRole;
  friendSession?: FriendSession;
  profile?: Profile;
  onUpdateProfile?: (next: Profile) => void;
  onLeave?: () => void;
  /** "Take a seat" on the match-over plate: open the Ledger's sign-up form. */
  onTakeSeat?: () => void;
  /** Rival mind for the Crimson AI (training / campaign / second hour). */
  aiDifficulty?: AiDifficulty;
  onMatchEnd?: (result: {
    winner: Side;
    kind: VictoryKind;
    playerWon: boolean;
    /** This hand's tallies for the Day's Rites and XP. */
    tally: MatchTally;
  }) => void;
  /** A match left before its end (or the guest's end): its tallies so far. */
  onRiteTally?: (tally: MatchTally) => void;
};

const DEFAULT_BLUE = 'The Vril Syndicate';
const DEFAULT_RED = 'The Hermetic Circle';

function uid() {
  return `u_${Math.random().toString(36).slice(2, 9)}`;
}

function neighbors(r: number, c: number): Pos[] {
  return orthoNeighbors(r, c);
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
  | { kind: 'cast'; handIndex: number; card: Card; unitUid?: string }
  | { kind: 'leader'; unitUid?: string; secondUid?: string; discardIndex?: number }
  | { kind: 'act'; uid: string };

type LeaderChoice =
  | null
  | { kind: 'scry3'; cards: Card[] }
  | { kind: 'seek' }
  | { kind: 'revive'; cards: { card: Card; index: number }[] };

function deckFor(
  faction: string,
  ids?: string[],
): Card[] {
  // Cryptids / nuke aftermath / secret hand-drops never shuffle into workings.
  return deckForWorking(faction, ids);
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
  friendRole,
  friendSession,
  profile,
  onUpdateProfile,
  onLeave,
  onTakeSeat,
  onMatchEnd,
  onRiteTally,
  aiDifficulty = 'expert',
}: BattlefieldProps = {}) {
  const [mapId, setMapId] = useState(initialMapId);
  // Warm the wooden coin-move knock and spell-cast chime so the first use plays without lag.
  useEffect(() => {
    preloadCoinMoveSfx();
    preloadSpellCastSfx();
    preloadBattleSfx();
  }, []);
  useEffect(() => {
    setMapId(initialMapId);
  }, [initialMapId]);
  const gameMap = useMemo(() => mapById(mapId), [mapId]);

  const hotseat = mode === 'hotseat';
  const friend = mode === 'friend';
  const sharedTwoPlayer = hotseat || friend;
  /** Host (or missing role) = Azure; guest = Crimson. */
  const mySide: Side =
    friend && friendRole === 'guest' ? 'red' : 'blue';
  const PLAYER: Side = mySide;
  const AI_SIDE: Side = 'red';
  // ——— The Day's Rites: what this hand did this match (flushed once per match) ———
  const tallySide: Side = mySide;
  const tallyFaction = tallySide === 'blue' ? blueFaction : redFaction;
  const tallyRef = useRef<MatchTally>(emptyTally(tallyFaction));
  const tallyDoneRef = useRef(false);
  const onRiteTallyRef = useRef(onRiteTally);
  useEffect(() => {
    onRiteTallyRef.current = onRiteTally;
  });
  /** Hand over an unfinished match's tallies (left mid-way / restarted). */
  const flushOpenTally = useCallback(() => {
    const t = tallyRef.current;
    const any = t.cast + t.destroy + t.muster + t.conquer + t.damage + t.leader > 0;
    if (!tallyDoneRef.current && any) onRiteTallyRef.current?.({ ...t, finished: false, won: false });
    tallyDoneRef.current = true;
  }, []);
  useEffect(() => () => flushOpenTally(), [flushOpenTally]);
  const isFriendGuest = friend && friendRole === 'guest';
  const isFriendHost = friend && friendRole === 'host';
  /** Guest waits until first host state arrives. */
  const [friendSynced, setFriendSynced] = useState(!friend || friendRole === 'host');
  /** Guest: first state is a seat, not a move — no sounds until we have a prior snapshot. */
  const friendSyncedRef = useRef(false);
  const lastFriendStRef = useRef<FriendMatchState | null>(null);

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
  useEncounterLog(board, hand[mySide], discard, !!matchOver);
  useBattleMusic(board, domination, turn, !!matchOver);
  const [control, setControl] = useState<ControlGrid>(() =>
    initialControl(gameMap.tiles),
  );
  const [selectedHand, setSelectedHand] = useState<number | null>(null);
  const handRowRef = useRef<HTMLDivElement | null>(null);
  // A long hand scrolls: keep the chosen card in view.
  useEffect(() => {
    if (selectedHand == null) return;
    const el = handRowRef.current?.querySelector<HTMLElement>(`[data-hand-i="${selectedHand}"]`);
    el?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedHand]);
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
  const [claimFlash, setClaimFlash] = useState<string | null>(null);
  const [domToast, setDomToast] = useState<string | null>(null);
  const claimFlashTimer = useRef<number | null>(null);
  const domToastTimer = useRef<number | null>(null);
  const slideTimerRef = useRef<number | null>(null);
  /** Melee clash nudge: per-uid lean direction for a short coin animation. */
  const [clash, setClash] = useState<null | {
    key: number;
    byUid: Record<string, { dr: number; dc: number }>;
  }>(null);
  const clashTimerRef = useRef<number | null>(null);
  /** Floating damage numbers (e.g. "-2") over coins / circles. */
  const [pips, setPips] = useState<DamagePip[]>([]);
  const showPips = useCallback((list: DamagePip[]) => {
    const live = list.filter((p) => p.text && p.text !== '-0');
    if (live.length === 0) return;
    const stamped = live.map((p, i) => ({
      ...p,
      id: `${Date.now()}-${i}-${p.uid ?? 'tile'}-${p.r}-${p.c}-${p.text}`,
    }));
    setPips((cur) => [...cur, ...stamped]);
    window.setTimeout(() => {
      setPips((cur) => cur.filter((p) => !stamped.some((x) => x.id === p.id)));
    }, 1400);
  }, []);
  const [inspectCard, setInspectCard] = useState<Card | null>(null);
  /** Code unlocks (South Haven): Close/Esc only — no backdrop dismiss. */
  const [inspectSticky, setInspectSticky] = useState(false);
  const [inspectPower, setInspectPower] = useState<number | undefined>(undefined);
  /** Hand index being dragged to muster (units only). */
  const [dragHand, setDragHand] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragHandRef = useRef<number | null>(null);
  const [cryptidSight, setCryptidSight] = useState<string | null>(null);
  /** The town's whisper under a Sighting (Athens clues). */
  const [cryptidWhisper, setCryptidWhisper] = useState<string | null>(null);
  const helloSentForRef = useRef<FriendSession | null>(null);
  /** The match-over fortune chest (shards paid) and any whispered hint. */
  const [fortune, setFortune] = useState<{ gain: number; total: number; won: boolean; hint: string | null } | null>(null);
  // Each cryptid's Sighting is announced once per match (later rites, musters and effect passes stay silent).
  const cryptidGateRef = useRef(createOnceGate());
  const announceCryptid = useCallback((name: string, ms = 2400) => {
    if (!cryptidGateRef.current.first(name)) return;
    announce({ kind: 'sighting', name });
    const whisper = whisperFor('cryptid');
    setCryptidWhisper(whisper);
    setCryptidSight(name);
    window.setTimeout(
      () => setCryptidSight((cur) => (cur === name ? null : cur)),
      whisper ? Math.max(ms, 4200) : ms,
    );
  }, []);
  const visitTurnRef = useRef<number | null>(null);
  const sightingFiredRef = useRef(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [codeToast, setCodeToast] = useState<string | null>(null);
  const [battleCountOpen, setBattleCountOpen] = useState(false);
  const [nukeActive, setNukeActive] = useState(false);
  const [falloutActive, setFalloutActive] = useState(false);
  /** Post-fallout Radiation Poisoning TarotPop (dismissible Close/Esc). */
  const [radiationPop, setRadiationPop] = useState<Card | null>(null);
  /** Post-radiation Nuclear Winter TarotPop (dismissible Close/Esc). */
  const [winterPop, setWinterPop] = useState<Card | null>(null);
  /** Lingering poison damage to apply once at the next rite open. */
  const [fieldPoisonDamage, setFieldPoisonDamage] = useState(0);
  /** Remaining rite-opens that skip Resource banking (2 ≈ one turn). */
  const [noBankOpens, setNoBankOpens] = useState(0);
  const [iconHarvestSide, setIconHarvestSide] = useState<Side | null>(null);
  const [iconHarvestOpens, setIconHarvestOpens] = useState(0);
  const [deathTitheSide, setDeathTitheSide] = useState<Side | null>(null);
  const [deathTitheOpens, setDeathTitheOpens] = useState(0);
  const fieldStatusRef = useRef({
    fieldPoisonDamage: 0,
    noBankOpens: 0,
    iconHarvestSide: null as Side | null,
    iconHarvestOpens: 0,
    deathTitheSide: null as Side | null,
    deathTitheOpens: 0,
  });
  fieldStatusRef.current = {
    fieldPoisonDamage,
    noBankOpens,
    iconHarvestSide,
    iconHarvestOpens,
    deathTitheSide,
    deathTitheOpens,
  };
  const codeRealNameRef = useRef(
    profile?.username &&
      !isSecondHourCode(profile.username) &&
      !isBattleCountCode(profile.username) &&
      !isAthensCode(profile.username) &&
      !isOppenheimerCode(profile.username)
      ? profile.username
      : 'Adept',
  );
  const pendingGadgetRef = useRef<null | { acting: Side; sourceUid: string }>(null);
  const eraRef = useRef<Era>('first');
  const [aiBusy, setAiBusy] = useState(false);
  /** Live match state for the AI turn loop (avoids stale-closure flash loops). */
  const liveRef = useRef({
    board,
    hand,
    loyalty,
    control,
    gameMap,
    deck,
    discard,
    side,
    turn,
    domination,
    phase,
    matchOver,
  });
  liveRef.current = {
    board,
    hand,
    loyalty,
    control,
    gameMap,
    deck,
    discard,
    side,
    turn,
    domination,
    phase,
    matchOver,
  };
  // ——— Combat feel, read from board diffs so every hand (host, guest, AI, hotseat) sees it ———
  const [bursts, setBursts] = useState<
    { id: string; r: number; c: number; name: string; side: Side }[]
  >([]);
  const [shake, setShake] = useState<{ key: number; hard: boolean } | null>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const prevFxRef = useRef<{ board: FxBoard; turn: number } | null>(null);
  /** bootMatch sets this so a fresh table is not read as a massacre. */
  const boardResetRef = useRef(false);
  useEffect(() => {
    const prev = prevFxRef.current;
    prevFxRef.current = { board: board as FxBoard, turn };
    if (!prev || boardResetRef.current || turn < prev.turn) {
      boardResetRef.current = false;
      return;
    }
    if (prev.board === board) return;
    const d = diffBoards(prev.board, board as FxBoard);
    {
      const t = tallyRef.current;
      for (const x of d.deaths) {
        if (x.unit.side !== tallySide) {
          t.destroy++;
          t.damage += Math.max(0, x.unit.power);
        }
      }
      for (const w of d.wounds) if (w.unit.side !== tallySide) t.damage += w.amount;
      for (const m of d.musters) if (m.unit.side === tallySide) t.muster++;
    }
    if (d.gains.length > 0) {
      showPips(
        d.gains.map((g) => ({ id: '', uid: g.unit.uid, r: g.r, c: g.c, text: `+${g.amount}` })),
      );
    }
    if (d.deaths.length > 0) {
      const stamp = Date.now();
      const fresh = d.deaths.map((x, i) => ({
        id: `${stamp}-${i}-${x.unit.uid}`,
        r: x.r,
        c: x.c,
        name: x.unit.name,
        side: x.unit.side,
      }));
      setBursts((cur) => [...cur, ...fresh]);
      unitDeathSfx();
      window.setTimeout(() => {
        setBursts((cur) => cur.filter((b) => !fresh.some((f) => f.id === b.id)));
      }, 1250);
    }
    if (d.deaths.length > 0 || d.strikers.length > 0) {
      if (shakeTimerRef.current != null) window.clearTimeout(shakeTimerRef.current);
      setShake((cur) => ({ key: (cur?.key ?? 0) + 1, hard: d.deaths.length > 0 }));
      shakeTimerRef.current = window.setTimeout(() => {
        shakeTimerRef.current = null;
        setShake(null);
      }, 420);
    }
  }, [board, turn, showPips, tallySide]);
  const prevControlRef = useRef<{ control: typeof control; turn: number } | null>(null);
  /** bootMatch sets this: the opening strongholds are not conquests. */
  const controlResetRef = useRef(false);
  useEffect(() => {
    const was = prevControlRef.current;
    prevControlRef.current = { control, turn };
    if (!was || controlResetRef.current || turn < was.turn) {
      controlResetRef.current = false;
      return;
    }
    const prev = was.control;
    if (prev === control) return;
    let n = 0;
    control.forEach((row, r) =>
      row.forEach((owner, c) => {
        if (owner === tallySide && prev[r]?.[c] !== tallySide) n++;
      }),
    );
    tallyRef.current.conquer += n;
  }, [control, turn, tallySide]);

  /** Always-latest action fns so the AI timeout loop never closes over a stale board. */
  const deployToRef = useRef<
    (r: number, c: number, handIndex: number, acting: Side) => boolean
  >(() => false);
  const moveUnitRef = useRef<
    (uidStr: string, r: number, c: number) => 'ok' | 'storm' | 'fail'
  >(() => 'fail');
  const strikeRef = useRef<(atkUid: string, defR: number, defC: number) => boolean>(
    () => false,
  );
  const castCardRef = useRef<
    (
      acting: Side,
      handIndex: number,
      targetUid?: string,
      aimPos?: Pos,
    ) => boolean
  >(() => false);
  const endRiteRef = useRef<() => void>(() => {});
  const findUnitRef = useRef<
    (id: string) => { unit: BoardUnit; r: number; c: number } | null
  >(() => null);
  const aiTimersRef = useRef<number[]>([]);
  const revealTimerRef = useRef<number | null>(null);
  /** Resume AI (or other) after the player finishes reading a muster reveal. */
  const revealResumeRef = useRef<(() => void) | null>(null);
  const [aim, setAim] = useState<AimMode>(null);
  const [leaderChoice, setLeaderChoice] = useState<LeaderChoice>(null);
  const [leaderUsed, setLeaderUsed] = useState({ blue: false, red: false });
  const leaderUsedRef = useRef(leaderUsed);
  leaderUsedRef.current = leaderUsed;
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
      const prevSide: Side = nextSide === 'blue' ? 'red' : 'blue';
      // Arrest ticks down on the side that just ended; the opening side
      // refreshes (a foe-locked unit stays exhausted for this one rite).
      const cleared = b.map((row) =>
        row.map((u) => {
          if (!u) return null;
          let arrest = u.arrest ?? 0;
          if (u.side === prevSide && arrest > 0) arrest -= 1;
          return refreshForRite({ ...u, arrest }, nextSide);
        }),
      );
      // Start-of-rite upkeep: Airship leak, Tax, Seep.
      const upkeep = riteOpenUpkeep(cleared, nextSide, liveRef.current.loyalty[nextSide]);
      upkeep.notes.forEach((line) => pushLog(line));
      if (upkeep.hurts.length) {
        showPips(upkeep.hurts.map((h) => ({ id: '', uid: h.uid, r: h.r, c: h.c, text: `-${h.damage}` })));
      }
      let working = upkeep.board;

      // Resolve deaths (and lingering field poison) through the effect ctx so
      // death triggers (burst, Salvage, Mourner) fire.
      const pendingPoison = fieldStatusRef.current.fieldPoisonDamage;
      const riteCtx: EffectCtx = {
        side: nextSide,
        loyalty: { ...liveRef.current.loyalty, [nextSide]: upkeep.loyalty },
        domination: { ...liveRef.current.domination },
        hand: {
          blue: [...h.blue],
          red: [...h.red],
        },
        deck: {
          blue: [...d.blue],
          red: [...d.red],
        },
        discard: {
          blue: [...liveRef.current.discard.blue],
          red: [...liveRef.current.discard.red],
        },
        units: {},
        board: Array.from({ length: 5 }, () => Array(5).fill(null)),
        control: ctrl.map((row) => [...row]),
        log: [],
        tiles,
      };
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const u = working[r][c];
          if (!u) continue;
          riteCtx.board[r][c] = u.uid;
          riteCtx.units[u.uid] = { ...u, keywords: [...u.keywords] };
        }
      }
      // Carry turn auras into the rite ctx, then tick (2 opens ≈ one full turn).
      riteCtx.iconHarvestSide = fieldStatusRef.current.iconHarvestSide ?? undefined;
      riteCtx.iconHarvestOpens = fieldStatusRef.current.iconHarvestOpens;
      riteCtx.deathTitheSide = fieldStatusRef.current.deathTitheSide ?? undefined;
      riteCtx.deathTitheOpens = fieldStatusRef.current.deathTitheOpens;
      tickLeaderAuras(riteCtx);
      setIconHarvestSide(riteCtx.iconHarvestSide ?? null);
      setIconHarvestOpens(riteCtx.iconHarvestOpens ?? 0);
      setDeathTitheSide(riteCtx.deathTitheSide ?? null);
      setDeathTitheOpens(riteCtx.deathTitheOpens ?? 0);
      fieldStatusRef.current.iconHarvestSide = riteCtx.iconHarvestSide ?? null;
      fieldStatusRef.current.iconHarvestOpens = riteCtx.iconHarvestOpens ?? 0;
      fieldStatusRef.current.deathTitheSide = riteCtx.deathTitheSide ?? null;
      fieldStatusRef.current.deathTitheOpens = riteCtx.deathTitheOpens ?? 0;
      // Persist breach/mustStrike clears onto the working board.
      working = working.map((row) =>
        row.map((u) => {
          if (!u) return null;
          const pu = riteCtx.units[u.uid];
          if (!pu) return u;
          return { ...u, breach: pu.breach, mustStrike: pu.mustStrike, lastStand: pu.lastStand, warded: pu.warded };
        }),
      );

      if (pendingPoison > 0) {
        applyPendingFieldPoison(riteCtx, pendingPoison);
        setFieldPoisonDamage(0);
        fieldStatusRef.current.fieldPoisonDamage = 0;
      }
      cleanupDead(riteCtx);
      if (riteCtx.pips?.length) showPips(riteCtx.pips);
      working = working.map((row) =>
        row.map((u) => {
          if (!u) return null;
          const pu = riteCtx.units[u.uid];
          if (!pu) return null; // destroyed
          return { ...u, power: pu.power, maxPower: pu.maxPower };
        }),
      );
      riteCtx.log.forEach((line) => pushLog(line));
      // Hand / deck may change on death draws (Mourner).
      h = riteCtx.hand;
      d = riteCtx.deck;
      setLoyalty(riteCtx.loyalty);
      setDiscard(riteCtx.discard);
      setDomination(riteCtx.domination);
      setControl(riteCtx.control);
      liveRef.current = {
        ...liveRef.current,
        loyalty: { ...riteCtx.loyalty },
        discard: { blue: [...riteCtx.discard.blue], red: [...riteCtx.discard.red] },
        domination: { ...riteCtx.domination },
        control: riteCtx.control.map((row) => [...row]),
      };

      setBoard(working);

      const drawn = drawFromDeck(d[nextSide], h[nextSide], 1);
      const nextDeck = { ...d, [nextSide]: drawn.deck };
      let nextHand = { ...h, [nextSide]: drawn.hand };
      setDeck(nextDeck);
      setHand(nextHand);
      liveRef.current = {
        ...liveRef.current,
        board: working,
        deck: nextDeck,
        hand: nextHand,
      };
      if (drawn.sealed) {
        pushLog(`${sideLabel(nextSide)}'s hand is sealed.`);
      } else if (drawn.drawn > 0) {
        pushLog(`${sideLabel(nextSide)} draws ${drawn.drawn}.`);
      }

      let gain = bankFromHoldings(
        tiles,
        ctrl,
        nextSide,
        bankUnits(working),
      );
      if (nextSide === 'red' && turnNum === 2) gain += 1;
      // Nuclear Winter: skip Resource income for remaining blocked rite-opens.
      let skipBank = false;
      if (fieldStatusRef.current.noBankOpens > 0) {
        skipBank = true;
        const left = fieldStatusRef.current.noBankOpens - 1;
        fieldStatusRef.current.noBankOpens = left;
        setNoBankOpens(left);
        gain = 0;
      }
      if (!skipBank) {
        setLoyalty((L) => {
          const next = {
            ...L,
            [nextSide]: applyBank(L[nextSide], gain),
          };
          // Bank into liveRef immediately so an AI tick cannot see loyalty 0
          // before React flushes this setState.
          liveRef.current = { ...liveRef.current, loyalty: next };
          return next;
        });
        pushLog(
          nextSide === 'red' && turnNum === 2
            ? `${sideLabel(nextSide)} banks ${gain} (holdings, plus the second seat's crumb).`
            : `${sideLabel(nextSide)} banks ${gain} from the stronghold and held nodes.`,
        );
      } else {
        pushLog(
          `${sideLabel(nextSide)} finds no Resources — nuclear winter holds the bank.`,
        );
      }
      pushLog(`${sideLabel(nextSide)} opens the rite.`);

      // Rare cryptid sighting (era pool): one hand drop, not both sides in Training.
      if (
        visitTurnRef.current != null &&
        turnNum === visitTurnRef.current &&
        !sightingFiredRef.current
      ) {
        sightingFiredRef.current = true;
        const era = eraRef.current;
        const names: string[] = [];
        let handAfter = { ...nextHand };
        // Shared 2P: both seats may see a sighting. Vs AI: only Azure (the player).
        const recipients: Array<'blue' | 'red'> =
          mode === 'hotseat' || mode === 'friend' ? ['blue', 'red'] : ['blue'];
        for (const s of recipients) {
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
          cryptidGateRef.current.mark(...names.slice(1));
          announceCryptid(names[0]!);
        }
      }

      return { nextDeck, nextHand, cleared };
    },
    [bankUnits, pushLog, blueFaction, redFaction, mode, showPips, announceCryptid],
  );

  const bootMatch = useCallback(
    (id: string) => {
      resetAiPlan();
      resetCoinMoveSong(); // the coin-move song starts over each match
      flushOpenTally();
      tallyRef.current = emptyTally(tallyFaction);
      tallyDoneRef.current = false;
      const m = mapById(id);
      const ctrl = initialControl(m.tiles);
      let dBlue = deckFor(blueFaction, blueDeckIds);
      let dRed = deckFor(redFaction, redDeckIds);
      const blueDraw = drawFromDeck(dBlue, [], 5);
      const redDraw = drawFromDeck(dRed, [], 5);
      dBlue = blueDraw.deck;
      dRed = redDraw.deck;
      let h = { blue: blueDraw.hand, red: redDraw.hand };
      const d = { blue: dBlue, red: dRed };
      const b = emptyBoard();

      setControl(ctrl);
      boardResetRef.current = true;
      controlResetRef.current = true;
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
      setFortune(null);
      setSelectedHand(null);
      setSelectedUnit(null);
      setAttacker(null);
      setRevealCard(null);
      setAim(null);
      setLeaderUsed({ blue: false, red: false });
      setAiBusy(false);
      setPassPrompt(false);
      setCryptidSight(null);
      // The mode sets the hour: a Sealed Century ground picked in Training,
      // Pass the Grimoire or a friend match still plays as the First Hour.
      const era: Era = matchEra(mode, m);
      eraRef.current = era;
      sightingFiredRef.current = false;
      cryptidGateRef.current.reset();
      // Rare sighting every 15th real match boot (Strict Mode remounts deduped).
      let veilNote: string | null = null;
      const forcedSight = readForceSighting();
      if (forcedSight) {
        clearForceSighting();
        visitTurnRef.current = rollVisitTurn();
        veilNote = 'Athens answers — a cryptid will visit this sitting.';
      } else if (recordMatchVisit(era)) {
        visitTurnRef.current = rollVisitTurn();
        veilNote = 'The veil thins — a cryptid may visit this sitting.';
      } else {
        visitTurnRef.current = null;
      }
      // Oppenheimer pending: drop Justin Kern into Azure hand if space.
      let justinNote: string | null = null;
      if (readPendingJustinHand()) {
        clearPendingJustinHand();
        const jk = cardById('justin_kern');
        if (jk && h.blue.length < HAND_CAP) {
          h = { ...h, blue: [...h.blue, jk] };
          setHand(h);
          if (tallySide === 'blue') tallyRef.current.touched = true;
          justinNote = 'Justin Kern answers the circle.';
        } else if (jk) {
          justinNote = "Justin Kern's hand is sealed — no room.";
        }
      }
      // Seth Kern pending: drop into Azure hand if space.
      let sethNote: string | null = null;
      if (readPendingSethHand()) {
        clearPendingSethHand();
        const sk = cardById('seth_kern');
        if (sk && h.blue.length < HAND_CAP) {
          h = { ...h, blue: [...h.blue, sk] };
          setHand(h);
          if (tallySide === 'blue') tallyRef.current.touched = true;
          sethNote = 'Seth Kern answers the circle.';
        } else if (sk) {
          sethNote = "Seth Kern's hand is sealed — no room.";
        }
      }
      // South Haven PD pending: drop Dispatch rite into Azure hand if space.
      let southHavenNote: string | null = null;
      if (readPendingSouthHavenHand()) {
        clearPendingSouthHavenHand();
        const sh = cardById('south_haven_dispatch');
        if (sh && h.blue.length < HAND_CAP) {
          h = { ...h, blue: [...h.blue, sh] };
          setHand(h);
          if (tallySide === 'blue') tallyRef.current.touched = true;
          southHavenNote = 'South Haven Dispatch answers the circle.';
        } else if (sh) {
          southHavenNote = "South Haven Dispatch's hand is sealed — no room.";
        }
      }
      setLog([
        ...(veilNote ? [veilNote] : []),
        ...(justinNote ? [justinNote] : []),
        ...(sethNote ? [sethNote] : []),
        ...(southHavenNote ? [southHavenNote] : []),
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
      const playerWon = sharedTwoPlayer
        ? winner === (friend ? mySide : side)
        : winner === PLAYER;
      if (playerWon) victoryStinger();
      else defeatStinger();
      leaderBark(playerWon || hotseat ? 'victory' : 'defeat');
      // The battle count: a finished match for this hour (here and at the table).
      recordMatchPlayed(eraRef.current);
      reportPlayed(eraRef.current);
      const gain = shardGainFor(mode, playerWon);
      const hint =
        matchOverWhisper(playerWon, playerWon && mode !== 'hotseat' && eraRef.current === 'first');
      setFortune(
        gain > 0 || hint
          ? { gain, total: (profile?.alchemicalShards ?? 0) + gain, won: playerWon, hint }
          : null,
      );
      const tally: MatchTally = {
        ...tallyRef.current,
        finished: true,
        won: winner === tallySide,
      };
      tallyDoneRef.current = true;
      onMatchEnd?.({ winner, kind, playerWon, tally });
    },
    [pushLog, onMatchEnd, hotseat, friend, sharedTwoPlayer, side, mySide, PLAYER, tallySide, mode, profile],
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
              used: u.used,
              once: u.once,
              arrest: u.arrest,
              gained: u.gained,
              warded: u.warded,
              lastStand: u.lastStand,
              breach: u.breach,
              mustStrike: u.mustStrike,
            };
          }
        }
      return {
        side: acting,
        loyalty: { ...loyalty },
        domination: { ...domination },
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
        fieldPoisonDamage,
        noBankOpens,
        iconHarvestSide: iconHarvestSide ?? undefined,
        iconHarvestOpens,
        deathTitheSide: deathTitheSide ?? undefined,
        deathTitheOpens,
        tiles: gameMap.tiles,
      };
    },
    [
      gameMap,
      board,
      loyalty,
      domination,
      hand,
      deck,
      discard,
      control,
      fieldPoisonDamage,
      noBankOpens,
      iconHarvestSide,
      iconHarvestOpens,
      deathTitheSide,
      deathTitheOpens,
    ],
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
            used: u.used,
            once: u.once,
            arrest: u.arrest,
            gained: (u.gained ?? 0) + (u.pendingGain ?? 0),
            warded: u.warded,
            lastStand: u.lastStand,
            breach: u.breach,
            mustStrike: u.mustStrike,
          };
        }
      setBoard(nextBoard);
      setLoyalty(ctx.loyalty);
      setDomination(ctx.domination);
      setHand(ctx.hand);
      setDeck(ctx.deck);
      setDiscard(ctx.discard);
      setControl(ctx.control);
      liveRef.current = {
        ...liveRef.current,
        board: nextBoard,
        loyalty: { ...ctx.loyalty },
        domination: { ...ctx.domination },
        hand: {
          blue: [...ctx.hand.blue],
          red: [...ctx.hand.red],
        },
        deck: {
          blue: [...ctx.deck.blue],
          red: [...ctx.deck.red],
        },
        discard: {
          blue: [...ctx.discard.blue],
          red: [...ctx.discard.red],
        },
        control: ctx.control.map((row) => [...row]),
      };
      ctx.log.forEach((line) => pushLog(line));

      if (ctx.fieldPoisonDamage != null) {
        setFieldPoisonDamage(ctx.fieldPoisonDamage);
        fieldStatusRef.current.fieldPoisonDamage = ctx.fieldPoisonDamage;
      }
      if (ctx.noBankOpens != null) {
        setNoBankOpens(ctx.noBankOpens);
        fieldStatusRef.current.noBankOpens = ctx.noBankOpens;
      }
      if (ctx.iconHarvestSide !== undefined || ctx.iconHarvestOpens != null) {
        const side = ctx.iconHarvestSide ?? null;
        const opens = ctx.iconHarvestOpens ?? 0;
        setIconHarvestSide(side);
        setIconHarvestOpens(opens);
        fieldStatusRef.current.iconHarvestSide = side;
        fieldStatusRef.current.iconHarvestOpens = opens;
      }
      if (ctx.deathTitheSide !== undefined || ctx.deathTitheOpens != null) {
        const side = ctx.deathTitheSide ?? null;
        const opens = ctx.deathTitheOpens ?? 0;
        setDeathTitheSide(side);
        setDeathTitheOpens(opens);
        fieldStatusRef.current.deathTitheSide = side;
        fieldStatusRef.current.deathTitheOpens = opens;
      }

      for (const u of Object.values(ctx.units)) {
        if (hasKeyword(u, 'cryptid')) announceCryptid(u.name, 2200);
      }
      if (ctx.pips?.length) showPips(ctx.pips);
    },
    [pushLog, showPips, announceCryptid],
  );

  const castCard = useCallback(
    (
      acting: Side,
      handIndex: number,
      targetUid?: string,
      aimPos?: Pos,
    ): boolean => {
      if (isFriendGuest && friendSession) {
        const card = hand[acting][handIndex];
        if (!card || (card.kind !== 'rite' && card.kind !== 'device')) return false;
        if (effectNeedsAim(card.effect, card.aim) && !targetUid && !aimPos) {
          setAim({ kind: 'cast', handIndex, card });
          pushLog(
          card.effect?.op === 'shove'
            ? `Name an exhausted unit for ${card.name}, then the circle.`
            : `Name a target for ${card.name}.`,
        );
          return false;
        }
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'cast', handIndex, targetUid, aimPos },
        });
        setAim(null);
        setSelectedHand(null);
        return true;
      }
      const card = hand[acting][handIndex];
      if (!card || (card.kind !== 'rite' && card.kind !== 'device')) return false;
      if (loyalty[acting] < card.cost) {
        pushLog(`Not enough resources (need ${card.cost}).`);
        return false;
      }
      if (!card.effect) {
        pushLog(`${card.name} has no working.`);
        return false;
      }
      if (effectNeedsAim(card.effect, card.aim) && !targetUid && !aimPos) {
        setAim({ kind: 'cast', handIndex, card });
        pushLog(
          card.effect?.op === 'shove'
            ? `Name an exhausted unit for ${card.name}, then the circle.`
            : `Name a target for ${card.name}.`,
        );
        return false;
      }
      const ctx = buildEffectCtx(acting);
      // Pay, resolve, spend to discard, and any "then discard a card".
      const err = castFromHand(ctx, acting, handIndex, targetUid, aimPos);
      if (err) {
        pushLog(err);
        return false;
      }
      applyEffectCtx(ctx);
      setSelectedHand(null);
      setAim(null);
      if (card.id === 'south_haven_dispatch') copSirenSfx();
      else if (hasKeyword(card, 'gas')) sirenSfx();
      else spellCastSfx();
      if (acting === tallySide) tallyRef.current.cast++;
      return true;
    },
    [hand, loyalty, buildEffectCtx, applyEffectCtx, pushLog],
  );

  const invokeLeader = useCallback(
    (
      acting: Side,
      targetUid?: string,
      aimPos?: Pos,
      opts: LeaderOpts = {},
    ): boolean => {
      const hero = acting === 'blue' ? blueHero : redHero;
      if (!hero) {
        pushLog('No leader sworn for this chair.');
        return false;
      }
      const op = hero.leaderPower?.op;
      const choice = leaderNeedsChoice(hero);

      // Multi-step / choice gates before paying.
      if (choice === 'scry3' && opts.pick == null && !leaderChoice) {
        const top = deck[acting].slice(0, 3);
        if (!top.length) {
          pushLog('Your well is dry.');
          return false;
        }
        setLeaderChoice({ kind: 'scry3', cards: top });
        pushLog(`Look at the top ${top.length} for ${hero.name}. Name one for your hand.`);
        return false;
      }
      if (choice === 'seek' && !opts.seek && !leaderChoice) {
        setLeaderChoice({ kind: 'seek' });
        pushLog(`Name unit or spell for ${hero.name}.`);
        return false;
      }
      if (choice === 'revive') {
        if (opts.discardIndex == null && aim?.kind === 'leader' && aim.discardIndex == null && !leaderChoice) {
          const cards = discard[acting]
            .map((card, index) => ({ card, index }))
            .filter((x) => x.card.kind === 'unit' && x.card.faction === 'The Whitethorn Coven');
          if (!cards.length) {
            pushLog('No Whitethorn Coven unit lies in your discard.');
            return false;
          }
          setLeaderChoice({ kind: 'revive', cards });
          pushLog(`Name a slain Whitethorn Coven unit for ${hero.name}.`);
          return false;
        }
        const discIdx = opts.discardIndex ?? (aim?.kind === 'leader' ? aim.discardIndex : undefined);
        if (discIdx != null && !aimPos) {
          setAim({ kind: 'leader', discardIndex: discIdx });
          setLeaderChoice(null);
          pushLog('Name an empty circle you control that is not a stronghold.');
          return false;
        }
        if (discIdx != null) opts = { ...opts, discardIndex: discIdx };
      }
      if (choice === 'copy_kw') {
        if (!targetUid) {
          setAim({ kind: 'leader' });
          pushLog(`Name the teacher for ${hero.name} (keywords to copy).`);
          return false;
        }
        if (!opts.secondUid && !(aim?.kind === 'leader' && aim.secondUid)) {
          setAim({ kind: 'leader', unitUid: targetUid });
          pushLog(`Name the pupil for ${hero.name} (receives the keywords).`);
          return false;
        }
        if (!opts.secondUid && aim?.kind === 'leader' && aim.secondUid) {
          opts = { ...opts, secondUid: aim.secondUid };
        }
      }

      if (isFriendGuest && friendSession) {
        if (leaderNeedsAim(hero) && !targetUid && !(op === 'claim' && aimPos) && !(op === 'revive_coven' && aimPos)) {
          setAim({ kind: 'leader' });
          pushLog(`Name a target for ${hero.name}.`);
          return false;
        }
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: {
            kind: 'useLeader',
            targetUid,
            secondUid: opts.secondUid ?? undefined,
            aimPos,
            pick: opts.pick,
            seek: opts.seek,
            discardIndex: opts.discardIndex,
          },
        });
        setAim(null);
        setLeaderChoice(null);
        return true;
      }
      if (leaderUsed[acting]) {
        pushLog(`${hero.name} has already spoken this sitting.`);
        return false;
      }
      if (
        leaderNeedsAim(hero) &&
        !targetUid &&
        !(op === 'claim' && aimPos) &&
        !(op === 'revive_coven' && aimPos)
      ) {
        setAim({ kind: 'leader' });
        pushLog(
          op === 'slide'
            ? `Name an exhausted unit for ${hero.name}, then the circle it slides to.`
            : op === 'transmute'
              ? `Name an enemy unit for ${hero.name}.`
              : `Name a target for ${hero.name}.`,
        );
        return false;
      }
      const ctx = buildEffectCtx(acting);
      const err = resolveLeaderPower(ctx, hero, targetUid, aimPos, opts);
      if (err) {
        pushLog(err);
        return false;
      }
      applyEffectCtx(ctx);
      setLeaderUsed((L) => ({ ...L, [acting]: true }));
      setAim(null);
      setLeaderChoice(null);
      leaderCallSfx();
      leaderBark(hotseat || acting === tallySide ? 'power' : 'foe');
      if (acting === tallySide) tallyRef.current.leader++;
      return true;
    },
    [
      blueHero,
      redHero,
      leaderUsed,
      buildEffectCtx,
      applyEffectCtx,
      pushLog,
      deck,
      discard,
      aim,
      leaderChoice,
      isFriendGuest,
      friendSession,
      hotseat,
      tallySide,
    ],
  );

  const callPower = useCallback(
    (acting: Side, sourceUid: string, targetUid?: string): boolean => {
      if (isFriendGuest && friendSession) {
        const found = findUnit(sourceUid);
        if (!found) {
          pushLog('That unit is not on the field.');
          return false;
        }
        const def = cardById(found.unit.cardId);
        const act = def?.act;
        if (!def || !act) {
          pushLog('That unit has no power to call.');
          return false;
        }
        if (actNeedsAim(act) && !targetUid) {
          setAim({ kind: 'act', uid: sourceUid });
          setSelectedUnit(sourceUid);
          setAttacker(null);
          setSelectedHand(null);
          pushLog(`Name a target for ${def.name}.`);
          return false;
        }
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'callPower', uid: sourceUid, targetUid },
        });
        setAim(null);
        setSelectedUnit(null);
        return true;
      }
      const found = findUnit(sourceUid);
      if (!found) {
        pushLog('That unit is not on the field.');
        return false;
      }
      const def = cardById(found.unit.cardId);
      const act = def?.act;
      if (!def || !act) {
        pushLog('That unit has no power to call.');
        return false;
      }
      if (actNeedsAim(act) && !targetUid) {
        setAim({ kind: 'act', uid: sourceUid });
        setSelectedUnit(sourceUid);
        setAttacker(null);
        setSelectedHand(null);
        pushLog(`Name a target for ${def.name}.`);
        return false;
      }
      // Nuclear gadget: play mushroom cloud, then wipe the field.
      if (act.op === 'gadget') {
        if (act.once ? found.unit.once : found.unit.used) {
          pushLog('That power has already been called.');
          return false;
        }
        const pay = act.pay ?? 0;
        if (loyalty[acting] < pay) {
          pushLog(`Not enough resources (need ${pay}).`);
          return false;
        }
        pendingGadgetRef.current = { acting, sourceUid };
        setNukeActive(true);
        announce({ kind: 'secret', id: 'gadget' });
        setAim(null);
        setSelectedUnit(null);
        setAttacker(null);
        unlockAudio();
        metalRiffSfx();
        nukemVoiceSfx();
        nukeBoomSfx();
        return true;
      }
      const ctx = buildEffectCtx(acting);
      const err = resolveActivatedAbility(ctx, sourceUid, targetUid);
      if (err) {
        pushLog(err);
        return false;
      }
      applyEffectCtx(ctx);
      setAim(null);
      setSelectedUnit(null);
      setAttacker(null);
      powerCallSfx();
      // Mid-rite domination from tap-crown etc.
      if (ctx.domination[acting] >= DOMINATION_WIN) {
        finishMatch(
          acting,
          'dominance',
          `${sideLabel(acting)} reaches ${DOMINATION_WIN} domination.`,
        );
      }
      return true;
    },
    [findUnit, buildEffectCtx, applyEffectCtx, pushLog, finishMatch, loyalty],
  );

  const finishGadget = useCallback(() => {
    const pending = pendingGadgetRef.current;
    pendingGadgetRef.current = null;
    setNukeActive(false);
    setFalloutActive(true);
    if (!pending) return;
    const ctx = buildEffectCtx(pending.acting);
    const err = resolveActivatedAbility(ctx, pending.sourceUid);
    if (err) {
      pushLog(err);
      return;
    }
    applyEffectCtx(ctx);
  }, [buildEffectCtx, applyEffectCtx, pushLog]);


  function dropJustinIntoHand(seat: Side, unlock = true): string {
    if (seat === tallySide) tallyRef.current.touched = true;
    const jk = cardById('justin_kern');
    if (!jk) return 'Justin Kern is missing from the catalogue.';
    const drop = withSecretHandDrop(liveRef.current.hand[seat], jk, HAND_CAP);
    if (!drop.dropped) {
      return "The hand is sealed — Justin Kern cannot enter.";
    }
    const nextHand = { ...liveRef.current.hand, [seat]: drop.hand };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (unlock && profile && onUpdateProfile) {
      onUpdateProfile(applyJustinKernUnlock(profile));
    }
    return 'Justin Kern answers — the gadget is in hand.';
  }

  function dropSethIntoHand(seat: Side, unlock = true): string {
    if (seat === tallySide) tallyRef.current.touched = true;
    const sk = cardById('seth_kern');
    if (!sk) return 'Seth Kern is missing from the catalogue.';
    const drop = withSecretHandDrop(liveRef.current.hand[seat], sk, HAND_CAP);
    if (!drop.dropped) {
      return "The hand is sealed — Seth Kern cannot enter.";
    }
    const nextHand = { ...liveRef.current.hand, [seat]: drop.hand };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (unlock && profile && onUpdateProfile) {
      // Unlock requires username === 'seth kern'; preserve display name after.
      const unlocked = applySethKernUnlock({ ...profile, username: 'seth kern' });
      onUpdateProfile({ ...unlocked, username: profile.username });
    }
    return 'Seth Kern answers — the chief is in hand.';
  }

  function dropSouthHavenIntoHand(seat: Side, unlock = true): string {
    if (seat === tallySide) tallyRef.current.touched = true;
    const sh = cardById('south_haven_dispatch');
    if (!sh) return 'South Haven Dispatch is missing from the catalogue.';
    const drop = withSecretHandDrop(liveRef.current.hand[seat], sh, HAND_CAP);
    if (!drop.dropped) {
      return 'The hand is sealed — South Haven Dispatch cannot enter.';
    }
    const nextHand = { ...liveRef.current.hand, [seat]: drop.hand };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (unlock && profile && onUpdateProfile) {
      onUpdateProfile(applySouthHavenDispatchUnlock(profile));
    }
    return 'South Haven Dispatch answers — the siren is in hand.';
  }

  function forceSightingNow(): string {
    if (matchOver || phase === 'over') {
      return 'The night answers only while a circle is open.';
    }
    if (sightingFiredRef.current) {
      return 'A cryptid has already answered this sitting.';
    }
    const era = eraRef.current;
    const recipients: Array<'blue' | 'red'> =
      mode === 'hotseat' || mode === 'friend' ? ['blue', 'red'] : ['blue'];
    const names: string[] = [];
    let handAfter = { ...liveRef.current.hand };
    for (const s of recipients) {
      if (handAfter[s].length >= HAND_CAP) continue;
      const faction = s === 'blue' ? blueFaction : redFaction;
      const card = pickCryptid(faction, era);
      if (!card) continue;
      handAfter = { ...handAfter, [s]: [...handAfter[s], card] };
      names.push(card.name);
      pushLog(`Cryptid sighted. ${card.name} joins ${sideLabel(s)}.`);
    }
    if (names.length === 0) {
      return 'No cryptid answers that order.';
    }
    sightingFiredRef.current = true;
    visitTurnRef.current = null;
    setHand(handAfter);
    liveRef.current = { ...liveRef.current, hand: handAfter };
    cryptidGateRef.current.mark(...names.slice(1));
    announceCryptid(names[0]!);
    return `Sighting: ${names.join(', ')}.`;
  }

  function onBattleCodeChange(raw: string) {
    const next = raw.slice(0, 32);
    setCodeDraft(next);
    const secret = secretIdForCode(next);
    if (secret) reportSecretFound(secret, codeRealNameRef.current || profile?.username);
    if (isSecondHourCode(next)) {
      writeHourOpen();
      setCodeToast('The leaden hour answers.');
      setCodeDraft('');
      return;
    }
    if (isBattleCountCode(next)) {
      setBattleCountOpen(true);
      setCodeToast(null);
      setCodeDraft('');
      return;
    }
    // Friend guest: the host holds the match, so a typed code travels to it and
    // lands in the guest's (Crimson) hand there. The reveal + unlock play here.
    const guestCode = isFriendGuest && friendSession ? portalCodeFor(next) : null;
    if (guestCode && friendSession) {
      setCodeDraft('');
      if (guestCode !== 'athens') tallyRef.current.touched = true;
      friendSession.send({ v: 1, type: 'intent', intent: { kind: 'code', code: guestCode } });
      setCodeToast(
        guestCode === 'athens'
          ? 'The night answers across the table.'
          : guestCode === 'adept'
            ? 'A hidden adept has answered.'
            : 'The plate crosses to your hand.',
      );
      revealPortalCode(guestCode);
      unlockPortalCode(guestCode);
      return;
    }
    if (isAthensCode(next)) {
      setCodeDraft('');
      setCodeToast(forceSightingNow());
      return;
    }
    if (isOppenheimerCode(next)) {
      setCodeDraft('');
      unlockAudio();
      metalRiffSfx();
      const seat: Side =
        mode === 'hotseat' || mode === 'friend' ? (mode === 'friend' ? mySide : side) : 'blue';
      setCodeToast(dropJustinIntoHand(seat));
      const jk = cardById('justin_kern');
      if (jk) {
        setInspectPower(undefined);
        setInspectSticky(true);
        setInspectCard(jk);
      }
      return;
    }
    if (isSethKernCode(next)) {
      setCodeDraft('');
      unlockAudio();
      copSirenSfx();
      const seat: Side =
        mode === 'hotseat' || mode === 'friend' ? (mode === 'friend' ? mySide : side) : 'blue';
      setCodeToast(dropSethIntoHand(seat));
      const sk = cardById('seth_kern');
      if (sk) {
        setInspectPower(undefined);
        setInspectSticky(true);
        setInspectCard(sk);
      }
      return;
    }
    if (isSouthHavenPdCode(next)) {
      setCodeDraft('');
      unlockAudio();
      copSirenSfx();
      const seat: Side =
        mode === 'hotseat' || mode === 'friend' ? (mode === 'friend' ? mySide : side) : 'blue';
      setCodeToast(dropSouthHavenIntoHand(seat));
      const sh = cardById('south_haven_dispatch');
      if (sh) {
        setInspectPower(undefined);
        setInspectSticky(true);
        setInspectCard(sh);
      }
      return;
    }
    if (!isCodePrefix(next)) {
      codeRealNameRef.current = next || codeRealNameRef.current;
    }
    if (isHiddenAdeptCode(next)) {
      // Hidden Adept answers like Oppenheimer: Justin drops into hand (one
      // shot, every time) with a reveal that stays until Close / Esc. The
      // profile is only scrubbed — Justin is never a collection plate.
      setCodeDraft('');
      unlockAudio();
      metalRiffSfx();
      const seat: Side =
        mode === 'hotseat' || mode === 'friend' ? (mode === 'friend' ? mySide : side) : 'blue';
      const msg = dropJustinIntoHand(seat);
      setCodeToast(`A hidden adept has answered. ${msg}`);
      const jk = cardById('justin_kern');
      if (jk) {
        setInspectPower(undefined);
        setInspectSticky(true);
        setInspectCard(jk);
      }
    }
  }

  /** The reveal + sound a code gives the hand that receives it (as if typed there). */
  function revealPortalCode(code: PortalCode) {
    unlockAudio();
    if (code === 'seth' || code === 'southhaven') copSirenSfx();
    else if (code === 'justin' || code === 'adept') metalRiffSfx();
    const id =
      code === 'seth'
        ? 'seth_kern'
        : code === 'southhaven'
          ? 'south_haven_dispatch'
          : code === 'athens'
            ? null
            : 'justin_kern';
    const card = id ? cardById(id) : null;
    if (card) {
      setInspectPower(undefined);
      setInspectSticky(true);
      setInspectCard(card);
    }
  }

  /** The profile side of a code, for a hand that is not the authority (the guest). */
  function unlockPortalCode(code: PortalCode) {
    if (!profile || !onUpdateProfile) return;
    if (code === 'justin' || code === 'adept') onUpdateProfile(applyJustinKernUnlock(profile));
    else if (code === 'seth') {
      const unlocked = applySethKernUnlock({ ...profile, username: 'seth kern' });
      onUpdateProfile({ ...unlocked, username: profile.username });
    } else if (code === 'southhaven') onUpdateProfile(applySouthHavenDispatchUnlock(profile));
  }

  /**
   * The owner's Portal sent a code to `target`. The authority (host / the only
   * client) applies it to the match state; the receiving hand gets the same
   * reveal, sound and unlock as if it had typed the code itself.
   */
  function applyPortalCode(code: PortalCode, target: Side, echo = true) {
    if (isFriendGuest) return;
    const humanHere =
      mode === 'hotseat' || (friend ? target === mySide : target === 'blue');
    const msg =
      code === 'athens'
        ? forceSightingNow()
        : code === 'seth'
          ? dropSethIntoHand(target, humanHere)
          : code === 'southhaven'
            ? dropSouthHavenIntoHand(target, humanHere)
            : dropJustinIntoHand(target, humanHere);
    pushLog(
      echo
        ? `A hand from beyond the portal reaches ${sideLabel(target)}. ${msg}`
        : `${sideLabel(target)} speaks a word of power. ${msg}`,
    );
    if (humanHere) {
      setCodeToast(code === 'adept' ? `A hidden adept has answered. ${msg}` : msg);
      revealPortalCode(code);
    } else if (friend && friendSession) {
      // A guest-typed code already revealed on the guest; only the Portal echoes.
      if (echo) friendSession.send({ v: 1, type: 'portal', code });
    } else {
      setCodeToast(`Beyond the portal, ${sideLabel(target)} is answered.`);
    }
  }
  const applyPortalCodeRef = useRef(applyPortalCode);
  useEffect(() => {
    applyPortalCodeRef.current = applyPortalCode;
  });
  const portalArriveRef = useRef<(code: PortalCode) => void>(() => undefined);
  useEffect(() => {
    portalArriveRef.current = (code) => {
      setCodeToast(
        code === 'athens'
          ? 'Beyond the portal, the night answers.'
          : code === 'adept'
            ? 'A hidden adept has answered through the portal.'
            : 'A hand from beyond the portal answers you.',
      );
      revealPortalCode(code);
      unlockPortalCode(code);
    };
  });

  const callPowerRef = useRef<
    (acting: Side, sourceUid: string, targetUid?: string) => boolean
  >(() => false);
  callPowerRef.current = callPower;

  const deployTo = useCallback(
    (r: number, c: number, handIndex: number, acting: Side) => {
      if (isFriendGuest && friendSession) {
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'deploy', r, c, handIndex },
        });
        setSelectedHand(null);
        setDragHand(null);
        return true;
      }
      const card = hand[acting][handIndex];
      if (!card || card.kind !== 'unit' || card.power == null) return false;
      if (board[r][c]) {
        pushLog('That circle is occupied.');
        return false;
      }
      const deployTile = gameMap.tiles[r][c];
      // Airship: may also muster onto an empty circle beside it.
      const fromAirship =
        airshipBeside(board, acting, r, c) &&
        deployTile.kind !== 'void' &&
        !isEnemyStronghold(deployTile, acting);
      if (!canDeployOn(deployTile, control, r, c, acting) && !fromAirship) {
        pushLog(
          'Deploy onto your stronghold, a gate you hold, or an empty circle beside your airship.',
        );
        return false;
      }
      if (loyalty[acting] < card.cost) {
        pushLog(`Not enough resources (need ${card.cost}).`);
        return false;
      }
      // Delay (slow muster) or an enemy Chill unit: musters exhausted.
      const delayed = hasKeyword(card, 'delay') || chillActive(board, acting);
      // Warband: +1 power per other unit you already control.
      const musterP = musterPower(card, board, acting);
      const unit: BoardUnit = {
        uid: uid(),
        cardId: card.id,
        name: card.name,
        side: acting,
        power: musterP,
        maxPower: musterP,
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
        liveRef.current = { ...liveRef.current, board: next };
        return next;
      });
      setLoyalty((L) => {
        const next = { ...L, [acting]: L[acting] - card.cost };
        liveRef.current = { ...liveRef.current, loyalty: next };
        return next;
      });
      // Charm (foe) / Berserk (self): discard a random card on muster.
      const discardSide: Side | null = hasKeyword(card, 'berserk')
        ? acting
        : hasKeyword(card, 'charm')
          ? acting === 'blue'
            ? 'red'
            : 'blue'
          : null;
      const handAfter = {
        ...hand,
        [acting]: hand[acting].filter((_, i) => i !== handIndex),
      };
      let discarded: Card | null = null;
      if (discardSide) {
        const pool = [...handAfter[discardSide]];
        if (pool.length > 0) {
          const i = Math.floor(Math.random() * pool.length);
          [discarded] = pool.splice(i, 1);
          handAfter[discardSide] = pool;
        }
      }
      setHand(handAfter);
      liveRef.current = { ...liveRef.current, hand: handAfter };
      setSelectedHand(null);
      pushLog(
        `${sideLabel(acting)} deploys ${card.name} (P${musterP} · L${card.cost})${
          delayed ? ' · cannot act yet' : ''
        }${fromAirship ? ' · from the airship' : ''}.`,
      );
      // Scandal: the other chair loses 2 resources.
      if (hasKeyword(card, 'scandal')) {
        const other: Side = acting === 'blue' ? 'red' : 'blue';
        setLoyalty((L) => {
          const next = { ...L, [other]: Math.max(0, L[other] - 2) };
          liveRef.current = { ...liveRef.current, loyalty: next };
          return next;
        });
        pushLog(`${card.name} strips 2 resources from the other chair.`);
      }
      if (discardSide) {
        if (discarded) {
          const lost = discarded;
          setDiscard((D) => {
            const next = { ...D, [discardSide]: [...D[discardSide], lost] };
            liveRef.current = { ...liveRef.current, discard: next };
            return next;
          });
          pushLog(`${card.name} discards ${lost.name}.`);
        } else {
          pushLog(`${card.name} finds that hand empty.`);
        }
      }
      if (hasKeyword(card, 'cryptid')) announceCryptid(card.name, 2200);
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
      coinMoveSfx();
      return true;
    },
    [hand, board, control, gameMap, loyalty, pushLog, announceCryptid],
  );

  const canStrikeTarget = useCallback(
    (atk: BoardUnit & Pos, def: BoardUnit & Pos): boolean => {
      if (def.side === atk.side) return false;
      const dist = manhattan(atk.r, atk.c, def.r, def.c);
      return canBeStruck(atk, def, dist, atk, def);
    },
    [],
  );

  const flashClaim = useCallback((r: number, c: number, label: string) => {
    haptic('capture');
    if (claimFlashTimer.current != null) window.clearTimeout(claimFlashTimer.current);
    setClaimFlash(`${r},${c}|${label}`);
    claimFlashTimer.current = window.setTimeout(() => {
      claimFlashTimer.current = null;
      setClaimFlash(null);
    }, 850);
  }, []);

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
      if (isFriendGuest && friendSession) {
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'move', uid: uidStr, r, c },
        });
        setAttacker(null);
        setSelectedUnit(null);
        return 'ok';
      }
      const atk = findUnit(uidStr);
      if (!atk) return 'fail';
      if (atk.unit.sick || atk.unit.moved || atk.unit.attacked) {
        pushLog(`${atk.unit.name} cannot act.`);
        return 'fail';
      }
      if ((atk.unit.arrest ?? 0) > 0) {
        pushLog(`${atk.unit.name} is arrested and cannot move.`);
        return 'fail';
      }
      if (isRootedOnBoard(board, atk.unit.side, atk.r, atk.c)) {
        pushLog(`${atk.unit.name} is rooted and cannot move or strike.`);
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

      if (isEnemyStronghold(tile, atk.unit.side) && !leavesUnclaimed(atk.unit)) {
        kickCoinSlide(atk.unit, atk.r, atk.c, r, c);
        coinMoveSfx();
        setBoard((b) => {
          const next = b.map((row) => [...row]);
          next[atk.r][atk.c] = null;
          next[r][c] = { ...atk.unit, moved: true };
          liveRef.current = { ...liveRef.current, board: next };
          return next;
        });
        setControl((C) => {
          const next = C.map((row) => [...row]);
          next[r][c] = atk.unit.side;
          liveRef.current = { ...liveRef.current, control: next };
          return next;
        });
        finishMatch(
          atk.unit.side,
          'stronghold',
          `${atk.unit.name} seizes the enemy stronghold. The hour is over.`,
        );
        return 'storm';
      }

      // Unclaiming / Veiled cross without conquering; conquest triggers
      // (Glory, Bloom, Toll, Deed, Canvass) fire on a newly taken circle;
      // Graze clears adjacent enemy claims after the step.
      const unclaimed = leavesUnclaimed(atk.unit);
      const prevOwner = control[r][c];
      const conquers = !unclaimed && isPaintable(tile) && prevOwner !== atk.unit.side;
      let ctrl = control.map((row) => [...row]);
      let power = atk.unit.power;
      let maxPower = atk.unit.maxPower;
      let bank = 0;
      let domGain = 0;
      const notes: string[] = [];
      if (unclaimed) {
        notes.push(
          tile.kind === 'stronghold'
            ? `${atk.unit.name} crosses the stronghold and leaves it unclaimed.`
            : `${atk.unit.name} crosses the circle and leaves it unclaimed.`,
        );
      } else if (isPaintable(tile)) {
        ctrl = paintTile(ctrl, gameMap.tiles, r, c, atk.unit.side);
        if (conquers) {
          const won = conquestTriggers({ ...atk.unit }, gameMap.tiles, ctrl, r, c);
          ctrl = won.control;
          power = won.power;
          maxPower = won.maxPower;
          bank = won.bank;
          domGain = won.domination;
          notes.push(`${atk.unit.name} conquers the ${tileLogName(tile)}.`);
          notes.push(...won.notes);
          flashClaim(r, c, 'Conquered');
        } else {
          notes.push(`${atk.unit.name} advances.`);
        }
      } else {
        notes.push(`${atk.unit.name} advances.`);
      }
      const grazed = grazeAfterMove(atk.unit, gameMap.tiles, ctrl, r, c);
      ctrl = grazed.control;
      notes.push(...grazed.notes);
      kickCoinSlide(atk.unit, atk.r, atk.c, r, c);
      coinMoveSfx();
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        next[atk.r][atk.c] = null;
        next[r][c] = {
          ...atk.unit,
          power,
          maxPower,
          gained: (atk.unit.gained ?? 0) + Math.max(0, maxPower - atk.unit.maxPower),
          moved: true,
        };
        liveRef.current = { ...liveRef.current, board: next };
        return next;
      });
      setControl(ctrl);
      liveRef.current = { ...liveRef.current, control: ctrl };
      notes.forEach((n) => pushLog(n));
      if (bank > 0) {
        setLoyalty((L) => {
          const next = { ...L, [atk.unit.side]: applyBank(L[atk.unit.side], bank) };
          liveRef.current = { ...liveRef.current, loyalty: next };
          return next;
        });
      }
      if (domGain > 0) {
        setDomination((D) => {
          const next = { ...D, [atk.unit.side]: D[atk.unit.side] + domGain };
          liveRef.current = { ...liveRef.current, domination: next };
          return next;
        });
      }
      setAttacker(null);
      setSelectedUnit(null);
      return 'ok';
    },
    [findUnit, gameMap, board, control, pushLog, finishMatch, kickCoinSlide, flashClaim],
  );

  const strike = useCallback(
    (atkUid: string, defR: number, defC: number): boolean => {
      if (isFriendGuest && friendSession) {
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'strike', atkUid, defR, defC },
        });
        setAttacker(null);
        setSelectedUnit(null);
        return true;
      }
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
        pushLog('That foe cannot be struck (out of reach, behind Shutter, or Untargetable).');
        return false;
      }
      const ctx = buildEffectCtx(atk.unit.side);
      const out = resolveStrike(ctx, gameMap.tiles, atkUid, defR, defC);
      if (out.error) {
        pushLog(out.error);
        return false;
      }
      if (out.slide) {
        kickCoinSlide(
          out.slide.unit as BoardUnit,
          out.slide.fromR,
          out.slide.fromC,
          out.slide.toR,
          out.slide.toC,
        );
      }
      applyEffectCtx(ctx);
      if (!out.ranged) {
        // Brief clash nudge: both coins lean into the blow.
        const dr = Math.sign(defR - atk.r);
        const dc = Math.sign(defC - atk.c);
        if (clashTimerRef.current != null) window.clearTimeout(clashTimerRef.current);
        setClash({
          key: Date.now(),
          byUid: { [atk.unit.uid]: { dr, dc }, [here.uid]: { dr: -dr, dc: -dc } },
        });
        clashTimerRef.current = window.setTimeout(() => {
          clashTimerRef.current = null;
          setClash(null);
        }, 460);
      }
      if (out.ranged) gunshotSfx();
      else clashSfx();
      if (out.conquered) flashClaim(out.conquered.r, out.conquered.c, 'Conquered');
      setPhase('melee');
      setAttacker(null);
      setSelectedUnit(null);
      if (out.stronghold) {
        finishMatch(
          atk.unit.side,
          'stronghold',
          `${atk.unit.name} seizes the enemy stronghold. The hour is over.`,
        );
        return true;
      }
      if (ctx.domination[atk.unit.side] >= DOMINATION_WIN) {
        finishMatch(
          atk.unit.side,
          'dominance',
          `${sideLabel(atk.unit.side)} reaches ${DOMINATION_WIN} domination.`,
        );
        return true;
      }
      setTimeout(() => {
        setPhase((p) => (p === 'over' ? p : 'main'));
      }, 350);
      return true;
    },
    [findUnit, board, pushLog, canStrikeTarget, buildEffectCtx, applyEffectCtx, gameMap, kickCoinSlide, flashClaim, finishMatch],
  );

  const endRite = useCallback(() => {
    if (isFriendGuest && friendSession) {
      friendSession.send({ v: 1, type: 'intent', intent: { kind: 'endRite' } });
      return;
    }
    const live = liveRef.current;
    if (live.phase === 'over' || live.matchOver) return;
    endTurnSfx();
    const acting = live.side;
    const holdings = countHoldings(live.gameMap.tiles, live.control, acting);
    // Poll: +1 per poll unit standing on a circle this side holds.
    const polled = pollBonus(live.board, live.control, acting);
    const scored = live.domination[acting] + holdings + polled;
    const nextDom = { ...live.domination, [acting]: scored };
    setDomination(nextDom);
    liveRef.current = { ...liveRef.current, domination: nextDom };
    pushLog(
      `${sideLabel(acting)} holds ${holdings} circles${polled ? ` and polls ${polled}` : ''} (+${holdings + polled} Domination → ${scored}/${DOMINATION_WIN}).`,
    );
    if (domToastTimer.current != null) window.clearTimeout(domToastTimer.current);
    setDomToast(
      `${sideLabel(acting)} · +${holdings + polled} Domination · ${scored}/${DOMINATION_WIN}`,
    );
    domToastTimer.current = window.setTimeout(() => {
      domToastTimer.current = null;
      setDomToast(null);
    }, 2400);

    if (scored >= DOMINATION_WIN) {
      finishMatch(
        acting,
        'dominance',
        `${sideLabel(acting)} reaches ${DOMINATION_WIN} domination.`,
      );
      return;
    }

    // Sprout: a standing sprout unit grows +1 at the end of its own rite.
    const sprouted = sproutAtRiteEnd(liveRef.current.board, acting);
    if (sprouted.notes.length > 0) {
      sprouted.notes.forEach((line) => pushLog(line));
      setBoard(sprouted.board);
      liveRef.current = { ...liveRef.current, board: sprouted.board };
    }

    const next: Side = acting === 'blue' ? 'red' : 'blue';
    const nextTurn = live.turn + 1;
    setTurn(nextTurn);
    setSide(next);
    liveRef.current = {
      ...liveRef.current,
      side: next,
      turn: nextTurn,
      phase: 'main',
    };
    setSelectedHand(null);
    setSelectedUnit(null);
    setAttacker(null);
    setAim(null);
    setPhase('main');

    if (hotseat) {
      setPassPrompt(true);
    }

    // Read board/hand/deck/control from liveRef so AI-deployed coins survive the flip.
    const snap = liveRef.current;
    openRiteFor(
      next,
      snap.gameMap.tiles,
      snap.control,
      snap.board,
      snap.deck,
      snap.hand,
      nextTurn,
    );
  }, [pushLog, finishMatch, openRiteFor, hotseat]);

  const resign = useCallback(() => {
    if (phase === 'over' || matchOver) return;
    if (isFriendGuest && friendSession) {
      friendSession.send({ v: 1, type: 'intent', intent: { kind: 'resign' } });
      return;
    }
    const loser = sharedTwoPlayer ? (friend ? mySide : side) : PLAYER;
    const winner: Side = loser === 'blue' ? 'red' : 'blue';
    finishMatch(winner, 'yield', `${sideLabel(loser)} yields the circle.`);
  }, [
    phase,
    matchOver,
    side,
    finishMatch,
    hotseat,
    friend,
    sharedTwoPlayer,
    mySide,
    PLAYER,
    isFriendGuest,
    friendSession,
  ]);

  const inputSide: Side = hotseat ? side : friend ? mySide : PLAYER;
  const inputLocked =
    phase === 'over' ||
    !!matchOver ||
    (friend && (!friendSynced || side !== mySide)) ||
    (hotseat && passPrompt) ||
    (!sharedTwoPlayer && (side !== PLAYER || aiBusy));

  function onTileClick(r: number, c: number) {
    if (inputLocked) return;
    const tile = gameMap.tiles[r][c];
    if (tile.kind === 'void') return;

    if (aim) {
      const here = unitAt(r, c);
      if (aim.kind === 'cast') {
        // Shove (e.g. Lapse of Nerve): name an exhausted unit, then the circle.
        if (aim.card.effect?.op === 'shove') {
          if (!aim.unitUid) {
            if (!here) {
              pushLog('Name an exhausted unit.');
              return;
            }
            setAim({ ...aim, unitUid: here.uid });
            pushLog('Name an empty adjacent circle that is not a stronghold.');
            return;
          }
          castCard(inputSide, aim.handIndex, aim.unitUid, { r, c });
          return;
        }
        if (aim.card.effect?.op === 'claim') {
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
        const op = hero?.leaderPower?.op;
        // Slide (e.g. The Birch Crone): name an exhausted unit, then the circle.
        if (op === 'slide') {
          if (!aim.unitUid) {
            if (!here) {
              pushLog('Name an exhausted unit.');
              return;
            }
            setAim({ kind: 'leader', unitUid: here.uid });
            pushLog('Name an empty adjacent circle that is not a stronghold.');
            return;
          }
          invokeLeader(inputSide, aim.unitUid, { r, c });
          return;
        }
        // Provost: teacher then pupil.
        if (op === 'copy_kw') {
          if (!aim.unitUid) {
            if (!here || here.side !== inputSide) {
              pushLog('Name a unit you own (the teacher).');
              return;
            }
            setAim({ kind: 'leader', unitUid: here.uid });
            pushLog('Name the pupil (receives the keywords).');
            return;
          }
          if (!here || here.side !== inputSide) {
            pushLog('Name a unit you own (the pupil).');
            return;
          }
          invokeLeader(inputSide, aim.unitUid, undefined, { secondUid: here.uid });
          return;
        }
        // Whitethorn Queen: discard already chosen; name an empty controlled circle.
        if (op === 'revive_coven') {
          invokeLeader(inputSide, undefined, { r, c }, { discardIndex: aim.discardIndex });
          return;
        }
        if (op === 'claim') {
          invokeLeader(inputSide, undefined, { r, c });
        } else if (here) {
          invokeLeader(inputSide, here.uid, { r, c });
        } else {
          pushLog('Name a unit.');
        }
        return;
      }
      if (aim.kind === 'act') {
        if (here) {
          callPower(inputSide, aim.uid, here.uid);
        } else {
          pushLog('Name a unit.');
        }
        return;
      }
    }

    const here = unitAt(r, c);

    // Tap own coin → select for move/strike and/or Call power.
    if (!attacker && here && here.side === inputSide) {
      const def = cardById(here.cardId);
      const hasAct = !!def?.act;
      const ready = !here.sick && !here.moved && !here.attacked;
      if (ready || hasAct) {
        setSelectedUnit(here.uid);
        setAttacker(ready ? here.uid : null);
        setSelectedHand(null);
        setAim(null);
        return;
      }
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
      // Same-side coin: switch selection (move-ready or Call power).
      {
        const def = cardById(here.cardId);
        const hasAct = !!def?.act;
        const ready = !here.sick && !here.moved && !here.attacked;
        if (ready || hasAct) {
          setSelectedUnit(here.uid);
          setAttacker(ready ? here.uid : null);
        } else {
          setAttacker(null);
          setSelectedUnit(null);
          pushLog(`${here.name} has already acted this rite.`);
        }
      }
      return;
    }

    if (here && here.side === inputSide) {
      const def = cardById(here.cardId);
      if (def?.act) {
        setSelectedUnit(here.uid);
        setAttacker(null);
        setSelectedHand(null);
        return;
      }
      if (here.sick || here.moved || here.attacked) {
        pushLog(`${here.name} has already acted this rite.`);
      }
      return;
    }
  }

  deployToRef.current = deployTo;
  moveUnitRef.current = moveUnit;
  strikeRef.current = strike;
  castCardRef.current = castCard;
  endRiteRef.current = endRite;
  findUnitRef.current = findUnit;

  const invokeLeaderRef = useRef(invokeLeader);
  invokeLeaderRef.current = invokeLeader;

  const buildFriendState = useCallback((): FriendMatchState => {
    return {
      mapId,
      loyalty,
      domination,
      turn,
      side,
      phase,
      matchOver,
      log: log.slice(0, 30),
      deck,
      hand,
      discard,
      board,
      control,
      leaderUsed,
      cryptidSight,
      blueFaction,
      redFaction,
    };
  }, [
    mapId,
    loyalty,
    domination,
    turn,
    side,
    phase,
    matchOver,
    log,
    deck,
    hand,
    discard,
    board,
    control,
    leaderUsed,
    cryptidSight,
    blueFaction,
    redFaction,
  ]);

  const applyFriendState = useCallback((st: FriendMatchState) => {
    // The guest never runs the rules, so it hears the table from the diff:
    // coin steps and musters, casts, strikes, and the end of the sitting.
    const before = liveRef.current;
    if (friendSyncedRef.current && before.board) {
      const diff = diffBoards(before.board as FxBoard, st.board as FxBoard);
      const fresh = [
        ...newOnPile(before.discard?.blue ?? [], st.discard?.blue ?? []),
        ...newOnPile(before.discard?.red ?? [], st.discard?.red ?? []),
      ];
      for (const snd of guestSounds(diff, fresh)) {
        if (snd === 'move') coinMoveSfx();
        else if (snd === 'cast') spellCastSfx();
        else if (snd === 'gas') sirenSfx();
        else if (snd === 'dispatch') copSirenSfx();
        else if (snd === 'gunshot') gunshotSfx();
        else if (snd === 'clash') clashSfx();
        else if (snd === 'power') powerCallSfx();
      }
      const prevSt = lastFriendStRef.current;
      if (prevSt) {
        if (
          (!prevSt.leaderUsed?.blue && st.leaderUsed?.blue) ||
          (!prevSt.leaderUsed?.red && st.leaderUsed?.red)
        ) {
          leaderCallSfx();
          leaderBark(!prevSt.leaderUsed?.[mySide] && st.leaderUsed?.[mySide] ? 'power' : 'foe');
        }
        if (prevSt.side !== st.side && !st.matchOver) endTurnSfx();
      }
      const step = diff.moves[0];
      if (step) kickCoinSlide(step.unit as BoardUnit, step.fromR, step.fromC, step.toR, step.toC);
      if (diff.wounds.length > 0) {
        showPips(
          diff.wounds.map((w) => ({ uid: w.unit.uid, r: w.r, c: w.c, id: '', text: `-${w.amount}` })),
        );
      }
      if (before.side === mySide) {
        const mine = mySide === 'blue' ? before.discard?.blue ?? [] : before.discard?.red ?? [];
        const now = mySide === 'blue' ? st.discard?.blue ?? [] : st.discard?.red ?? [];
        tallyRef.current.cast += newOnPile(mine, now).filter(
          (c) => c.kind === 'rite' || c.kind === 'device',
        ).length;
      }
      if (prevSt && !prevSt.leaderUsed?.[mySide] && st.leaderUsed?.[mySide]) {
        tallyRef.current.leader++;
      }
      if (!before.matchOver && st.matchOver) {
        if (!tallyDoneRef.current) {
          tallyDoneRef.current = true;
          onRiteTallyRef.current?.({
            ...tallyRef.current,
            finished: true,
            won: st.matchOver.winner === mySide,
          });
        }
        if (st.matchOver.winner === mySide) victoryStinger();
        else defeatStinger();
        leaderBark(st.matchOver.winner === mySide ? 'victory' : 'defeat');
        // The host reports the match to the table; the guest keeps its own count.
        recordMatchPlayed(eraRef.current);
      }
    }
    if (before.matchOver && !st.matchOver) {
      // The host set a new table: a fresh tally for the new match.
      tallyRef.current = emptyTally(tallyFaction);
      tallyDoneRef.current = false;
    }
    friendSyncedRef.current = true;
    lastFriendStRef.current = st;
    if (st.mapId && st.mapId !== mapId) setMapId(st.mapId);
    setLoyalty(st.loyalty);
    setDomination(st.domination);
    setTurn(st.turn);
    setSide(st.side);
    setPhase(st.phase);
    setMatchOver(st.matchOver);
    setLog(st.log ?? []);
    setDeck(st.deck);
    setHand(st.hand);
    setDiscard(st.discard);
    setBoard(st.board);
    setControl(st.control);
    setLeaderUsed(st.leaderUsed);
    if (st.cryptidSight != null) announceCryptid(st.cryptidSight);
    liveRef.current = {
      ...liveRef.current,
      board: st.board,
      hand: st.hand,
      loyalty: st.loyalty,
      control: st.control,
      deck: st.deck,
      discard: st.discard,
      side: st.side,
      turn: st.turn,
      domination: st.domination,
      phase: st.phase,
      matchOver: st.matchOver,
    };
    setFriendSynced(true);
    setSelectedHand(null);
    setSelectedUnit(null);
    setAttacker(null);
    setAim(null);
    setPassPrompt(false);
    setAiBusy(false);
  }, [mapId, kickCoinSlide, showPips, mySide, announceCryptid, tallyFaction]);

  // Guest: say hello until the host's first state lands (either side may mount first).
  useEffect(() => {
    if (!friend || !friendSession || !isFriendGuest) return;
    let tries = 0;
    const hello = () =>
      friendSession.send({ v: 1, type: 'hello', role: 'guest', room: friendSession.room });
    hello();
    const t = window.setInterval(() => {
      tries += 1;
      if (friendSyncedRef.current || tries > 40) {
        window.clearInterval(t);
        return;
      }
      hello();
    }, 1500);
    return () => window.clearInterval(t);
  }, [friend, friendSession, isFriendGuest]);

  // Host: broadcast authoritative state (debounced).
  useEffect(() => {
    if (!isFriendHost || !friendSession) return;
    const t = window.setTimeout(() => {
      friendSession.send({ v: 1, type: 'state', state: buildFriendState() });
    }, 60);
    return () => window.clearTimeout(t);
  }, [isFriendHost, friendSession, buildFriendState]);

  // Wire PeerJS messages: guest applies state; host applies guest intents.
  useEffect(() => {
    if (!friend || !friendSession) return;

    const onMessage = (msg: FriendMessage) => {
      if (msg.type === 'state' && isFriendGuest) {
        applyFriendState(msg.state);
        return;
      }
      if (msg.type === 'portal' && isFriendGuest) {
        portalArriveRef.current(msg.code);
        return;
      }
      if (msg.type === 'hello') {
        if (isFriendHost) {
          friendSession.send({
            v: 1,
            type: 'hello',
            role: 'host',
            room: friendSession.room,
          });
          friendSession.send({
            v: 1,
            type: 'state',
            state: buildFriendState(),
          });
        }
        return;
      }
      if (msg.type === 'intent' && isFriendHost) {
        const intent = msg.intent;
        // Guest is always Crimson (red).
        const acting: Side = 'red';
        if (intent.kind === 'code') {
          // A code the guest typed: any turn, like typing it on your own field.
          applyPortalCodeRef.current(intent.code, acting, false);
          return;
        }
        if (liveRef.current.side !== acting && intent.kind !== 'resign') {
          return;
        }
        switch (intent.kind) {
          case 'deploy':
            deployToRef.current(
              intent.r,
              intent.c,
              intent.handIndex,
              acting,
            );
            break;
          case 'move':
            moveUnitRef.current(intent.uid, intent.r, intent.c);
            break;
          case 'strike':
            strikeRef.current(intent.atkUid, intent.defR, intent.defC);
            break;
          case 'cast':
            castCardRef.current(
              acting,
              intent.handIndex,
              intent.targetUid,
              intent.aimPos,
            );
            break;
          case 'useLeader':
            invokeLeaderRef.current(acting, intent.targetUid, intent.aimPos, {
              secondUid: intent.secondUid,
              pick: intent.pick,
              seek: intent.seek,
              discardIndex: intent.discardIndex,
            });
            break;
          case 'callPower':
            callPowerRef.current(acting, intent.uid, intent.targetUid);
            break;
          case 'endRite':
            endRiteRef.current();
            break;
          case 'resign': {
            const loser: Side = 'red';
            const winner: Side = 'blue';
            finishMatch(
              winner,
              'yield',
              `${sideLabel(loser)} yields the circle.`,
            );
            break;
          }
          default:
            break;
        }
      }
    };

    friendSession.setOnMessage((msg) => onMessage(msg));

    // Greet once per link: this effect re-runs as state changes, and a hello
    // each time made the host answer with hello + a full state, endlessly.
    // (The guest's hello is retried by its own effect below until a state lands.)
    if (helloSentForRef.current === friendSession) {
      return () => {
        friendSession.setOnMessage(null);
      };
    }
    helloSentForRef.current = friendSession;
    if (isFriendHost) {
      friendSession.send({
        v: 1,
        type: 'hello',
        role: 'host',
        room: friendSession.room,
      });
      friendSession.send({ v: 1, type: 'state', state: buildFriendState() });
    }

    return () => {
      friendSession.setOnMessage(null);
    };
  }, [
    friend,
    friendSession,
    isFriendGuest,
    isFriendHost,
    applyFriendState,
    buildFriendState,
    finishMatch,
  ]);

  // The Portal: report this match (host / only client) so the owner can watch.
  const [portalIds] = useState(() =>
    isFriendGuest ? null : { id: newMatchId(), key: newMatchKey() },
  );
  const portalFrame = useMemo((): MatchFrame => {
    const slim = (u: BoardUnit | null): FrameUnit | null =>
      u
        ? {
            uid: u.uid,
            cardId: u.cardId,
            name: u.name,
            side: u.side,
            power: u.power,
            maxPower: u.maxPower,
            loyalty: u.loyalty,
            keywords: u.keywords,
            sick: u.sick,
            gained: u.gained,
          }
        : null;
    return {
      map: mapId,
      turn,
      side,
      phase,
      resources: { blue: loyalty.blue, red: loyalty.red },
      domination: { blue: domination.blue, red: domination.red },
      hand: { blue: hand.blue.length, red: hand.red.length },
      deck: { blue: deck.blue.length, red: deck.red.length },
      board: board.map((row) => row.map(slim)),
      control: control.map((row) => [...row]),
      log: log.slice(-14),
      over: matchOver ? { winner: matchOver.winner, reason: matchOver.kind } : null,
    };
  }, [mapId, turn, side, phase, loyalty, domination, hand, deck, board, control, log, matchOver]);
  const portalSummary = useMemo(() => {
    const foeName =
      mode === 'friend'
        ? 'Crimson occultist'
        : mode === 'hotseat'
          ? 'Second chair'
          : `${aiDifficulty[0].toUpperCase()}${aiDifficulty.slice(1)} rival`;
    const myName = (profile?.username || '').trim() || 'Adept';
    return {
      mode,
      era: matchEra(mode, gameMap),
      map: gameMap.name,
      turn,
      side,
      phase,
      blue: { name: myName, faction: blueFaction, leader: blueHero?.name ?? '' },
      red: { name: foeName, faction: redFaction, leader: redHero?.name ?? '' },
      over: !!matchOver,
    };
  }, [mode, aiDifficulty, profile?.username, gameMap, turn, side, phase, blueFaction, redFaction, blueHero, redHero, matchOver]);
  // Tell the table which field this hand is on (the owner's roll links it to the Portal).
  useEffect(() => {
    setActivity({ match: portalIds?.id, era: matchEra(mode, gameMap), map: gameMap.name });
    return () => setActivity({ match: undefined, era: undefined, map: undefined });
  }, [portalIds, mode, gameMap]);
  const portalLatest = useRef({ frame: portalFrame, summary: portalSummary });
  useEffect(() => {
    portalLatest.current = { frame: portalFrame, summary: portalSummary };
  }, [portalFrame, portalSummary]);
  const portalWatched = useRef(false);
  const portalPoke = useRef<() => void>(() => undefined);
  useEffect(() => {
    const ids = portalIds;
    if (!ids) return;
    let stopped = false;
    let timer: number | undefined;
    let inFlight = false;
    let lastSent = 0;
    let overSent = 0;
    const seen = new Set<number>();
    const send = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      lastSent = Date.now();
      const { frame, summary } = portalLatest.current;
      const res = await reportLive({
        id: ids.id,
        key: ids.key,
        summary,
        // The board always rides along (about 1–2 KB), so the Portal opens on
        // the live field at once instead of waiting for the watched handshake.
        frame,
      });
      inFlight = false;
      if (stopped) return;
      if (res) {
        const wasWatched = portalWatched.current;
        portalWatched.current = res.watched;
        for (const cmd of res.cmds) {
          if (seen.has(cmd.n)) continue;
          seen.add(cmd.n);
          applyPortalCodeRef.current(cmd.code, cmd.side);
        }
        // Just started being watched: send the first frame right away.
        if (res.watched && !wasWatched) {
          schedule(150);
          return;
        }
      }
      if (summary.over) overSent++;
      if (overSent > 2) return;
      schedule(portalWatched.current ? WATCHED_EVERY_MS : LIVE_EVERY_MS);
    };
    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void send(), ms);
    };
    portalPoke.current = () => {
      if (!portalWatched.current) return;
      const since = Date.now() - lastSent;
      schedule(Math.max(0, 600 - since));
    };
    schedule(1_500);
    // Left the field (or closed the page): one last word so the Portal drops it quickly.
    let said = false;
    const bye = () => {
      if (said) return;
      said = true;
      void reportLive({ id: ids.id, key: ids.key, summary: { ...portalLatest.current.summary, over: true } });
    };
    window.addEventListener('pagehide', bye);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', bye);
      portalPoke.current = () => undefined;
      bye();
    };
  }, [portalIds]);
  // While watched, a changed field goes through promptly.
  useEffect(() => {
    portalPoke.current();
  }, [portalFrame]);

  // AI loop for training / campaign / second — skipped for shared 2P
  useEffect(() => {
    if (sharedTwoPlayer) return;
    if (phase === 'over' || matchOver) return;
    if (side !== AI_SIDE) return;

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

    const clearRevealTimer = () => {
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };

    const finishReveal = () => {
      clearRevealTimer();
      setRevealCard(null);
      const resume = revealResumeRef.current;
      revealResumeRef.current = null;
      if (!cancelled && resume) resume();
    };

    /** Hold the enemy muster card until tap-to-dismiss (or a long safety timeout). */
    const showAiReveal = (card: Card, onDone: () => void) => {
      clearRevealTimer();
      revealResumeRef.current = onDone;
      setRevealCard(card);
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        finishReveal();
      }, 14000);
    };

    const cap = aiStepCap(aiDifficulty);
    const avoid: string[] = [];
    const stopAi = () => {
      setAiBusy(false);
      clearRevealTimer();
      revealResumeRef.current = null;
      setRevealCard(null);
      endRiteRef.current();
    };

    const run = () => {
      if (cancelled) return;
      steps += 1;
      if (steps > cap) {
        stopAi();
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
                  sick: !!u.sick,
                  used: !!u.used,
                  once: !!u.once,
                  cardId: u.cardId,
                  r,
                  c,
                  maxPower: u.maxPower,
                  tough: !!u.tough || u.keywords.includes('tough'),
                  fast: !!u.fast || u.keywords.includes('fast'),
                  arrest: u.arrest ?? 0,
                  shutter: !!u.shutter,
                  silenced: !!u.silenced,
                  powder: !!u.powder,
                  name: u.name,
                  loyalty: u.loyalty,
                }
              : null,
          ),
        ),
        hand: live.hand.red,
        loyalty: live.loyalty.red,
        domination: { ...live.domination },
        leader: redHero ?? undefined,
        leaderUsed: leaderUsedRef.current.red,
        avoid: [...avoid],
        foeLoyalty: live.loyalty.blue,
        turn: live.turn,
      };
      const action = pickAiAction(snap, aiDifficulty);
      // A pick that fails (stale or illegal) is never offered again this rite.
      const failed = () => {
        avoid.push(actionKey(action));
        later(run, 90);
      };

      if (action.type === 'cast') {
        const card = live.hand.red[action.index];
        const aimPos =
          action.r != null && action.c != null ? { r: action.r, c: action.c } : undefined;
        // Never open the player's aim prompt on the AI's behalf.
        const unaimed =
          !!card && effectNeedsAim(card.effect, card.aim) && !action.targetUid && !aimPos;
        if (card && !unaimed && castCardRef.current(AI_SIDE, action.index, action.targetUid, aimPos)) {
          showAiReveal(card, () => later(run, 280));
          return;
        }
        failed();
        return;
      }

      if (action.type === 'leader') {
        const aimPos =
          action.r != null && action.c != null ? { r: action.r, c: action.c } : undefined;
        const unaimed = !!redHero && leaderNeedsAim(redHero) && !action.targetUid && !aimPos;
        if (redHero && !unaimed && invokeLeaderRef.current(AI_SIDE, action.targetUid, aimPos)) {
          showAiReveal(redHero, () => later(run, 280));
          return;
        }
        failed();
        return;
      }

      if (action.type === 'act') {
        const src = findUnitRef.current(action.uid);
        const card = src ? cardById(src.unit.cardId) : undefined;
        const unaimed = !!card?.act && actNeedsAim(card.act) && !action.targetUid;
        if (!unaimed && callPowerRef.current(AI_SIDE, action.uid, action.targetUid)) {
          if (card) {
            showAiReveal(card, () => later(run, 320));
          } else {
            later(run, 420);
          }
          return;
        }
        failed();
        return;
      }

      if (action.type === 'deploy') {
        const card = live.hand.red[action.index];
        if (card?.kind === 'unit' && deployToRef.current(action.r, action.c, action.index, AI_SIDE)) {
          showAiReveal(card, () => later(run, 320));
          return;
        }
        failed();
        return;
      }
      if (action.type === 'move') {
        const res = moveUnitRef.current(action.uid, action.r, action.c);
        if (res === 'storm') {
          setAiBusy(false);
          return;
        }
        if (res === 'fail') {
          failed();
          return;
        }
        later(run, 420);
        return;
      }
      if (action.type === 'attack') {
        const def = findUnitRef.current(action.targetUid);
        if (def && strikeRef.current(action.uid, def.r, def.c)) {
          later(run, 500);
          return;
        }
        failed();
        return;
      }
      // end — call latest endRite so openRiteFor keeps AI-deployed coins
      stopAi();
    };

    later(run, 550);
    return () => {
      cancelled = true;
      clearAiTimers();
      if (revealTimerRef.current != null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      revealResumeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, phase, matchOver, sharedTwoPlayer, aiDifficulty, redHero]);

  const legalMove = useMemo(() => {
    const empty = new Set<string>();
    const dirs = new Map<string, MoveDir>();
    if (!attacker || inputLocked) return { empty, dirs };
    const atk = findUnit(attacker);
    if (!atk) return { empty, dirs };
    return legalEmptySteps(atk.r, atk.c, gameMap.tiles, (r, c) => !!board[r][c]);
  }, [attacker, inputLocked, findUnit, gameMap, board]);

  const legalMoveDirs = useMemo(
    () => orderedLegalDirs(legalMove.dirs),
    [legalMove],
  );

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

  // Shove / slide: once the exhausted unit is named, light the circles it may go to.
  const lapseGhost = useMemo(() => {
    const out = new Set<string>();
    if (!aim || aim.kind === 'act' || !aim.unitUid) return out;
    const found = findUnit(aim.unitUid);
    if (!found) return out;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const r = found.r + dr;
      const c = found.c + dc;
      const t = gameMap.tiles[r]?.[c];
      if (!t || t.kind === 'void' || t.kind === 'stronghold') continue;
      if (board[r]?.[c]) continue;
      out.add(`${r},${c}`);
    }
    return out;
  }, [aim, findUnit, gameMap, board]);

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
      strikeLabel: ranged ? 'straight line, 2 circles' : 'melee adjacent',
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
        pushLog(`Not enough resources (need ${card.cost}).`);
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
  /** Foil copies shine in the hand that is this profile's own working. */
  const handFoil =
    (hotseat ? inputSide === 'blue' : inputSide === PLAYER) && profile?.foils
      ? foilMask(activeHand.map((c) => c.id), profile.foils)
      : [];
  const activeHero = inputSide === 'blue' ? blueHero : redHero;
  const foeHero = inputSide === 'blue' ? redHero : blueHero;
  /** Pass the Grimoire: turn the circle toward Crimson's chair on Crimson's rite. */
  const seatFlip = hotseat && side === 'red';
  const readLeader = (card: Card) => {
    setInspectPower(undefined);
    setInspectSticky(false);
    setInspectCard(card);
  };

  return (
    <section
      className={`battlefield${nukeActive ? ' nuke-shake' : ''}${seatFlip ? ' is-seat-flip' : ''}`}
      data-testid="battlefield"
      data-mode={mode}
      data-phase={phase}
      data-seat-flip={seatFlip ? 'true' : 'false'}
    >
      <header className="bf-hud">
        <div
          className={`bf-scores${seatFlip ? ' is-seat-flip' : ''}`}
          aria-label="Resources and Domination"
        >
          <dl className="score-chip is-ally" data-testid="score-azure">
            <dt>Azure · {blueFaction.split(' ').slice(-1)[0]}</dt>
            <dd>
              <span className="score-resource-jewel" role="img" aria-label="Resources" title="Resources" />
              <strong className="score-loyalty" title="Resources — spend to muster units and cast rites">
                {loyalty.blue}
              </strong>
              <span>resources</span>
              <em title="Domination score">
                {domination.blue}
                <span className="score-cap"> / {DOMINATION_WIN}</span>
              </em>
              <span>dom</span>
            </dd>
            <p className="bf-hold">
              Holding <b>{countHoldings(gameMap.tiles, control, 'blue')}</b>
              {' · next bank +'}
              <b>
                {bankFromHoldings(
                  gameMap.tiles,
                  control,
                  'blue',
                  bankUnits(board),
                )}
              </b>
            </p>
          </dl>
          <div className="bf-turn">
            <span className="bf-turn-label">Rite</span>
            <strong>{turn}</strong>
            <span className={`bf-side is-${side}`}>
              {sideLabel(side)}
              {hotseat ? ' · Pass the Grimoire' : friend ? (friendRole === 'guest' ? ' · guest · Crimson' : ' · host · Azure') : ''}
            </span>
          </div>
          <dl className="score-chip is-enemy" data-testid="score-crimson">
            <dt>
              Crimson · {redFaction.split(' ').slice(-1)[0]}
              {!sharedTwoPlayer && (
                <span className="bf-mind" data-testid="ai-mind">
                  {aiDifficultyLabel(aiDifficulty)}
                </span>
              )}
            </dt>
            <dd>
              <span className="score-resource-jewel" role="img" aria-label="Resources" title="Resources" />
              <strong className="score-loyalty" title="Resources — spend to muster units and cast rites">
                {loyalty.red}
              </strong>
              <span>resources</span>
              <em title="Domination score">
                {domination.red}
                <span className="score-cap"> / {DOMINATION_WIN}</span>
              </em>
              <span>dom</span>
            </dd>
            <p className="bf-hold">
              Holding <b>{countHoldings(gameMap.tiles, control, 'red')}</b>
              {' · next bank +'}
              <b>
                {bankFromHoldings(
                  gameMap.tiles,
                  control,
                  'red',
                  bankUnits(board),
                )}
              </b>
            </p>
          </dl>
        </div>
        <div className="bf-actions">
          <div className="leader-tray">
            {activeHero && (
              <button
                type="button"
                className="leader-plate is-mine"
                data-testid="my-leader"
                onClick={() => readLeader(activeHero)}
              >
                <CardArt name={activeHero.name} className="leader-plate-art" />
                <span className="leader-plate-copy">
                  <strong>{activeHero.name}</strong>
                  <em>{activeHero.text}</em>
                </span>
              </button>
            )}
            {foeHero && (
              <button
                type="button"
                className="leader-plate is-foe"
                data-testid="foe-leader"
                onClick={() => readLeader(foeHero)}
              >
                <CardArt name={foeHero.name} className="leader-plate-art" />
                <span className="leader-plate-copy">
                  <strong>{foeHero.name}</strong>
                  <em>{foeHero.text}</em>
                </span>
              </button>
            )}
          </div>
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
              onClick={() => invokeLeader(inputSide)}
              title={activeHero.text}
            >
              {leaderUsed[inputSide] ? 'Spent' : `Speak · R${activeHero.cost}`}
            </button>
          )}
          {(() => {
            const uidSel = selectedUnit ?? (aim?.kind === 'act' ? aim.uid : null);
            if (!uidSel) return null;
            const found = findUnit(uidSel);
            if (!found || found.unit.side !== inputSide) return null;
            const def = cardById(found.unit.cardId);
            const act = def?.act;
            if (!act) return null;
            const pay = act.pay ?? 0;
            const spent = act.once ? !!found.unit.once : !!found.unit.used;
            const blocked =
              inputLocked ||
              !!found.unit.sick ||
              spent ||
              loyalty[inputSide] < pay;
            return (
              <button
                type="button"
                className="brass-btn brass-btn-solid"
                data-testid="call-power"
                disabled={blocked}
                onClick={() => callPower(inputSide, found.unit.uid)}
                title={def?.text ?? 'Call power'}
              >
                Call power{pay ? ` · R${pay}` : ''}
                {spent ? ' · spent' : ''}
              </button>
            );
          })()}
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
          {mode === 'training' && isMainGameMap(mapId) && (
            <select
              aria-label="Field"
              data-testid="bf-field-select"
              value={mapId}
              onChange={(e) => {
                bootedFor.current = null;
                setMapId(e.target.value);
              }}
            >
              <optgroup label="The First Hour">
                {mapsForEra('first').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="The Sealed Century">
                {mapsForEra('old').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      </header>

      <div className="bf-banner-slot" aria-live="polite">
      {aim ? (
        <p className="aim-banner" data-testid="aim-banner">
          Aiming{' '}
          {aim.kind === 'cast'
            ? aim.card.name
            : aim.kind === 'act'
              ? cardById(findUnit(aim.uid)?.unit.cardId ?? '')?.name ?? 'power'
              : activeHero?.name}{' '}
          {aim.kind === 'leader' && activeHero?.leaderPower?.op === 'copy_kw'
            ? aim.unitUid
              ? '— name the pupil (receives the keywords).'
              : '— name the teacher (keywords to copy).'
            : aim.kind === 'leader' && activeHero?.leaderPower?.op === 'revive_coven'
              ? '— name an empty circle you control that is not a stronghold.'
              : (aim.kind === 'cast' && aim.card.effect?.op === 'shove') ||
                  (aim.kind === 'leader' && activeHero?.leaderPower?.op === 'slide')
                ? aim.unitUid
                  ? '— name an empty adjacent circle that is not a stronghold.'
                  : '— name an exhausted unit.'
                : '— name a target on the field.'}{' '}
          <button type="button" className="dev-link" onClick={() => { setAim(null); setLeaderChoice(null); }}>
            Cancel
          </button>
        </p>
      ) : leaderChoice ? (
        <div className="aim-banner leader-choice" data-testid="leader-choice">
          {leaderChoice.kind === 'scry3' && (
            <>
              <span>Name one for your hand; the rest sink to the bottom.</span>
              <div className="leader-choice-row">
                {leaderChoice.cards.map((c, i) => (
                  <button
                    key={`${c.id}-${i}`}
                    type="button"
                    className="brass-btn"
                    data-testid={`scry-pick-${i}`}
                    onClick={() => invokeLeader(inputSide, undefined, undefined, { pick: i })}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {leaderChoice.kind === 'seek' && (
            <>
              <span>Name a kind for the sleeping prophet.</span>
              <div className="leader-choice-row">
                <button type="button" className="brass-btn" data-testid="seek-unit" onClick={() => invokeLeader(inputSide, undefined, undefined, { seek: 'unit' })}>
                  Unit
                </button>
                <button type="button" className="brass-btn" data-testid="seek-rite" onClick={() => invokeLeader(inputSide, undefined, undefined, { seek: 'rite' })}>
                  Spell
                </button>
              </div>
            </>
          )}
          {leaderChoice.kind === 'revive' && (
            <>
              <span>Name a slain Whitethorn Coven unit.</span>
              <div className="leader-choice-row">
                {leaderChoice.cards.map(({ card, index }) => (
                  <button
                    key={`${card.id}-${index}`}
                    type="button"
                    className="brass-btn"
                    data-testid={`revive-pick-${index}`}
                    onClick={() => invokeLeader(inputSide, undefined, undefined, { discardIndex: index })}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <button type="button" className="dev-link" onClick={() => setLeaderChoice(null)}>
            Cancel
          </button>
        </div>
      ) : selectedHint ? (
        <p className="move-banner" data-testid="move-banner">
          <strong>{selectedHint.name}</strong>
          <span className="move-banner-sep">·</span>
          {legalMoveDirs.length > 0 ? (
            <>
              Step to{' '}
              <span className="move-banner-dirs" data-testid="move-banner-dirs">
                {legalMoveDirs.map((dir) => (
                  <svg
                    key={dir}
                    className={`move-banner-chevron move-banner-${dir}`}
                    data-dir={dir}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      d="M12 4.2 L18.6 13.2 H15.2 V19.2 H8.8 V13.2 H5.4 Z"
                      fill="#9ec8ff"
                      stroke="#5a7aa8"
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
              </span>
            </>
          ) : (
            <span>No empty step</span>
          )}
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

      {domToast && (
        <div className="dom-toast" role="status" data-testid="dom-toast">
          <strong>{domToast}</strong>
        </div>
      )}
      <div className="bf-stage" style={{ position: 'relative' }}>
        <div
          className={`bf-board-socket${
            shake ? ` field-shake-${shake.key % 2 ? 'a' : 'b'}${shake.hard ? ' shake-hard' : ''}` : ''
          }`}
        >
          <img
            className="bf-board-socket-frame"
            src="/assets/images/bf_board_frame.png"
            alt=""
            aria-hidden
            draggable={false}
          />
          <div
            className={`board-wrap${gameMap.mood === 'bright' ? ' mood-bright' : ''}`}
            style={{
              backgroundImage: `url(/assets/maps/${gameMap.id}.jpg)`,
            }}
          >
          <div className="board-grid" role="grid" ref={boardGridRef}>
            {gameMap.tiles.map((row, r) =>
              row.map((tile, c) => {
                if (tile.kind === 'void') {
                  return <div key={`${r}-${c}`} className="tile-void" aria-hidden />;
                }
                const here = board[r][c];
                const owned = control[r][c];
                const claimKey = claimFlash?.split('|')[0];
                const claimLabel = claimFlash?.includes('|')
                  ? claimFlash.split('|')[1]
                  : null;
                const justClaimed = claimKey === `${r},${c}`;
                const key = `${r},${c}`;
                const deployOk = legalDeploy.has(key);
                const moveOk = legalMove.empty.has(key);
                const moveDir = legalMove.dirs.get(key);
                const strikeOk = legalStrike.has(key);
                const ghostOk = lapseGhost.has(key);
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
                    } ${owned ? `owned-${owned} held-${owned}` : ''} ${
                      deployOk ? 'legal-tile' : ''
                    } ${moveOk ? 'legal-move' : ''} ${
                      strikeOk ? 'legal-strike' : ''
                    } ${ghostOk ? 'lapse-ghost' : ''} ${isOrigin ? 'stone-origin' : ''} ${
                      dragHand != null && deployOk ? 'drag-target' : ''
                    } ${unit ? 'has-unit' : ''} ${
                      justClaimed ? 'just-claimed' : ''
                    }`.trim()}
                    data-tile-r={r}
                    data-tile-c={c}
                    onClick={(e) => {
                      onTileClick(r, c);
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
                  >
                    {ghostOk && <span className="lapse-ghost-light" aria-hidden />}
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
                    {tileLabel(tile) ? (
                      <span className="cell-label">{tileLabel(tile)}</span>
                    ) : null}
                    {justClaimed && claimLabel && (
                      <span className="claim-float" aria-hidden>
                        {claimLabel}
                      </span>
                    )}
                    {pips
                      .filter((p) => p.r === r && p.c === c && p.uid !== unit?.uid)
                      .map((p) => (
                        <span
                          key={p.id}
                          className={`dmg-float${p.text.startsWith('+') ? ' gain-float' : ''}`}
                          aria-hidden
                        >
                          {p.text.replace(/^-/, '\u2212')}
                        </span>
                      ))}
                    {bursts
                      .filter((b) => b.r === r && b.c === c)
                      .map((b) => (
                        <span key={b.id} className={`death-burst is-${b.side}`} aria-hidden>
                          <span className="death-half half-l">
                            <CardArt name={b.name} className="stone-face" />
                          </span>
                          <span className="death-half half-r">
                            <CardArt name={b.name} className="stone-face" />
                          </span>
                          <svg className="death-crack" viewBox="0 0 100 100">
                            <path d="M52 2 L46 22 L57 37 L43 54 L55 70 L48 98" />
                            <path d="M46 22 L30 30 M57 37 L74 31 M43 54 L26 63 M55 70 L72 79" />
                          </svg>
                          {EMBERS.map((e, i) => (
                            <span
                              key={i}
                              className="death-ember"
                              style={
                                {
                                  '--a': `${e.a}deg`,
                                  '--d': `${e.d}px`,
                                  '--t': `${e.t}s`,
                                  '--s': `${e.s}px`,
                                } as CSSProperties
                              }
                            />
                          ))}
                        </span>
                      ))}
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
                        canStep={
                          !inputLocked &&
                          phase === 'main' &&
                          unit.side === inputSide &&
                          !unit.sick &&
                          !(unit.arrest && unit.arrest > 0) &&
                          !unit.moved &&
                          !unit.attacked
                        }
                        sliding={
                          !!coinSlide &&
                          coinSlide.unit.uid === unit.uid &&
                          coinSlide.toR === r &&
                          coinSlide.toC === c
                        }
                        clash={
                          clash?.byUid[unit.uid]
                            ? {
                                key: clash.key,
                                dx: clash.byUid[unit.uid].dc * 18,
                                dy: clash.byUid[unit.uid].dr * 18,
                              }
                            : null
                        }
                        hits={pips
                          .filter((p) => p.uid === unit.uid)
                          .map((p) => ({ id: p.id, text: p.text }))}
                        onClick={() => onTileClick(r, c)}
                        onInspect={() => {
                          const def = cardById(unit.cardId);
                          if (def) {
                            setInspectPower(unit.power);
                            setInspectSticky(false);
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
          <WeatherLayer />
          </div>
        </div>
      </div>

      <ul className="board-key">
        <li>
          <i className="legend-mark legend-gate" aria-hidden /> Step a circle to
          conquer it · held circles score Domination each rite
        </li>
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
          <span className="key-coin key-loyalty">R</span> Resources (cost)
        </li>
        <li>
          <span className="key-coin key-power">P</span> Power (combat)
        </li>
      </ul>

      <div className="hand-rail">
        <p className="hand-kicker">
          <DeckPile count={deck[inputSide].length} />
          {sideLabel(inputSide)} hand · drag a unit up to muster · swipe to slide the hand · tap coins to move · Call power on the coin · rites & devices speak
          {friend && !friendSynced
            ? ' · syncing with host…'
            : friend && side !== mySide
              ? ` · waiting for ${sideLabel(side)}…`
              : !sharedTwoPlayer && side === AI_SIDE
                ? ' · Crimson is working…'
                : ''}
        </p>
        <HandScroller rowRef={handRowRef}>
          {activeHero && (
            <button
              type="button"
              className="hand-card kind-hero hand-leader"
              data-testid="hand-leader"
              onClick={() => readLeader(activeHero)}
              title={`${activeHero.name}. ${activeHero.text}`}
            >
              <CardArt name={activeHero.name} />
              <span className="hand-leader-tag">Leader</span>
              <span className="hand-card-name">{activeHero.name}</span>
            </button>
          )}
          {activeHand.map((card, i) => {
            const isUnit = card.kind === 'unit';
            const isSpell = card.kind === 'rite' || card.kind === 'device';
            const tooCostly = card.cost > loyalty[inputSide];
            return (
              <HandCard
                key={`${card.id}-${i}`}
                card={card}
                handIndex={i}
                foil={!!handFoil[i]}
                selected={selectedHand === i || dragHand === i}
                disabled={inputLocked || tooCostly}
                onClick={() => {
                  if (inputLocked) return;
                  if (isSpell) {
                    if (tooCostly) {
                      pushLog(`Not enough resources (need ${card.cost}).`);
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
                onInspect={() => { setInspectPower(undefined); setInspectSticky(false); setInspectCard(card); }}
                onDragDeployStart={
                  isUnit
                    ? (e) => startDragDeploy(i, e)
                    : undefined
                }
              />
            );
          })}
        </HandScroller>
      </div>

      <div className="bf-occultist-socket" data-testid="battle-occultist">
        <img
          className="bf-occultist-socket-frame"
          src="/assets/images/occultist_socket.png"
          alt=""
          aria-hidden
          draggable={false}
        />
        <div className="bf-occultist-bar">
          <label>
            Occultist
            <input
              className="ledger-input bf-occultist-input"
              value={codeDraft}
              maxLength={32}
              aria-label="Occultist code"
              placeholder="Speak a name…"
              onChange={(e) => onBattleCodeChange(e.target.value)}
            />
          </label>
          {codeToast && (
            <p className="bf-code-toast" role="status" data-testid="battle-code-toast">
              {codeToast}
            </p>
          )}
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
                softKnockSfx();
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
          {cryptidWhisper && (
            <p className="cryptid-whisper" data-testid="cryptid-whisper">
              {cryptidWhisper}
            </p>
          )}
        </div>
      )}

      <MushroomCloud active={nukeActive} onDone={finishGadget} />
      <FalloutRain
        active={falloutActive}
        durationMs={6000}
        onDone={() => {
          setFalloutActive(false);
          if (profile && onUpdateProfile) {
            onUpdateProfile(applyNukeAftermathUnlocks(profile));
          }
          const rad = cardById('radiation_poisoning');
          if (rad) setRadiationPop(rad);
          else {
            const winter = cardById('nuclear_winter');
            if (winter) setWinterPop(winter);
          }
        }}
      />

      {battleCountOpen && (
        <BattleCountModal onClose={() => setBattleCountOpen(false)} />
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

      {radiationPop && (
        <TarotPop
          card={radiationPop}
          caption="The ash settles — Radiation Poisoning"
          closeOnBackdrop={false}
          onClose={() => {
            setRadiationPop(null);
            const winter = cardById('nuclear_winter');
            if (winter) setWinterPop(winter);
          }}
        />
      )}

      {winterPop && (
        <TarotPop
          card={winterPop}
          caption="The sun fails — Nuclear Winter"
          closeOnBackdrop={false}
          onClose={() => setWinterPop(null)}
        />
      )}

      {inspectCard && (
        <TarotPop
          key={inspectCard.id}
          card={inspectCard}
          power={inspectPower}
          whisper={!inspectSticky}
          closeOnBackdrop={!inspectSticky}
          onClose={() => {
            setInspectCard(null);
            setInspectPower(undefined);
            setInspectSticky(false);
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
            const resume = revealResumeRef.current;
            revealResumeRef.current = null;
            resume?.();
          }}
          caption="Crimson musters — tap when you've read it"
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
            {fortune && fortune.gain > 0 && (
              <FortuneReveal gain={fortune.gain} total={fortune.total} won={fortune.won} />
            )}
            {fortune?.hint && (
              <p className="match-hint" data-testid="match-hint">
                {fortune.hint}
              </p>
            )}
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
              <HighlightButton
                get={() => ({
                  grid: boardGridRef.current,
                  board,
                  control,
                  mapId: gameMap.id,
                  mapName: gameMap.name,
                  era: eraRef.current,
                  turn,
                  winner: matchOver.winner,
                  winnerLeader: matchOver.winner === 'blue' ? blueHero : redHero,
                  winnerFaction: matchOver.winner === 'blue' ? blueFaction : redFaction,
                  won: hotseat || matchOver.winner === (friend ? mySide : PLAYER),
                  kind: matchOver.kind,
                  domination,
                  player: profile?.username || undefined,
                  title: profile?.title,
                })}
              />
            </div>
            <SeatInvite onTakeSeat={onTakeSeat} offer={mode !== 'campaign'} />
          </div>
        </div>
      )}

      {/* A code reveal (sticky inspect) takes the table; the primer waits behind it. */}
      {showPrimer && mode === 'training' && !(inspectSticky && inspectCard) && (
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
