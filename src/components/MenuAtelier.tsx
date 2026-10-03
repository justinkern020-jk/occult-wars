import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { readTableSnapshot, subscribeTable } from '../net/table';
import { readSeenMeeting } from '../net/meeting';
import { MAPS, mapsForEra, type GameMap } from '../game/maps';
import {
  PACK_COST,
  applyJustinKernUnlock,
  applySethKernUnlock,
  applySouthHavenDispatchUnlock,
  claimRite,
  type Profile,
} from '../game/profile';
import { levelFromXp, riteLabel, riteReady } from '../game/dailyRites';
import {
  bootHourOpen,
  isAthensCode,
  isBattleCountCode,
  isCodePrefix,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSecondHourCode,
  isSethKernCode,
  isSouthHavenPdCode,
  writeForceSighting,
  writeHourOpen,
  writePendingJustinHand,
  writePendingSethHand,
  writePendingSouthHavenHand,
} from '../game/hourUnlock';
import { cardById } from '../data/catalog';
import type { Card } from '../game/types';
import { BattleCountModal } from './BattleCountModal';
import { AiMindPicker } from './AiMindPicker';
import { aiDifficultyLabel, type AiDifficulty } from '../game/ai';
import { TarotPop } from './TarotPop';
import { MenuAtmosphere } from './MenuAtmosphere';
import { brassClick, copSirenSfx, metalRiffSfx, setMusicBed, spellCastSfx, unlockAudio } from '../game/sfx';

type Props = {
  profile: Profile;
  onUpdateProfile: (next: Profile) => void;
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  onTraining: () => void;
  /** Rival mind for solo rites (Easy / Experienced / Expert). */
  aiDifficulty?: AiDifficulty;
  onAiDifficulty?: (next: AiDifficulty) => void;
  onCollection: () => void;
  onDeckEditor: () => void;
  onPack: () => void;
  onLeaden: () => void;
  onHotseat: () => void;
  onFriend: () => void;
  /** The Ledger — account, name, record, the book of names. */
  onLedger?: () => void;
  /** The Occultist Meeting — the shared board. */
  onMeeting?: () => void;
  onSecond: () => void;
  onShop: () => void;
  onOldWork: () => void;
  onAllegiance: () => void;
  onSandbox: () => void;
};

function doubleNodeCount(map: GameMap): number {
  return map.tiles.flat().filter((t) => t.kind === 'resource' && t.symbols === 2)
    .length;
}

function MiniTile({ kind, symbols }: { kind: string; symbols?: number }) {
  const cls =
    kind === 'void'
      ? 'mini-void'
      : kind === 'stronghold'
        ? 'mini-stronghold'
        : kind === 'gate'
          ? 'mini-gate'
          : kind === 'resource'
            ? symbols === 2
              ? 'mini-res-2'
              : 'mini-res'
            : 'mini-street';
  return <span className={`mini-cell ${cls}`} />;
}

