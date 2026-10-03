import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Battlefield, type MatchMode } from './components/Battlefield';
import { CombatDemo } from './components/CombatDemo';
import { CardPeekLayer } from './components/CardPeek';
import { Catalog } from './components/Catalog';
import { TitleScreen } from './components/TitleScreen';
import { MenuAtelier } from './components/MenuAtelier';
import { AllegianceScreen } from './components/AllegianceScreen';
import { DeckEditor } from './components/DeckEditor';
import { PackBreak } from './components/PackBreak';
import { CampaignHour } from './components/CampaignHour';
import { FriendWorking } from './components/FriendWorking';
import { Ledger } from './components/Ledger';
import { Meeting } from './components/Meeting';
import {
  TABLE_CHALLENGE_EVENT,
  setActivity,
  setTableState,
  type TableChallengeDetail,
} from './net/table';
import { recordMatch } from './net/account';
import type { FriendRole, FriendSession } from './net/friendSession';
import {
  resolveFriendMatchLoadouts,
  type FriendLoadout,
  type LoadoutWho,
} from './net/friendLoadout';
import { SecondHour } from './components/SecondHour';
import { SealedCentury } from './components/SealedCentury';
import { NightCounter } from './components/NightCounter';
import { useProfile } from './hooks/useProfile';
import {
  applyBlackMondayLossInject,
  awardShards,
  deleteEraDeck,
  recordMatchTally,
  withDaily,
  saveEraDeck,
  sealedCenturyLoadout,
  swearAllegiance,
  type CustomDeck,
  type DeckEra,
} from './game/profile';
import { cardById } from './data/catalog';
import { TarotPop } from './components/TarotPop';
import type { Card } from './game/types';
import {
  FIRST_HOUR_ORDERS,
  SECOND_HOUR_RIVALS,
  allyOf,
  isFirstHourOrder,
  type FirstHourOrder,
} from './game/orders';
import { buildOrderAllyWorkingIds } from './game/deck';
import { CARDS } from './data/catalog';
import { levelFromXp } from './game/dailyRites';
import { readHourOpen } from './game/hourUnlock';
import type { StageOutcome } from './game/campaign';
import { isMainGameMap } from './game/maps';
import { AI_DIFFICULTY_KEY, readAiDifficulty, type AiDifficulty } from './game/ai';
import { ACH_EVENT, noteMatch, noteSecret, noteSighting, settleHonours, type AchNoteDetail } from './game/achievements';
import { noteEncounters } from './game/codexUnlock';
import { Honours, TitlePicker } from './components/Honours';
import { SettingsPanel } from './components/SettingsPanel';
import { WardrobePanel } from './components/Wardrobe';
import { toastHonours, toastNotice } from './components/HonourToast';
import { Ladder, RankBadge } from './components/Ladder';
import { beginRanked, newSittingNonce, refreshMyRank, reportRanked, useMyRank } from './net/ranked';
import { readSeatState } from './net/account';
import './App.css';
import './polish.css';

import { LoadingLoreVeil } from './components/LoadingLore';
import { applyFoeCoin, applyWardrobe, wornCoin } from './game/wardrobe';
const Codex = lazy(() => import('./components/Codex').then((m) => ({ default: m.Codex })));

type Screen =
  | 'title'
  | 'menu'
  | 'allegiance'
  | 'field'
  | 'archive'
  | 'deck'
  | 'pack'
  | 'campaign'
  | 'friend'
  | 'second'
  | 'old'
  | 'shop'
  | 'ledger'
  | 'meeting'
  | 'sandbox'
  | 'codex'
  | 'honours'
  | 'ladder';

/** Pick a rival order for training (not self / not ally preferred). */
function trainingFoe(order: string | null): string {
  if (!order) return 'Order of the Lead Dawn';
  const pool = FIRST_HOUR_ORDERS.filter(
    (o) => o !== order && o !== allyOf(order),
  );
  return pool[Math.floor(Math.random() * pool.length)] ?? 'Order of the Lead Dawn';
}

