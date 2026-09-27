import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { cardById, isExcludedPlateId } from '../data/catalog';
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
  actNeedsAim,
  applyPendingFieldPoison,
  effectNeedsAim,
  leaderNeedsAim,
  resolveActivatedAbility,
  resolveEffect,
  resolveLeaderPower,
  type EffectCtx,
  type EffectUnit,
} from '../game/effects';
import { canBeStruck, crownBonus, hasKeyword, manhattan } from '../game/keywords';
import { MAPS, mapById, tileLabel, tileLogName, type Side } from '../game/maps';
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
import { clashSfx, gunshotSfx, defeatStinger, victoryStinger, brassClick, setMusicBed, unlockAudio, sirenSfx, metalRiffSfx, nukeBoomSfx, nukemVoiceSfx, copSirenSfx } from '../game/sfx';
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
  /** Friend Working seat — host=Azure, guest=Crimson. */
  friendRole?: FriendRole;
  friendSession?: FriendSession;
  profile?: Profile;
  onUpdateProfile?: (next: Profile) => void;
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
  | { kind: 'cast'; handIndex: number; card: Card }
  | { kind: 'leader' }
  | { kind: 'act'; uid: string };

function deckFor(
  faction: string,
  ids?: string[],
): Card[] {
  // Cryptids / nuke aftermath / secret hand-drops never shuffle into workings.
  const stripNonPlates = (cards: Card[]) =>
    cards.filter(
      (c) => !c.keywords.includes('cryptid') && !isExcludedPlateId(c.id),
    );
  if (ids && ids.length >= 30) {
    const cleaned = stripNonPlates(cardsFromIds(ids));
    if (cleaned.length >= 30) return shuffleInPlace(cleaned);
  }
  try {
    return stripNonPlates(buildShuffledOrderWorking(faction));
  } catch {
    return stripNonPlates(buildShuffledWorking(faction));
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
  friendRole,
  friendSession,
  profile,
  onUpdateProfile,
  onLeave,
  onMatchEnd,
}: BattlefieldProps = {}) {
  const [mapId, setMapId] = useState(initialMapId);
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
  const isFriendGuest = friend && friendRole === 'guest';
  const isFriendHost = friend && friendRole === 'host';
  /** Guest waits until first host state arrives. */
  const [friendSynced, setFriendSynced] = useState(!friend || friendRole === 'host');

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
  const [claimFlash, setClaimFlash] = useState<string | null>(null);
  const [domToast, setDomToast] = useState<string | null>(null);
  const claimFlashTimer = useRef<number | null>(null);
  const domToastTimer = useRef<number | null>(null);
  const slideTimerRef = useRef<number | null>(null);
  const [inspectCard, setInspectCard] = useState<Card | null>(null);
  /** Code unlocks (South Haven): Close/Esc only — no backdrop dismiss. */
  const [inspectSticky, setInspectSticky] = useState(false);
  const [inspectPower, setInspectPower] = useState<number | undefined>(undefined);
  /** Hand index being dragged to muster (units only). */
  const [dragHand, setDragHand] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragHandRef = useRef<number | null>(null);
  const [cryptidSight, setCryptidSight] = useState<string | null>(null);
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
  const fieldStatusRef = useRef({ fieldPoisonDamage: 0, noBankOpens: 0 });
  fieldStatusRef.current = { fieldPoisonDamage, noBankOpens };
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
          const prevSide: Side = nextSide === 'blue' ? 'red' : 'blue';
          let arrest = u.arrest ?? 0;
          if (u.side === prevSide && arrest > 0) arrest -= 1;
          const next = {
            ...u,
            moved: false,
            attacked: false,
            powder: false,
            used: false,
            arrest,
          };
          if (u.powder) {
            // was locked by foe — stays sick one rite then clears
            next.sick = false;
          }
          return next;
        }),
      );
      let working = cleared;

      // Lingering field poison resolves once at the start of the next turn.
      const pendingPoison = fieldStatusRef.current.fieldPoisonDamage;
      if (pendingPoison > 0) {
        const poisonCtx: EffectCtx = {
          side: nextSide,
          loyalty: { ...liveRef.current.loyalty },
          domination: { ...liveRef.current.domination },
          hand: {
            blue: [...liveRef.current.hand.blue],
            red: [...liveRef.current.hand.red],
          },
          deck: {
            blue: [...liveRef.current.deck.blue],
            red: [...liveRef.current.deck.red],
          },
          discard: {
            blue: [...liveRef.current.discard.blue],
            red: [...liveRef.current.discard.red],
          },
          units: {},
          board: Array.from({ length: 5 }, () => Array(5).fill(null)),
          control: liveRef.current.control.map((row) => [...row]),
          log: [],
        };
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            const u = working[r][c];
            if (!u) continue;
            poisonCtx.board[r][c] = u.uid;
            poisonCtx.units[u.uid] = {
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
            };
          }
        }
        applyPendingFieldPoison(poisonCtx, pendingPoison);
        working = working.map((row) =>
          row.map((u) => {
            if (!u) return null;
            const pu = poisonCtx.units[u.uid];
            if (!pu) return null; // destroyed
            return { ...u, power: pu.power, maxPower: pu.maxPower };
          }),
        );
        poisonCtx.log.forEach((line) => pushLog(line));
        setFieldPoisonDamage(0);
        fieldStatusRef.current.fieldPoisonDamage = 0;
      }

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
          setCryptidSight(names[0]);
          setTimeout(() => setCryptidSight(null), 2400);
        }
      }

      return { nextDeck, nextHand, cleared };
    },
    [bankUnits, pushLog, blueFaction, redFaction, mode],
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
      let h = { blue: blueDraw.hand, red: redDraw.hand };
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
      onMatchEnd?.({ winner, kind, playerWon });
    },
    [pushLog, onMatchEnd, hotseat, friend, sharedTwoPlayer, side, mySide, PLAYER],
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
      };
    },
    [
      board,
      loyalty,
      domination,
      hand,
      deck,
      discard,
      control,
      fieldPoisonDamage,
      noBankOpens,
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
      if (isFriendGuest && friendSession) {
        const card = hand[acting][handIndex];
        if (!card || (card.kind !== 'rite' && card.kind !== 'device')) return false;
        if (effectNeedsAim(card.effect, card.aim) && !targetUid && !aimPos) {
          setAim({ kind: 'cast', handIndex, card });
          pushLog(`Name a target for ${card.name}.`);
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
        pushLog(`Name a target for ${card.name}.`);
        return false;
      }
      const ctx = buildEffectCtx(acting);
      ctx.loyalty[acting] -= card.cost;
      const err = resolveEffect(
        ctx,
        card.effect,
        {
          id: card.id,
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
      if (card.id === 'south_haven_dispatch') copSirenSfx();
      else if (hasKeyword(card, 'gas')) sirenSfx();
      else brassClick();
      return true;
    },
    [hand, loyalty, buildEffectCtx, applyEffectCtx, pushLog],
  );

  const useLeader = useCallback(
    (acting: Side, targetUid?: string, aimPos?: Pos): boolean => {
      if (isFriendGuest && friendSession) {
        const hero = acting === 'blue' ? blueHero : redHero;
        if (!hero) {
          pushLog('No leader sworn for this chair.');
          return false;
        }
        if (leaderNeedsAim(hero) && !targetUid && !(hero.leaderPower?.op === 'claim' && aimPos)) {
          setAim({ kind: 'leader' });
          pushLog(`Name a target for ${hero.name}.`);
          return false;
        }
        friendSession.send({
          v: 1,
          type: 'intent',
          intent: { kind: 'useLeader', targetUid, aimPos },
        });
        setAim(null);
        return true;
      }
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
        setAim(null);
        setSelectedUnit(null);
        setAttacker(null);
        brassClick();
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
      brassClick();
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


  function dropJustinIntoHand(seat: Side): string {
    const jk = cardById('justin_kern');
    if (!jk) return 'Justin Kern is missing from the catalogue.';
    const cur = liveRef.current.hand[seat];
    if (cur.length >= HAND_CAP) {
      return "The hand is sealed — Justin Kern cannot enter.";
    }
    const nextHand = { ...liveRef.current.hand, [seat]: [...cur, jk] };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (profile && onUpdateProfile) {
      onUpdateProfile(applyJustinKernUnlock(profile));
    }
    return 'Justin Kern answers — the gadget is in hand.';
  }

  function dropSethIntoHand(seat: Side): string {
    const sk = cardById('seth_kern');
    if (!sk) return 'Seth Kern is missing from the catalogue.';
    const cur = liveRef.current.hand[seat];
    if (cur.length >= HAND_CAP) {
      return "The hand is sealed — Seth Kern cannot enter.";
    }
    const nextHand = { ...liveRef.current.hand, [seat]: [...cur, sk] };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (profile && onUpdateProfile) {
      // Unlock requires username === 'seth kern'; preserve display name after.
      const unlocked = applySethKernUnlock({ ...profile, username: 'seth kern' });
      onUpdateProfile({ ...unlocked, username: profile.username });
    }
    return 'Seth Kern answers — the chief is in hand.';
  }

  function dropSouthHavenIntoHand(seat: Side): string {
    const sh = cardById('south_haven_dispatch');
    if (!sh) return 'South Haven Dispatch is missing from the catalogue.';
    const cur = liveRef.current.hand[seat];
    if (cur.length >= HAND_CAP) {
      return 'The hand is sealed — South Haven Dispatch cannot enter.';
    }
    const nextHand = { ...liveRef.current.hand, [seat]: [...cur, sh] };
    setHand(nextHand);
    liveRef.current = { ...liveRef.current, hand: nextHand };
    if (profile && onUpdateProfile) {
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
    setCryptidSight(names[0]);
    setTimeout(() => setCryptidSight(null), 2400);
    return `Sighting: ${names.join(', ')}.`;
  }

  function onBattleCodeChange(raw: string) {
    const next = raw.slice(0, 32);
    setCodeDraft(next);
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
        setInspectSticky(false);
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
        setInspectSticky(false);
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
    if (isHiddenAdeptCode(next) && profile && onUpdateProfile) {
      const beforeJk = profile.collection.includes('justin_kern');
      const unlocked = applyJustinKernUnlock({ ...profile, username: next });
      onUpdateProfile(unlocked);
      setCodeToast('A hidden adept has answered.');
      if (!beforeJk && unlocked.collection.includes('justin_kern')) {
        const jk = cardById('justin_kern');
        if (jk) {
          setInspectPower(undefined);
          setInspectSticky(false);
          setInspectCard(jk);
        }
      }
    }
  }

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
      if (!canDeployOn(gameMap.tiles[r][c], control, r, c, acting)) {
        pushLog('Deploy onto your stronghold or a gate you hold.');
        return false;
      }
      if (loyalty[acting] < card.cost) {
        pushLog(`Not enough resources (need ${card.cost}).`);
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
        liveRef.current = { ...liveRef.current, board: next };
        return next;
      });
      setLoyalty((L) => {
        const next = { ...L, [acting]: L[acting] - card.cost };
        liveRef.current = { ...liveRef.current, loyalty: next };
        return next;
      });
      setHand((H) => {
        const next = {
          ...H,
          [acting]: H[acting].filter((_, i) => i !== handIndex),
        };
        liveRef.current = { ...liveRef.current, hand: next };
        return next;
      });
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

  const flashClaim = useCallback((r: number, c: number, label: string) => {
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

      const prevOwner = control[r][c];
      const veiled = hasKeyword(atk.unit, 'veiled');
      kickCoinSlide(atk.unit, atk.r, atk.c, r, c);
      setBoard((b) => {
        const next = b.map((row) => [...row]);
        next[atk.r][atk.c] = null;
        next[r][c] = { ...atk.unit, moved: true };
        liveRef.current = { ...liveRef.current, board: next };
        return next;
      });
      if (veiled) {
        pushLog(`${atk.unit.name} advances without claiming (veiled).`);
      } else if (isPaintable(tile)) {
        setControl((C) => {
          const next = paintTile(C, gameMap.tiles, r, c, atk.unit.side);
          liveRef.current = { ...liveRef.current, control: next };
          return next;
        });
        if (prevOwner !== atk.unit.side) {
          const label = tileLogName(tile);
          pushLog(`${atk.unit.name} conquers the ${label}.`);
          flashClaim(r, c, 'Conquered');
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
          fast: atk.unit.fast,
        });
        const resultDef = combatantFrom({
          id: here.uid,
          name: here.name,
          power: here.power,
          keywords: here.keywords,
          tough: here.tough,
          fast: here.fast,
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
          else {
            const wounded = resultDef.power < here.power;
            next[defR][defC] = {
              ...here,
              power: resultDef.power,
              ...(wounded && hasKeyword(atk.unit, 'arrest') ? { arrest: 2 } : {}),
            };
            if (wounded && hasKeyword(atk.unit, 'arrest')) {
              pushLog(`${here.name} is arrested and cannot move for two turns.`);
            }
          }
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
          fast: atk.unit.fast,
        }),
        combatantFrom({
          id: here.uid,
          name: here.name,
          power: here.power,
          keywords: here.keywords,
          tough: here.tough,
          fast: here.fast,
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
        else {
          const wounded = result.defender.power < here.power;
          next[defR][defC] = {
            ...here,
            power: result.defender.power,
            ...(wounded && hasKeyword(atk.unit, 'arrest') ? { arrest: 2 } : {}),
          };
        }
        return next;
      });
      result.log.forEach((line) => pushLog(line));
      if (
        !result.defenderDestroyed &&
        result.defender.power < here.power &&
        hasKeyword(atk.unit, 'arrest')
      ) {
        pushLog(`${here.name} is arrested and cannot move for two turns.`);
      }
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
    if (isFriendGuest && friendSession) {
      friendSession.send({ v: 1, type: 'intent', intent: { kind: 'endRite' } });
      return;
    }
    const live = liveRef.current;
    if (live.phase === 'over' || live.matchOver) return;
    brassClick();
    const acting = live.side;
    const holdings = countHoldings(live.gameMap.tiles, live.control, acting);
    const scored = live.domination[acting] + holdings;
    const nextDom = { ...live.domination, [acting]: scored };
    setDomination(nextDom);
    liveRef.current = { ...liveRef.current, domination: nextDom };
    pushLog(
      `${sideLabel(acting)} holds ${holdings} circles (+${holdings} Domination → ${scored}/${DOMINATION_WIN}).`,
    );
    if (domToastTimer.current != null) window.clearTimeout(domToastTimer.current);
    setDomToast(
      `${sideLabel(acting)} · +${holdings} Domination · ${scored}/${DOMINATION_WIN}`,
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

  const useLeaderRef = useRef(useLeader);
  useLeaderRef.current = useLeader;

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
    if (st.cryptidSight != null) setCryptidSight(st.cryptidSight);
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
  }, [mapId]);

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
            useLeaderRef.current(acting, intent.targetUid, intent.aimPos);
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

    if (isFriendGuest) {
      friendSession.send({
        v: 1,
        type: 'hello',
        role: 'guest',
        room: friendSession.room,
      });
    } else if (isFriendHost) {
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

    const run = () => {
      if (cancelled) return;
      steps += 1;
      if (steps > 14) {
        setAiBusy(false);
        clearRevealTimer();
        revealResumeRef.current = null;
        setRevealCard(null);
        endRiteRef.current();
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
        const ok = castCardRef.current(AI_SIDE, castIdx);
        later(run, ok ? 420 : 80);
        return;
      }

      if (action.type === 'act') {
        const src = findUnitRef.current(action.uid);
        const card = src ? cardById(src.unit.cardId) : undefined;
        const ok = callPowerRef.current(
          AI_SIDE,
          action.uid,
          action.targetUid,
        );
        if (ok) {
          if (card) {
            showAiReveal(card, () => later(run, 320));
          } else {
            later(run, 420);
          }
          return;
        }
        later(run, 120);
        return;
      }

      if (action.type === 'deploy') {
        const card = live.hand.red[action.index];
        if (card?.kind === 'unit') {
          const ok = deployToRef.current(action.r, action.c, action.index, AI_SIDE);
          if (ok) {
            showAiReveal(card, () => later(run, 320));
            return;
          }
        }
        // Deploy failed (stale or illegal) — do not reflash; try again next tick once.
        later(run, 120);
        return;
      }
      if (action.type === 'move') {
        const res = moveUnitRef.current(action.uid, action.r, action.c);
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
        const def = findUnitRef.current(action.targetUid);
        if (def) {
          const ok = strikeRef.current(action.uid, def.r, def.c);
          later(run, ok ? 500 : 120);
          return;
        }
        later(run, 120);
        return;
      }
      // end — call latest endRite so openRiteFor keeps AI-deployed coins
      setAiBusy(false);
      clearRevealTimer();
      revealResumeRef.current = null;
      setRevealCard(null);
      endRiteRef.current();
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
  }, [side, phase, matchOver, sharedTwoPlayer]);

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
  const activeHero = inputSide === 'blue' ? blueHero : redHero;

  return (
    <section className={`battlefield${nukeActive ? ' nuke-shake' : ''}`} data-testid="battlefield" data-mode={mode} data-phase={phase}>
      <header className="bf-hud">
        <div className="bf-scores" aria-label="Resources and Domination">
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
            <dt>Crimson · {redFaction.split(' ').slice(-1)[0]}</dt>
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
              {leaderUsed[inputSide] ? ' · spent' : ` · R${activeHero.cost}`}
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
          Aiming{' '}
          {aim.kind === 'cast'
            ? aim.card.name
            : aim.kind === 'act'
              ? cardById(findUnit(aim.uid)?.unit.cardId ?? '')?.name ?? 'power'
              : activeHero?.name}{' '}
          — name a target on the field.{' '}
          <button type="button" className="dev-link" onClick={() => setAim(null)}>
            Cancel
          </button>
        </p>
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
        <div className="bf-board-socket">
          <img
            className="bf-board-socket-frame"
            src="/assets/images/bf_board_frame.png"
            alt=""
            aria-hidden
            draggable={false}
          />
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
                    } ${isOrigin ? 'stone-origin' : ''} ${
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
          {sideLabel(inputSide)} hand · drag units to muster · tap coins to move · Call power on the coin · rites & devices speak
          {friend && !friendSynced
            ? ' · syncing with host…'
            : friend && side !== mySide
              ? ` · waiting for ${sideLabel(side)}…`
              : !sharedTwoPlayer && side === AI_SIDE
                ? ' · Crimson is working…'
                : ''}
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
        </div>
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
          card={inspectCard}
          power={inspectPower}
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
