import { useMemo, useState } from 'react';
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
import type { FriendRole, FriendSession } from './net/friendSession';
import { SecondHour } from './components/SecondHour';
import { useProfile } from './hooks/useProfile';
import {
  awardShards,
  swearAllegiance,
  type CustomDeck,
} from './game/profile';
import { FIRST_HOUR_ORDERS, allyOf, isFirstHourOrder, type FirstHourOrder } from './game/orders';
import { readHourOpen } from './game/hourUnlock';
import type { StageOutcome } from './game/campaign';
import { mapsForEra } from './game/maps';
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
  const [mapId, setMapId] = useState('ashen-cross');
  const [matchMode, setMatchMode] = useState<MatchMode>('training');
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

  const working = profile.customDecks[0] as CustomDeck | undefined;

  const shellTitle = useMemo(() => {
    switch (screen) {
      case 'field':
        if (matchMode === 'campaign') return 'The Leaden Hour';
        if (matchMode === 'hotseat') return 'Pass the Grimoire';
        if (matchMode === 'friend') return 'Friend Working';
        if (matchMode === 'second') return 'The Hour After';
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
      case 'allegiance':
        return 'Swear an Order';
      case 'sandbox':
        return 'Rites desk';
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
  ) {
    ensureSworn(() => {
      const order = firstHourAllegiance()!;
      const foe = trainingFoe(order);
      // Shared match: host = Azure, guest = Crimson. Same factions on both browsers.
      setBlueFaction(order);
      setRedFaction(foe);
      setBlueHeroId(working?.heroId);
      setBlueDeckIds(working?.cards);
      setRedHeroId(undefined);
      setRedDeckIds(undefined);
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
            setScreen('menu');
          }}
          onBack={firstHourAllegiance() ? () => setScreen('menu') : undefined}
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
        onCollection={() => setScreen('archive')}
        onDeckEditor={() => ensureSworn(() => setScreen('deck'))}
        onPack={() => ensureSworn(() => setScreen('pack'))}
        onLeaden={() => ensureSworn(() => setScreen('campaign'))}
        onHotseat={startHotseat}
        onFriend={() => ensureSworn(() => setScreen('friend'))}
        onSecond={() => {
          if (readHourOpen()) setScreen('second');
        }}
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
            onClick={() => setScreen('menu')}
          >
            Return to the atelier
          </button>
          <p className="shell-brand">
            <span>Occult Wars</span>
            <em>Friend Working</em>
          </p>
        </nav>
        <FriendWorking
          onReady={({ room, role, session }) => startFriend(room, role, session)}
          onBack={() => setScreen('menu')}
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
          onEnterYard={(mid, order) => {
            setMapId(mid);
            setBlueFaction(order);
            setRedFaction(
              order === 'The Blackout Wardens'
                ? 'The Numbers Station'
                : order === 'The Drowned Parish'
                  ? 'The Dust Ballot'
                  : order === 'The Numbers Station'
                    ? 'The Blackout Wardens'
                    : 'The Drowned Parish',
            );
            setBlueHeroId(profile.secondHero ?? undefined);
            setBlueDeckIds(profile.secondCards ?? undefined);
            setMatchMode('second');
            setScreen('field');
          }}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  return (
    <div className="app app-shell">
      <nav className="shell-bar" aria-label="Game shell">
        <button
          type="button"
          className="brass-btn brass-btn-ghost shell-back"
          onClick={() =>
            setScreen(
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'second'
                  ? 'second'
                  : 'menu',
            )
          }
        >
          Return to the atelier
        </button>
        <p className="shell-brand">
          <span>Occult Wars</span>
          <em>{shellTitle}</em>
        </p>
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
          onLeave={() => {
            friendSession?.destroy();
            setFriendSession(null);
            setFriendRole(null);
            setScreen(
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'second'
                  ? 'second'
                  : 'menu',
            );
          }}
          onMatchEnd={({ playerWon, kind }) => {
            const modeKey =
              matchMode === 'campaign'
                ? 'campaign'
                : matchMode === 'hotseat'
                  ? 'hotseat'
                  : matchMode === 'friend'
                    ? 'pvp'
                    : 'training';
            update(awardShards(profile, modeKey, playerWon));
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
          profile={profile}
          onSave={(deck) => {
            update({
              ...profile,
              customDecks: [
                deck,
                ...profile.customDecks.filter((d) => d.id !== deck.id),
              ],
            });
            setScreen('menu');
          }}
          onBack={() => setScreen('menu')}
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
    </div>
  );
}
