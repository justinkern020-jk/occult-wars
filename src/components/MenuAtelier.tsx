import { useEffect, useRef, useState } from 'react';
import { MAPS, mapsForEra, type GameMap } from '../game/maps';
import {
  PACK_COST,
  applyJustinKernUnlock,
  applySethKernUnlock,
  type Profile,
} from '../game/profile';
import {
  bootHourOpen,
  isAthensCode,
  isBattleCountCode,
  isCodePrefix,
  isHiddenAdeptCode,
  isOppenheimerCode,
  isSecondHourCode,
  isSethKernCode,
  writeForceSighting,
  writeHourOpen,
  writePendingJustinHand,
} from '../game/hourUnlock';
import { cardById } from '../data/catalog';
import type { Card } from '../game/types';
import { BattleCountModal } from './BattleCountModal';
import { TarotPop } from './TarotPop';
import { brassClick, copSirenSfx, metalRiffSfx, setMusicBed, unlockAudio } from '../game/sfx';

type Props = {
  profile: Profile;
  onUpdateProfile: (next: Profile) => void;
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  onTraining: () => void;
  onCollection: () => void;
  onDeckEditor: () => void;
  onPack: () => void;
  onLeaden: () => void;
  onHotseat: () => void;
  onFriend: () => void;
  onSecond: () => void;
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
  onCollection,
  onDeckEditor,
  onPack,
  onLeaden,
  onHotseat,
  onFriend,
  onSecond,
  onAllegiance,
  onSandbox,
}: Props) {
  const realNameRef = useRef(
    isSecondHourCode(profile.username) ||
      isBattleCountCode(profile.username) ||
      isAthensCode(profile.username) ||
      isOppenheimerCode(profile.username)
      ? 'Adept'
      : profile.username,
  );
  const [hourOpen, setHourOpen] = useState(() => bootHourOpen(profile.username));
  const [toast, setToast] = useState<string | null>(null);
  const [battleCountOpen, setBattleCountOpen] = useState(false);
  const [revealUnlock, setRevealUnlock] = useState<{ card: Card; caption: string } | null>(null);
  const firstMaps = mapsForEra('first');

  useEffect(() => {
    if (
      !isSecondHourCode(profile.username) &&
      !isBattleCountCode(profile.username) &&
      !isAthensCode(profile.username) &&
      !isOppenheimerCode(profile.username) &&
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
    if (!isCodePrefix(next)) {
      realNameRef.current = next;
    }
    let nextProfile = { ...profile, username: next };
    if (isSethKernCode(next)) {
      unlockAudio();
      copSirenSfx();
      const before = nextProfile.collection.includes('seth_kern');
      nextProfile = applySethKernUnlock(nextProfile);
      if (!before && nextProfile.collection.includes('seth_kern')) {
        setToast('Seth Kern has joined the working.');
        const sk = cardById('seth_kern');
        if (sk) setRevealUnlock({ card: sk, caption: 'Seth Kern has joined the working' });
      } else {
        setToast('The chief has taken a seat.');
      }
    }
    if (isHiddenAdeptCode(next)) {
      const beforeJk = nextProfile.collection.includes('justin_kern');
      nextProfile = applyJustinKernUnlock(nextProfile);
      if (!beforeJk && nextProfile.collection.includes('justin_kern')) {
        const jk = cardById('justin_kern');
        if (jk) setRevealUnlock({ card: jk, caption: 'A hidden adept has answered' });
        setToast('A hidden adept has answered.');
      }
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
          <p className="menu-presents">Kern presents...</p>
          <h1 className="menu-title">Occult Wars</h1>
          <p className="menu-lede">
            Six orders. One leaden hour. Cabals dual-Power — vitality and damage
            as one number. Resources bank the muster.
          </p>

          <label className="menu-occultist">
            <span className="menu-occultist-label">Occultist</span>
            <input
              className="ledger-input menu-occultist-input"
              value={profile.username}
              aria-label="Occultist name"
              maxLength={32}
              onChange={(e) => onOccultistChange(e.target.value)}
            />
          </label>
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
            {profile.username} · {profile.alchemicalShards} shards
            {profile.allegiance ? ` · ${profile.allegiance}` : ' · unswear'}
          </p>

          <button
            type="button"
            className="menu-door brass-btn brass-btn-solid mt-door-hero"
            data-testid="start-training"
            onClick={click(onTraining)}
          >
            <span className="menu-door-glyph" aria-hidden>
              ✦
            </span>
            <span className="menu-door-copy">
              <span className="menu-door-title">Training Rite</span>
              <span className="menu-door-sub">
                A rival order, alone on the circle
              </span>
            </span>
          </button>

          <div className="menu-doors menu-doors-2">
            <button
              type="button"
              className="menu-door brass-btn"
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
          </div>

          <div className="menu-doors menu-doors-2">
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
                <span className="menu-door-sub">4-letter room · WebRTC</span>
              </span>
            </button>
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
                className="menu-door brass-btn"
                data-testid="open-second"
                onClick={click(onSecond)}
              >
                <span className="menu-door-glyph" aria-hidden>
                  ◐
                </span>
                <span className="menu-door-copy">
                  <span className="menu-door-title">The hour after</span>
                  <span className="menu-door-sub">
                    Four societies took what the six left.
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
          Enter the field
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