export function MenuAtelier({
  profile,
  onUpdateProfile,
  selectedMapId,
  onSelectMap,
  onTraining,
  aiDifficulty = 'expert',
  onAiDifficulty,
  onCollection,
  onDeckEditor,
  onPack,
  onLeaden,
  onHotseat,
  onFriend,
  onLedger,
  onMeeting,
  onSecond,
  onShop,
  onOldWork,
  onAllegiance,
  onSandbox,
}: Props) {
  const realNameRef = useRef(
    isSecondHourCode(profile.username) ||
      isBattleCountCode(profile.username) ||
      isAthensCode(profile.username) ||
      isOppenheimerCode(profile.username) ||
      isSouthHavenPdCode(profile.username)
      ? 'Adept'
      : profile.username,
  );
  const [hourOpen, setHourOpen] = useState(() => bootHourOpen(profile.username));
  const [toast, setToast] = useState<string | null>(null);
  const [battleCountOpen, setBattleCountOpen] = useState(false);
  const tableSnap = useSyncExternalStore(subscribeTable, readTableSnapshot, readTableSnapshot);
  const meetUnread = (tableSnap.view?.meet ?? 0) > readSeenMeeting();
  const [revealUnlock, setRevealUnlock] = useState<{ card: Card; caption: string } | null>(null);
  const firstMaps = mapsForEra('first');
  const lvl = levelFromXp(profile.xp);

  useEffect(() => {
    if (
      !isSecondHourCode(profile.username) &&
      !isBattleCountCode(profile.username) &&
      !isAthensCode(profile.username) &&
      !isOppenheimerCode(profile.username) &&
      !isSouthHavenPdCode(profile.username) &&
      !isCodePrefix(profile.username)
    ) {
      realNameRef.current = profile.username;
    }
  }, [profile.username]);

  useEffect(() => {
    unlockAudio();
    setMusicBed('menu');
    return () => {
      setMusicBed('none');
    };
  }, []);

  const click = (fn: () => void) => () => {
    brassClick();
    fn();
  };

  function onOccultistChange(raw: string) {
    const next = raw.slice(0, 32);
    if (isSecondHourCode(next)) {
      writeHourOpen();
      setHourOpen(true);
      setToast('The leaden hour answers.');
      onUpdateProfile({ ...profile, username: realNameRef.current });
      return;
    }
    if (isBattleCountCode(next)) {
      setBattleCountOpen(true);
      setToast(null);
      onUpdateProfile({ ...profile, username: realNameRef.current });
      return;
    }
    if (isAthensCode(next)) {
      writeForceSighting();
      setToast('The night will answer at the next circle.');
      onUpdateProfile({ ...profile, username: realNameRef.current });
      return;
    }
    if (isOppenheimerCode(next)) {
      unlockAudio();
      metalRiffSfx();
      writePendingJustinHand();
      const unlocked = applyJustinKernUnlock({ ...profile, username: realNameRef.current });
      setToast('The gadget waits — Justin Kern joins the next circle.');
      onUpdateProfile(unlocked);
      const jk = cardById('justin_kern');
      if (jk) setRevealUnlock({ card: jk, caption: 'The gadget waits — Justin Kern' });
      return;
    }
    if (isSethKernCode(next)) {
      unlockAudio();
      copSirenSfx();
      writePendingSethHand();
      const unlocked = applySethKernUnlock({ ...profile, username: next });
      setToast('The chief waits — Seth Kern joins the next circle.');
      onUpdateProfile(unlocked);
      const sk = cardById('seth_kern');
      if (sk) setRevealUnlock({ card: sk, caption: 'The chief waits — Seth Kern' });
      return;
    }
    if (isSouthHavenPdCode(next)) {
      unlockAudio();
      copSirenSfx();
      writePendingSouthHavenHand();
      const unlocked = applySouthHavenDispatchUnlock({
        ...profile,
        username: realNameRef.current,
      });
      setToast('The siren waits — South Haven Dispatch joins the next circle.');
      onUpdateProfile(unlocked);
      const sh = cardById('south_haven_dispatch');
      if (sh)
        setRevealUnlock({
          card: sh,
          caption: 'The siren answers — South Haven Dispatch',
        });
      return;
    }
    if (!isCodePrefix(next)) {
      realNameRef.current = next;
    }
    let nextProfile = { ...profile, username: next };
    if (isHiddenAdeptCode(next)) {
      // Hidden Adept answers like Oppenheimer: Justin joins the next circle's
      // hand (pending one-shot drop) with a reveal that stays until Close /
      // Esc. The profile is only scrubbed — never a collection plate.
      unlockAudio();
      metalRiffSfx();
      writePendingJustinHand();
      nextProfile = applyJustinKernUnlock(nextProfile);
      const jk = cardById('justin_kern');
      if (jk) setRevealUnlock({ card: jk, caption: 'A hidden adept has answered' });
      setToast('A hidden adept has answered — Justin Kern joins the next circle.');
    }
    onUpdateProfile(nextProfile);
  }

  return (
    <div className="menu-root" data-testid="main-menu">
      <section
        className="menu-stage"
        style={{ backgroundImage: 'url(/assets/titles/menu-atelier.jpg)' }}
      >
        <div className="menu-veil">
          <MenuAtmosphere />
          <div className="presents-socket menu-presents-socket" aria-label="Kern presents">
            <img
              className="presents-socket-frame"
              src="/assets/images/occultist_socket.png"
              alt=""
              draggable={false}
              aria-hidden
            />
            <span className="presents-resource-jewel presents-resource-jewel-left" aria-hidden />
            <span className="presents-resource-jewel presents-resource-jewel-right" aria-hidden />
            <p className="menu-presents">
              <span className="presents-mark">Kern</span>
              <span className="presents-verb">presents</span>
            </p>
          </div>
          <h1 className="menu-title">Occult Wars</h1>
          <p className="menu-lede">
            A war of secret occultists using esoteric rites, alchemy, magic, technology,
            &amp; brute force to impose their will on the world... choose your allegiance
            &amp; fight.
          </p>

          <div className="menu-occultist-socket">
            <img
              className="menu-occultist-socket-frame"
              src="/assets/images/occultist_socket.png"
              alt=""
              draggable={false}
              aria-hidden
            />
            <label className="menu-occultist">
              <span className="menu-occultist-label">
                Occultist
                <span
                  className="menu-level"
                  data-testid="player-level"
                  title={`${lvl.into} / ${lvl.need} XP to level ${lvl.level + 1}`}
                >
                  Lv {lvl.level}
                  <span className="menu-level-thread" aria-hidden>
                    <span style={{ width: `${Math.round((lvl.into / lvl.need) * 100)}%` }} />
                  </span>
                </span>
              </span>
              <input
                className="ledger-input menu-occultist-input"
                value={profile.username}
                aria-label="Occultist name"
                maxLength={32}
                onChange={(e) => onOccultistChange(e.target.value)}
                placeholder="Name the adept…"
              />
            </label>
          </div>
          {(isHiddenAdeptCode(profile.username) || isSethKernCode(profile.username)) && (
            <div className="menu-occultist-badges">
              {isHiddenAdeptCode(profile.username) && (
                <p className="menu-occultist-badge">A hidden adept has answered</p>
              )}
              {isSethKernCode(profile.username) && (
                <p className="menu-occultist-badge">The chief has taken a seat</p>
              )}
            </div>
          )}

          <p className="menu-shards" data-testid="shard-count">
            {profile.username} · Lv {lvl.level} · {profile.alchemicalShards} shards
            {profile.allegiance ? ` · ${profile.allegiance}` : ' · unswear'}
          </p>

          {profile.daily && profile.daily.rites.length > 0 && (
            <section className="menu-rites" data-testid="daily-rites" aria-label="The Day's Rites">
              <h2 className="menu-rites-title">The Day&rsquo;s Rites</h2>
              <ul className="menu-rites-list">
                {profile.daily.rites.map((r) => {
                  const ready = riteReady(r);
                  const pct = Math.round((Math.min(r.progress, r.goal) / r.goal) * 100);
                  return (
                    <li
                      key={r.id}
                      className={`menu-rite${ready ? ' is-ready' : ''}${r.claimed ? ' is-claimed' : ''}`}
                      data-testid="daily-rite"
                    >
                      <span className="menu-rite-label">{riteLabel(r)}</span>
                      <span className="menu-rite-thread" aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </span>
                      <span className="menu-rite-count">
                        {Math.min(r.progress, r.goal)}/{r.goal}
                      </span>
                      {ready ? (
                        <button
                          type="button"
                          className="brass-btn brass-btn-solid menu-rite-claim"
                          data-testid="claim-rite"
                          onClick={() => {
                            const { profile: next, granted } = claimRite(profile, r.id);
                            if (granted > 0) {
                              unlockAudio();
                              spellCastSfx();
                              onUpdateProfile(next);
                              setToast(`The rite is answered: +${granted} shards.`);
                            }
                          }}
                        >
                          Claim {r.reward}
                        </button>
                      ) : (
                        <span className="menu-rite-reward">
                          {r.claimed ? 'Claimed' : `${r.reward} shards`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="menu-rites-note">
                New rites at midnight · every mode counts but Pass the Grimoire
              </p>
            </section>
          )}

          {onAiDifficulty && <AiMindPicker value={aiDifficulty} onChange={onAiDifficulty} />}

          <button
            type="button"
            className="menu-door brass-btn brass-btn-solid mt-door-hero menu-door-era"
            style={{ '--door-art': 'url(/assets/menu/door-training.jpg)' } as CSSProperties}
            data-testid="start-training"
            onClick={click(onTraining)}
          >
            <span className="menu-door-glyph" aria-hidden>
              ✦
            </span>
            <span className="menu-door-copy">
              <span className="menu-door-title">Training Rite</span>
              <span className="menu-door-sub">
                {aiDifficultyLabel(aiDifficulty)} rival, alone on the circle
              </span>
            </span>
          </button>

          {/* Column-major on wide screens: the Sealed Century sits directly
              below the Leaden Hour (and on phones, straight after it). */}
          <div className="menu-doors menu-doors-2 menu-doors-cols">
            <button
              type="button"
              className="menu-door brass-btn menu-door-era"
              style={{ '--door-art': 'url(/assets/menu/door-leaden.jpg)' } as CSSProperties}
              data-testid="open-leaden"
              onClick={click(onLeaden)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⬡
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Leaden Hour</span>
                <span className="menu-door-sub">
                  Six stages. Close each circle.
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn menu-door-era"
              style={{ '--door-art': 'url(/assets/menu/door-sealed.jpg)' } as CSSProperties}
              data-testid="open-old-work"
              onClick={click(onOldWork)}
            >
              <span className="menu-door-glyph" aria-hidden>
                †
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Sealed Century</span>
                <span className="menu-door-sub">
                  The prequel. Four orders: Sidhe and witches, the mercury works, the closed proof, the birch vigil.
                </span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-hotseat"
              onClick={click(onHotseat)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⧉
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Pass the Grimoire</span>
                <span className="menu-door-sub">Two chairs, one working</span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-friend"
              onClick={click(onFriend)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⟐
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Friend Working</span>
                <span className="menu-door-sub">quick match or room code</span>
              </span>
            </button>
          </div>

          <div className="menu-doors">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-collection"
              onClick={click(onCollection)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✹
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">The Collection</span>
                <span className="menu-door-sub">
                  Owned plates · import / export
                </span>
              </span>
            </button>
          </div>

          {(onLedger || onMeeting) && (
            <div className={`menu-doors${onLedger && onMeeting ? ' menu-doors-2' : ''}`}>
              {onMeeting && (
                <button
                  type="button"
                  className="menu-door brass-btn"
                  data-testid="open-meeting"
                  onClick={click(onMeeting)}
                >
                  <span className="menu-door-glyph" aria-hidden>
                    ☾
                  </span>
                  <span className="menu-door-copy">
                    <span className="menu-door-title">
                      Occultist Meeting
                      {meetUnread && (
                        <span
                          className="menu-unread"
                          data-testid="meeting-unread"
                          aria-label="New words at the meeting"
                        />
                      )}
                    </span>
                    <span className="menu-door-sub">The board every hand can read</span>
                  </span>
                </button>
              )}
              {onLedger && (
              <button
                type="button"
                className="menu-door brass-btn"
                data-testid="open-ledger"
                onClick={click(onLedger)}
              >
                <span className="menu-door-glyph" aria-hidden>
                  §
                </span>
                <span className="menu-door-copy">
                  <span className="menu-door-title">The Ledger</span>
                  <span className="menu-door-sub">A name, your record, the other occultists</span>
                </span>
              </button>
              )}
            </div>
          )}

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-deck"
              onClick={click(onDeckEditor)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✎
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Deck Editor</span>
                <span className="menu-door-sub">1 leader · 30–40 plates</span>
              </span>
            </button>
            <button
              type="button"
              className="menu-door brass-btn brass-btn-solid"
              data-testid="open-pack"
              onClick={click(onPack)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ✧
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">Break a Seal</span>
                <span className="menu-door-sub">
                  {PACK_COST} shards · five cards
                </span>
              </span>
            </button>
          </div>

          {hourOpen && (
            <div className="menu-doors">
              <button
                type="button"
                className="menu-door brass-btn brass-btn-solid"
                data-testid="open-shop"
                onClick={click(onShop)}
              >
                <span className="menu-door-glyph" aria-hidden>
                  ◇
                </span>
                <span className="menu-door-copy">
                  <span className="menu-door-title">Night Counter</span>
                  <span className="menu-door-sub">
                    Second Hour plates · the seals do not carry them
                  </span>
                </span>
              </button>
            </div>
          )}

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
              data-testid="open-allegiance"
              onClick={click(onAllegiance)}
            >
              <span className="menu-door-glyph" aria-hidden>
                ⚜
              </span>
              <span className="menu-door-copy">
                <span className="menu-door-title">
                  {profile.allegiance ? 'Re-swear' : 'Swear an order'}
                </span>
                <span className="menu-door-sub">Primary + ally jewel</span>
              </span>
            </button>
            {hourOpen ? (
              <button
                type="button"
                className="menu-door brass-btn menu-door-era"
                style={{ '--door-art': 'url(/assets/menu/door-second.jpg)' } as CSSProperties}
                data-testid="open-second"
                onClick={click(onSecond)}
              >
                <span className="menu-door-glyph" aria-hidden>
                  ◐
                </span>
                <span className="menu-door-copy">
                  <span className="menu-door-title">The hour after</span>
                  <span className="menu-door-sub">
                    Four occult orders. Sidhe, the helix, the monad, the icon.
                  </span>
                </span>
              </button>
            ) : (
              <span className="menu-door-spacer" aria-hidden />
            )}
          </div>

          {toast && (
            <p className="menu-toast" data-testid="hour-toast" role="status">
              {toast}
            </p>
          )}
        </div>
      </section>

      <section className="plate field-picker">
        <p className="plate-kicker">Choose the field (Training)</p>
        <div className="map-grid">
          {firstMaps.map((m) => {
            const doubles = doubleNodeCount(m);
            const active = m.id === selectedMapId;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                data-testid={`map-${m.id}`}
                className={`map-card brass-btn ${active ? 'brass-btn-solid' : ''}`}
                onClick={() => onSelectMap(m.id)}
              >
                <span
                  className="map-thumb"
                  style={{
                    backgroundImage: `url(/assets/maps/${m.id}.jpg)`,
                  }}
                >
                  <span className="map-mini" aria-hidden>
                    {m.tiles.flat().map((t, i) => (
                      <MiniTile key={i} kind={t.kind} symbols={t.symbols} />
                    ))}
                  </span>
                </span>
                <span className="map-card-name">{m.name}</span>
                <span className="map-card-sub">
                  {doubles === 0 ? 'No double seal' : `${doubles} nodes worth 2`}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="brass-btn brass-btn-solid enter-field-btn"
          onClick={click(onTraining)}
        >
          Enter the field · {aiDifficultyLabel(aiDifficulty)}
        </button>
      </section>

      <p className="menu-dev">
        <button type="button" className="dev-link" onClick={onSandbox}>
          Rites desk
        </button>
        <span aria-hidden> · </span>
        <a href="https://occultwar.grok.me" target="_blank" rel="noreferrer">
          Reference on grok.me
        </a>
        <span aria-hidden> · </span>
        <span>{MAPS.length} maps loaded</span>
      </p>
      {revealUnlock && (
        <TarotPop
          card={revealUnlock.card}
          caption={revealUnlock.caption}
          closeOnBackdrop={false}
          onClose={() => setRevealUnlock(null)}
        />
      )}
      {battleCountOpen && (
        <BattleCountModal onClose={() => setBattleCountOpen(false)} />
      )}
    </div>
  );
}