export default function App() {
  const { profile, update, dailyGranted, clearDailyNotice } = useProfile();
  const [screen, setScreen] = useState<Screen>('title');
  /** Deck editor: the hour tab it opens on, and the screen its Return leads back to. */
  const [deckEra, setDeckEra] = useState<DeckEra | undefined>();
  const [deckReturn, setDeckReturn] = useState<Screen>('menu');
  const [mapId, setMapId] = useState('ashen-cross');
  const [matchMode, setMatchMode] = useState<MatchMode>('training');
  const [aiDifficulty, setAiDifficultyState] = useState<AiDifficulty>(() => {
    try {
      return readAiDifficulty(window.localStorage.getItem(AI_DIFFICULTY_KEY));
    } catch {
      return 'expert';
    }
  });
  const setAiDifficulty = (next: AiDifficulty) => {
    setAiDifficultyState(next);
    try {
      window.localStorage.setItem(AI_DIFFICULTY_KEY, next);
    } catch {
      /* private mode — keep it for this visit */
    }
  };
  const [blueFaction, setBlueFaction] = useState('The Vril Syndicate');
  const [redFaction, setRedFaction] = useState('The Hermetic Circle');
  const [blueHeroId, setBlueHeroId] = useState<string | undefined>();
  const [redHeroId, setRedHeroId] = useState<string | undefined>();
  const [blueDeckIds, setBlueDeckIds] = useState<string[] | undefined>();
  const [redDeckIds, setRedDeckIds] = useState<string[] | undefined>();
  const [campaignOutcome, setCampaignOutcome] = useState<{
    stageIndex: number;
    outcome: StageOutcome;
  } | null>(null);
  const [campaignStage, setCampaignStage] = useState(0);
  /** The Ledger opened by a "Take a seat" invitation: straight to the sign-up form. */
  const [ledgerSeat, setLedgerSeat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const myRank = useMyRank();
  /** Ranked: this table's sitting nonce (the host's) and how many sittings have finished. */
  const [sittingNonce, setSittingNonce] = useState(newSittingNonce);
  const rankedRef = useRef<{ nonce: string; sitting: number } | null>(null);
  const reportLadder = (won: boolean) => {
    const r = rankedRef.current;
    if (!r || !readSeatState().seat) return;
    const sitting = r.sitting;
    r.sitting += 1;
    const before = myRank?.pts ?? null;
    const announceRank = (row: Awaited<ReturnType<typeof refreshMyRank>>) => {
      if (!row || before === null || row.pts === before) return;
      const d = row.pts - before;
      toastNotice('The Ladder', `${d > 0 ? '+' : ''}${d} · ${row.rank}`, `${row.pts} points this season`);
    };
    reportRanked(r.nonce, sitting, won)
      .then((res) => {
        if (res.settled) void refreshMyRank().then(announceRank);
        else if (res.waiting) window.setTimeout(() => void refreshMyRank().then(announceRank), 6000);
      })
      .catch(() => undefined);
  };

  // Honours: sightings, secrets and plates met on the field arrive as events.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<AchNoteDetail>).detail;
      if (!d) return;
      if (d.kind === 'sighting') update((p) => noteSighting(p, d.name));
      else if (d.kind === 'secret') update((p) => noteSecret(p, d.id));
      else if (d.kind === 'encounter') {
        update((p) => {
          let next = noteEncounters(p, d.ids);
          for (const id of ['justin_kern', 'seth_kern', 'south_haven_dispatch']) {
            if (d.ids.includes(id)) next = noteSecret(next, id);
          }
          return settleHonours(next);
        });
      }
    };
    window.addEventListener(ACH_EVENT, on);
    return () => window.removeEventListener(ACH_EVENT, on);
  }, [update]);
  // Anything met straight off the profile (level, collection, foils, codes) earns at once.
  useEffect(() => {
    if (settleHonours(profile) !== profile) update((p) => settleHonours(p));
  }, [profile, update]);
  // A toast for honours earned just now (not ones arriving with a cloud copy).
  const toastedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const got = profile.ach?.got ?? {};
    if (!toastedRef.current) {
      toastedRef.current = new Set(Object.keys(got));
      const fresh = Object.keys(got).filter((id) => Date.now() - got[id] < 60_000);
      if (fresh.length) toastHonours(fresh);
      return;
    }
    const seen = toastedRef.current;
    const fresh = Object.keys(got).filter((id) => !seen.has(id));
    for (const id of fresh) seen.add(id);
    const now = fresh.filter((id) => Date.now() - got[id] < 60_000);
    if (now.length) toastHonours(now);
  }, [profile.ach]);
  const [friendRole, setFriendRole] = useState<FriendRole | null>(null);
  const [friendSession, setFriendSession] = useState<FriendSession | null>(null);
  /** The other chair's name, title and rank (Friend Working). */
  const [friendFoe, setFriendFoe] = useState<LoadoutWho | null>(null);
  const [blackMondayReveal, setBlackMondayReveal] = useState<Card | null>(null);
  /** A table challenge waiting for Friend Working (issued = host, answered = guest). */
  const [tableChallenge, setTableChallenge] = useState<{
    role: FriendRole;
    room: string;
  } | null>(null);

  // Wardrobe: the chosen card back and coin skin paint the page; the other chair's coin in a friend match.
  useEffect(() => {
    applyWardrobe(profile);
  }, [profile]);
  useEffect(() => {
    applyFoeCoin(screen === 'field' && matchMode === 'friend' ? friendFoe?.coin : undefined);
  }, [screen, matchMode, friendFoe]);

  // What this hand is doing, for the owner's roll (and the safe-reload check).
  useEffect(() => {
    setActivity({
      where: screen,
      mode: screen === 'field' ? matchMode : undefined,
      name: profile.username,
      level: levelFromXp(profile.xp).level,
    });
  }, [screen, matchMode, profile.username, profile.xp]);

  // The Day's Rites turn over at local midnight: fresh rites whenever the menu opens on a new day.
  useEffect(() => {
    if (screen !== 'menu') return;
    if (withDaily(profile) !== profile) update((p) => withDaily(p));
  }, [screen, profile, update]);

  // Seated in a two-hand match: no knocks at the table.
  useEffect(() => {
    setTableState(
      screen === 'field' && (matchMode === 'friend' || matchMode === 'hotseat') ? 'live' : 'open',
    );
  }, [screen, matchMode]);

  // <PlayingNow /> (mounted beside the app) asks to issue / answer / call off.
  const onChallenge = useRef<(d: TableChallengeDetail) => void>(() => undefined);
  useEffect(() => {
    onChallenge.current = (d) => {
      if (d.action === 'cancel') {
        setTableChallenge(null);
        if (screen === 'friend') setScreen('menu');
        return;
      }
      if (!/^[A-Z]{4}$/.test(d.room)) return;
      setTableChallenge({ role: d.action === 'accept' ? 'guest' : 'host', room: d.room });
      ensureSworn(() => setScreen('friend'));
    };
  });
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TableChallengeDetail>).detail;
      if (d) onChallenge.current(d);
    };
    window.addEventListener(TABLE_CHALLENGE_EVENT, on);
    return () => window.removeEventListener(TABLE_CHALLENGE_EVENT, on);
  }, []);

  const working = profile.customDecks[0] as CustomDeck | undefined;

  const shellTitle = useMemo(() => {
    switch (screen) {
      case 'field':
        if (matchMode === 'campaign') return 'The Leaden Hour';
        if (matchMode === 'hotseat') return 'Pass the Grimoire';
        if (matchMode === 'friend') {
          const bits = [friendFoe?.name, friendFoe?.title, friendFoe?.rank].filter(Boolean);
          return bits.length ? `Friend Working · vs ${bits.join(' · ')}` : 'Friend Working';
        }
        if (matchMode === 'second') return 'The Hour After';
        if (matchMode === 'old') return 'The Sealed Century';
        return 'Training Rite';
      case 'archive':
        return 'The Collection';
      case 'deck':
        return 'Deck Editor';
      case 'pack':
        return 'Break a Seal';
      case 'campaign':
        return 'The Leaden Hour';
      case 'friend':
        return 'Friend Working';
      case 'second':
        return 'The Hour After';
      case 'old':
        return 'The Sealed Century';
      case 'shop':
        return 'Night Counter';
      case 'allegiance':
        return 'Swear an Order';
      case 'sandbox':
        return 'Rites desk';
      case 'ledger':
        return 'The Ledger';
      case 'meeting':
        return 'The Occultist Meeting';
      default:
        return 'Atelier';
    }
  }, [screen, matchMode, friendFoe]);

  function firstHourAllegiance(): FirstHourOrder | null {
    const a = profile.allegiance;
    if (a && isFirstHourOrder(a)) return a;
    return null;
  }

  function ensureSworn(next: () => void) {
    if (!firstHourAllegiance()) {
      if (profile.allegiance) {
        // Second-hour (or unknown) society stuck as primary — force re-swear.
        update({ ...profile, allegiance: null });
      }
      setScreen('allegiance');
      return;
    }
    next();
  }

  function startTraining() {
    ensureSworn(() => {
      const order = firstHourAllegiance()!;
      const foe = trainingFoe(order);
      setBlueFaction(order);
      setRedFaction(foe);
      setBlueHeroId(working?.heroId);
      setBlueDeckIds(working?.cards);
      setRedHeroId(undefined);
      setRedDeckIds(undefined);
      setMatchMode('training');
      setMapId((prev) => (isMainGameMap(prev) ? prev : 'ashen-cross'));
      setScreen('field');
    });
  }

  function startHotseat() {
    ensureSworn(() => {
      const order = firstHourAllegiance()!;
      const foe = trainingFoe(order);
      setBlueFaction(order);
      setRedFaction(foe);
      setBlueHeroId(working?.heroId);
      setBlueDeckIds(working?.cards);
      setRedHeroId(undefined);
      setRedDeckIds(undefined);
      setMatchMode('hotseat');
      setMapId((prev) => (isMainGameMap(prev) ? prev : 'ashen-cross'));
      setScreen('field');
    });
  }

  function startFriend(
    _room: string,
    role: FriendRole,
    session: FriendSession,
    hostLoadout: FriendLoadout,
    guestLoadout: FriendLoadout,
  ) {
    ensureSworn(() => {
      const order = firstHourAllegiance()!;
      // Host = Azure, guest = Crimson. Both browsers use the exchanged loadouts.
      // Prefer host loadout faction; only the host may fall back to local allegiance.
      const hostFallback =
        hostLoadout.faction ||
        (role === 'host' ? order : 'The Vril Syndicate');
      const resolved = resolveFriendMatchLoadouts(
        hostLoadout,
        guestLoadout,
        hostFallback,
      );
      setBlueFaction(resolved.blueFaction);
      setRedFaction(resolved.redFaction);
      setBlueHeroId(resolved.blueHeroId);
      setBlueDeckIds(resolved.blueDeckIds);
      setRedHeroId(resolved.redHeroId);
      setRedDeckIds(resolved.redDeckIds);
      setFriendRole(role);
      setFriendSession(session);
      setFriendFoe((role === 'host' ? guestLoadout : hostLoadout).who ?? null);
      // Ranked: both chairs key the sitting by the host's nonce.
      const nonce = hostLoadout.who?.nonce;
      rankedRef.current = nonce ? { nonce, sitting: 0 } : null;
      if (nonce && readSeatState().seat) beginRanked(nonce);
      setSittingNonce(newSittingNonce());
      setMatchMode('friend');
      setMapId((prev) => (isMainGameMap(prev) ? prev : 'ashen-cross'));
      setScreen('field');
    });
  }

  if (screen === 'title') {
    return (
      <TitleScreen
        dailyGranted={dailyGranted}
        onEnter={() => {
          clearDailyNotice();
          if (!firstHourAllegiance()) {
            if (profile.allegiance) update({ ...profile, allegiance: null });
            setScreen('allegiance');
          } else setScreen('menu');
        }}
      />
    );
  }

  if (screen === 'allegiance') {
    return (
      <div className="app app-shell">
        <AllegianceScreen
          onSwear={(order: FirstHourOrder) => {
            update(swearAllegiance(profile, order));
            setScreen(tableChallenge ? 'friend' : 'menu');
          }}
          onBack={
            firstHourAllegiance()
              ? () => {
                  setTableChallenge(null);
                  setScreen('menu');
                }
              : undefined
          }
        />
      </div>
    );
  }

  if (screen === 'menu') {
    return (
      <>
      <MenuAtelier
        profile={profile}
        onUpdateProfile={update}
        selectedMapId={mapId}
        onSelectMap={setMapId}
        onTraining={startTraining}
        aiDifficulty={aiDifficulty}
        onAiDifficulty={setAiDifficulty}
        onCollection={() => setScreen('archive')}
        onDeckEditor={() =>
          ensureSworn(() => {
            setDeckEra(undefined);
            setDeckReturn('menu');
            setScreen('deck');
          })
        }
        onPack={() => ensureSworn(() => setScreen('pack'))}
        onLeaden={() => ensureSworn(() => setScreen('campaign'))}
        onHotseat={startHotseat}
        onFriend={() => {
          setTableChallenge(null);
          ensureSworn(() => setScreen('friend'));
        }}
        onLedger={() => {
          setLedgerSeat(false);
          setScreen('ledger');
        }}
        onTakeSeat={() => {
          setLedgerSeat(true);
          setScreen('ledger');
        }}
        onMeeting={() => setScreen('meeting')}
        onSecond={() => {
          if (readHourOpen()) setScreen('second');
        }}
        onShop={() => {
          // The Night Counter stays shut until the Second Hour is opened by its code.
          if (readHourOpen()) setScreen('shop');
        }}
        onOldWork={() => setScreen('old')}
        onAllegiance={() => setScreen('allegiance')}
        onSandbox={() => setScreen('sandbox')}
        onCodex={() => setScreen('codex')}
        onHonours={() => setScreen('honours')}
        onSettings={() => setSettingsOpen(true)}
        onLadder={() => setScreen('ladder')}
      />
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onWardrobe={() => {
            setSettingsOpen(false);
            setWardrobeOpen(true);
          }}
        />
      )}
      {wardrobeOpen && <WardrobePanel profile={profile} onUpdate={update} onClose={() => setWardrobeOpen(false)} />}
      </>
    );
  }

  if (screen === 'codex') {
    return (
      <div className="app app-shell">
        <Suspense fallback={<p className="ledger-wait">Opening the Codex…</p>}>
          <Codex profile={profile} onBack={() => setScreen('menu')} />
        </Suspense>
      </div>
    );
  }

  if (screen === 'ladder') {
    return (
      <div className="app app-shell">
        <Ladder onBack={() => setScreen('menu')} />
      </div>
    );
  }

  if (screen === 'honours') {
    return (
      <div className="app app-shell">
        <Honours profile={profile} onUpdate={update} onBack={() => setScreen('menu')} />
      </div>
    );
  }

  if (screen === 'campaign') {
    return (
      <div className="app app-shell">
        <nav className="shell-bar">
          <button
            type="button"
            className="brass-btn brass-btn-ghost shell-back"
            onClick={() => setScreen('menu')}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>The Leaden Hour</em>
          </p>
        </nav>
        <CampaignHour
          profile={profile}
          onUpdate={update}
          lastOutcome={campaignOutcome}
          onConsumeOutcome={() => setCampaignOutcome(null)}
          aiDifficulty={aiDifficulty}
          onAiDifficulty={setAiDifficulty}
          onPlayStage={(mid, foe, stageIndex) => {
            const order = firstHourAllegiance()!;
            setMapId(mid);
            setBlueFaction(order);
            setRedFaction(foe);
            setBlueHeroId(working?.heroId);
            setBlueDeckIds(working?.cards);
            setCampaignStage(stageIndex);
            setMatchMode('campaign');
            setScreen('field');
          }}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'friend') {
    return (
      <div className="app app-shell">
        <nav className="shell-bar">
          <button
            type="button"
            className="brass-btn brass-btn-ghost shell-back"
            onClick={() => {
              setTableChallenge(null);
              setScreen('menu');
            }}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>Friend Working</em>
          </p>
          <div id="playing-dock" className="playing-dock" />
        </nav>
        <p className="friend-rank" data-testid="friend-rank">
          {myRank ? (
            <>
              Ranked sittings count toward the Ladder · <RankBadge row={myRank} />
            </>
          ) : (
            <>Take a seat in the Ledger and your live sittings count toward the Ladder.</>
          )}
        </p>
        <FriendWorking
          key={tableChallenge ? `${tableChallenge.role}-${tableChallenge.room}` : 'friend'}
          customDecks={profile.customDecks}
          allegiance={firstHourAllegiance()}
          tableChallenge={tableChallenge}
          who={{ name: profile.username || undefined, title: profile.title, rank: myRank?.rank, nonce: sittingNonce, coin: wornCoin(profile) }}
          onReady={({ room, role, session, hostLoadout, guestLoadout }) => {
            setTableChallenge(null);
            startFriend(room, role, session, hostLoadout, guestLoadout);
          }}
          onBack={() => {
            setTableChallenge(null);
            setScreen('menu');
          }}
        />
      </div>
    );
  }

  if (screen === 'second') {
    return (
      <div className="app app-shell">
        <nav className="shell-bar">
          <button
            type="button"
            className="brass-btn brass-btn-ghost shell-back"
            onClick={() => setScreen('menu')}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>The Hour After</em>
          </p>
        </nav>
        <SecondHour
          profile={profile}
          onUpdate={update}
          aiDifficulty={aiDifficulty}
          onAiDifficulty={setAiDifficulty}
          onEnterYard={(mid, order) => {
            setMapId(mid);
            setBlueFaction(order);
            // The rival across the yard is the other tradition, not the ally.
            setRedFaction(SECOND_HOUR_RIVALS[order]);
            setBlueHeroId(profile.secondHero ?? undefined);
            setBlueDeckIds(profile.secondCards ?? undefined);
            setRedHeroId(undefined);
            setRedDeckIds(undefined);
            setMatchMode('second');
            setScreen('field');
          }}
          onShop={() => setScreen('shop')}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'old') {
    return (
      <div className="app app-shell">
        <nav className="shell-bar">
          <button
            type="button"
            className="brass-btn brass-btn-ghost shell-back"
            onClick={() => setScreen('menu')}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>The Sealed Century</em>
          </p>
        </nav>
        <SealedCentury
          profile={profile}
          onUpdate={update}
          aiDifficulty={aiDifficulty}
          onAiDifficulty={setAiDifficulty}
          onDeckEditor={() => {
            setDeckEra('old');
            setDeckReturn('old');
            setScreen('deck');
          }}
          onEnter={(mid, order, rival) => {
            // The saved Sealed Century working (deck editor) is what the field takes.
            const loadout = sealedCenturyLoadout(profile);
            setMapId(mid);
            setBlueFaction(order);
            setRedFaction(rival);
            setBlueHeroId(loadout.heroId);
            setBlueDeckIds(loadout.deckIds);
            setRedHeroId(CARDS.find((c) => c.kind === 'hero' && c.faction === rival)?.id);
            setRedDeckIds(buildOrderAllyWorkingIds(rival, 30));
            setMatchMode('old');
            setScreen('field');
          }}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  if (screen === 'meeting') {
    return (
      <div className="app app-shell">
        <Meeting onBack={() => setScreen('menu')} guestName={profile.username} title={profile.title} />
      </div>
    );
  }

  if (screen === 'ledger') {
    return (
      <div className="app app-shell">
        <Ledger
          extra={
            <div className="ledger-self plate ledger-honours" data-testid="ledger-honours">
              <p className="plate-kicker">Honours</p>
              <p className="honours-name">
                {profile.username || 'The adept'}
                {profile.title && <em className="adept-title"> · {profile.title}</em>}
              </p>
              <TitlePicker profile={profile} onUpdate={update} />
              {myRank && (
                <p className="honours-name">
                  The Ladder: <RankBadge row={myRank} />
                </p>
              )}
              <div className="match-actions">
                <button type="button" className="brass-btn brass-btn-ghost" onClick={() => setScreen('honours')}>
                  Honours &amp; Titles
                </button>
                <button type="button" className="brass-btn brass-btn-ghost" onClick={() => setScreen('ladder')}>
                  The Ladder
                </button>
              </div>
            </div>
          }
          focusSeat={ledgerSeat}
          onBack={() => {
            setLedgerSeat(false);
            setScreen('menu');
          }}
        />
      </div>
    );
  }

  if (screen === 'shop' && !readHourOpen()) {
    // Never show the Night Counter before the Second Hour is unlocked.
    queueMicrotask(() => setScreen('menu'));
    return null;
  }

  if (screen === 'shop') {
    return (
      <div className="app app-shell">
        <nav className="shell-bar">
          <button
            type="button"
            className="brass-btn brass-btn-ghost shell-back"
            onClick={() => setScreen('menu')}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>Night Counter</em>
          </p>
        </nav>
        <NightCounter profile={profile} onUpdate={update} onBack={() => setScreen('menu')} />
      </div>
    );
  }

  return (
    <div className="app app-shell">
      <nav className="shell-bar" aria-label="Game shell">
        <button
          type="button"
          className="brass-btn brass-btn-ghost shell-back"
          onClick={() => {
            if (screen === 'deck') {
              setScreen(deckReturn);
              return;
            }
            setScreen(
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'second'
                  ? 'second'
                  : matchMode === 'old'
                    ? 'old'
                    : 'menu',
            );
          }}
        >
          {screen === 'deck' && deckReturn === 'old' ? 'Return to the Sealed Century' : 'Return to the atelier'}
        </button>
        <p className="shell-brand">
          <span>Occult Wars</span>
          <em>{shellTitle}</em>
        </p>
        <div id="playing-dock" className="playing-dock" />
      </nav>

      {screen === 'field' && <LoadingLoreVeil key={`${matchMode}:${mapId}`} src={`/assets/maps/${mapId}.jpg`} />}
      {screen === 'field' && (
        <Battlefield
          initialMapId={mapId}
          mode={matchMode}
          blueFaction={blueFaction}
          redFaction={redFaction}
          blueHeroId={blueHeroId}
          redHeroId={redHeroId}
          blueDeckIds={blueDeckIds}
          redDeckIds={redDeckIds}
          friendRole={friendRole ?? undefined}
          friendSession={friendSession ?? undefined}
          profile={profile}
          onUpdateProfile={update}
          aiDifficulty={aiDifficulty}
          onTakeSeat={() => {
            friendSession?.destroy();
            setFriendSession(null);
            setFriendRole(null);
            setLedgerSeat(true);
            setScreen('ledger');
          }}
          onLeave={() => {
            friendSession?.destroy();
            setFriendSession(null);
            setFriendRole(null);
            setScreen(
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'second'
                  ? 'second'
                  : matchMode === 'old'
                    ? 'old'
                    : 'menu',
            );
          }}
          onRiteTally={(t) => {
            // A passed grimoire (one hand, both chairs) never counts toward rites or XP.
            if (matchMode !== 'hotseat') update((p) => noteMatch(recordMatchTally(p, t), t, { mode: matchMode }));
            // The guest's chair learns of the end here (the host reports from onMatchEnd).
            if (matchMode === 'friend' && friendRole === 'guest' && t.finished) reportLadder(t.won);
          }}
          onMatchEnd={({ playerWon, kind, tally }) => {
            // The Ledger: live-table and practice results (a passed grimoire is neither).
            if (matchMode !== 'hotseat') void recordMatch(playerWon, matchMode === 'friend');
            if (matchMode === 'friend' && friendRole === 'host') reportLadder(playerWon);
            const modeKey =
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'hotseat'
                  ? 'hotseat'
                  : matchMode === 'friend'
                    ? 'pvp'
                    : matchMode === 'old'
                      ? 'old'
                      : 'training';
            let next = awardShards(profile, modeKey, playerWon);
            if (matchMode !== 'hotseat') next = noteMatch(recordMatchTally(next, tally), tally, { mode: matchMode, kind });
            if (!playerWon) {
              const r = applyBlackMondayLossInject(next, {
                deckId: working?.id,
              });
              next = r.profile;
              if (r.injected) {
                const bm = cardById('black_monday');
                if (bm) setBlackMondayReveal(bm);
              }
            }
            update(next);
            if (matchMode === 'campaign') {
              const outcome: StageOutcome = !playerWon
                ? 'lost'
                : kind === 'stronghold'
                  ? 'storm'
                  : 'hold';
              setCampaignOutcome({ stageIndex: campaignStage, outcome });
              setScreen('campaign');
            }
          }}
        />
      )}
      {screen === 'archive' && (
        <Catalog profile={profile} onUpdate={update} />
      )}
      {screen === 'deck' && (
        <DeckEditor
          key={deckEra ?? 'any'}
          profile={profile}
          initialEra={deckEra}
          returnLabel={deckReturn === 'old' ? 'Return to the Sealed Century' : 'Return'}
          onSave={(deck: CustomDeck, era) => {
            // Saved = on the field for that hour. Pushed to the cloud at once when signed in.
            update((p) => saveEraDeck(p, deck, era), { now: true });
          }}
          onDelete={(id, era) => {
            update((p) => deleteEraDeck(p, id, era), { now: true });
          }}
          onBack={() => setScreen(deckReturn)}
        />
      )}
      {screen === 'pack' && (
        <PackBreak
          profile={profile}
          onUpdate={update}
          onBack={() => setScreen('menu')}
        />
      )}
      {screen === 'sandbox' && <CombatDemo />}
      <CardPeekLayer />
      {blackMondayReveal && (
        <TarotPop
          card={blackMondayReveal}
          caption="The ticker remembers your fall — Black Monday joins the working"
          closeOnBackdrop={false}
          onClose={() => setBlackMondayReveal(null)}
        />
      )}
    </div>
  );
}
