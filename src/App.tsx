import { useEffect, useMemo, useRef, useState } from 'react';
import { Battlefield, type MatchMode } from './components/Battlefield';
import { CombatDemo } from './components/CombatDemo';
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
} from './net/friendLoadout';
import { SecondHour } from './components/SecondHour';
import { SealedCentury } from './components/SealedCentury';
import { NightCounter } from './components/NightCounter';
import { useProfile } from './hooks/useProfile';
import {
  applyBlackMondayLossInject,
  awardShards,
  deleteEraDeck,
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
import { readHourOpen } from './game/hourUnlock';
import type { StageOutcome } from './game/campaign';
import { mapsForEra } from './game/maps';
import { AI_DIFFICULTY_KEY, readAiDifficulty, type AiDifficulty } from './game/ai';
import './App.css';

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
  | 'sandbox';

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
  const [friendRole, setFriendRole] = useState<FriendRole | null>(null);
  const [friendSession, setFriendSession] = useState<FriendSession | null>(null);
  const [blackMondayReveal, setBlackMondayReveal] = useState<Card | null>(null);
  /** A table challenge waiting for Friend Working (issued = host, answered = guest). */
  const [tableChallenge, setTableChallenge] = useState<{
    role: FriendRole;
    room: string;
  } | null>(null);

  // What this hand is doing, for the owner's roll (and the safe-reload check).
  useEffect(() => {
    setActivity({ where: screen, mode: screen === 'field' ? matchMode : undefined, name: profile.username });
  }, [screen, matchMode, profile.username]);

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
        if (matchMode === 'friend') return 'Friend Working';
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
  }, [screen, matchMode]);

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
      setMapId((prev) =>
        mapsForEra('first').some((m) => m.id === prev) ? prev : 'ashen-cross',
      );
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
      setMapId((prev) =>
        mapsForEra('first').some((m) => m.id === prev) ? prev : 'ashen-cross',
      );
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
      setMatchMode('friend');
      setMapId((prev) =>
        mapsForEra('first').some((m) => m.id === prev) ? prev : 'ashen-cross',
      );
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
        onLedger={() => setScreen('ledger')}
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
      />
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
        <FriendWorking
          key={tableChallenge ? `${tableChallenge.role}-${tableChallenge.room}` : 'friend'}
          customDecks={profile.customDecks}
          allegiance={firstHourAllegiance()}
          tableChallenge={tableChallenge}
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
        <Meeting onBack={() => setScreen('menu')} guestName={profile.username} />
      </div>
    );
  }

  if (screen === 'ledger') {
    return (
      <div className="app app-shell">
        <Ledger onBack={() => setScreen('menu')} />
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
          onMatchEnd={({ playerWon, kind }) => {
            // The Ledger: live-table and practice results (a passed grimoire is neither).
            if (matchMode !== 'hotseat') void recordMatch(playerWon, matchMode === 'friend');
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
