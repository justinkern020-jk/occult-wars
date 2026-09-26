import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ENDINGS,
  FULCANELLI_WARNING,
  JUSTIN_EPILOGUE,
  LEADEN_STAGES,
  pickEnding,
  type EndingId,
  type StageOutcome,
} from '../game/campaign';
import {
  applyJustinKernUnlock,
  applyNukeAftermathUnlocks,
  type Profile,
} from '../game/profile';
import { cardById } from '../data/catalog';
import type { Card } from '../game/types';
import {
  speakLine,
  playChronicle,
  brassClick,
  nukeBoomSfx,
  metalRiffSfx,
  nukemVoiceSfx,
  unlockAudio,
} from '../game/sfx';
import { MushroomCloud } from './MushroomCloud';
import { FalloutRain } from './FalloutRain';
import { TarotPop } from './TarotPop';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onPlayStage: (mapId: string, foeFaction: string, stageIndex: number) => void;
  onBack: () => void;
  lastOutcome?: { stageIndex: number; outcome: StageOutcome } | null;
  onConsumeOutcome?: () => void;
};

/** nuke → fallout → radiation → winter → epilogue → justin → plate → Fulcanelli warning */
type CloserPhase =
  | 'nuke'
  | 'fallout'
  | 'radiation'
  | 'winter'
  | 'epilogue'
  | 'reveal'
  | 'plate'
  | 'warning';

export function CampaignHour({
  profile,
  onUpdate,
  onPlayStage,
  onBack,
  lastOutcome,
  onConsumeOutcome,
}: Props) {
  const progress = profile.campaign ?? {
    stage: 0,
    endings: [],
    choices: {},
  };
  const [showCutscene, setShowCutscene] = useState(true);
  const [endingId, setEndingId] = useState<EndingId | null>(null);
  const [closer, setCloser] = useState<CloserPhase | null>(null);
  const [justinCard, setJustinCard] = useState<Card | null>(null);
  const [radiationCard, setRadiationCard] = useState<Card | null>(null);
  const [winterCard, setWinterCard] = useState<Card | null>(null);

  useEffect(() => {
    if (!lastOutcome || !onConsumeOutcome) return;
    const { stageIndex, outcome } = lastOutcome;
    const nextChoices = {
      ...progress.choices,
      [String(stageIndex)]: outcome,
    };
    const nextStage = Math.min(stageIndex + 1, LEADEN_STAGES.length);
    let endings = progress.endings;
    let end: EndingId | null = null;
    let nextProfile = profile;
    if (nextStage >= LEADEN_STAGES.length) {
      end = pickEnding(
        Object.keys(nextChoices)
          .map(Number)
          .sort((a, b) => a - b)
          .map((k) => nextChoices[String(k)] as StageOutcome),
      );
      endings = [...new Set([...endings, end])];
      setEndingId(end);
      // Ultimate closer: Justin Kern nukes whoever "won" the hour.
      unlockAudio();
      metalRiffSfx();
      nukemVoiceSfx();
      nukeBoomSfx();
      setCloser('nuke');
      nextProfile = applyJustinKernUnlock({ ...profile, username: profile.username });
    }
    onUpdate({
      ...nextProfile,
      campaign: {
        stage: nextStage,
        choices: nextChoices,
        endings,
      },
    });
    onConsumeOutcome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOutcome]);

  // If player returns to a finished campaign (stage already maxed), land on
  // Fulcanelli warning — the final curtain — without replaying nuke.
  useEffect(() => {
    if (
      progress.stage >= LEADEN_STAGES.length &&
      !endingId &&
      closer === null &&
      !lastOutcome
    ) {
      setEndingId(pickEnding(
        Object.keys(progress.choices)
          .map(Number)
          .sort((a, b) => a - b)
          .map((k) => progress.choices[String(k)] as StageOutcome),
      ));
      setCloser('warning');
    }
  }, [progress.stage, progress.choices, endingId, closer, lastOutcome]);

  const outcomes = useMemo(() => {
    const keys = Object.keys(progress.choices)
      .map(Number)
      .sort((a, b) => a - b);
    return keys.map((k) => progress.choices[String(k)] as StageOutcome);
  }, [progress.choices]);

  const stage = LEADEN_STAGES[progress.stage] ?? null;
  const done = progress.stage >= LEADEN_STAGES.length || !!endingId;

  const onNukeDone = useCallback(() => {
    setCloser('fallout');
  }, []);

  const onFalloutDone = useCallback(() => {
    onUpdate(applyNukeAftermathUnlocks(profile));
    const rad = cardById('radiation_poisoning');
    if (rad) {
      setRadiationCard(rad);
      setCloser('radiation');
    } else {
      const winter = cardById('nuclear_winter');
      if (winter) {
        setWinterCard(winter);
        setCloser('winter');
      } else {
        setCloser('epilogue');
      }
    }
  }, [onUpdate, profile]);

  function beginStage() {
    if (!stage) return;
    brassClick();
    speakLine(stage.cutscene.vo);
    if (stage.id === 'lamp') playChronicle('the_first_lamp');
    onPlayStage(stage.map, stage.foe, progress.stage);
  }

  function resetHour() {
    onUpdate({
      ...profile,
      campaign: { stage: 0, endings: progress.endings, choices: {} },
    });
    setEndingId(null);
    setCloser(null);
    setJustinCard(null);
    setRadiationCard(null);
    setWinterCard(null);
    setShowCutscene(true);
  }

  if (done) {
    const variantId = (endingId ?? pickEnding(outcomes)) as EndingId;
    const end = ENDINGS[variantId] ?? ENDINGS['sealed-hour'];

    return (
      <section
        className="campaign-root plate-screen"
        data-testid="campaign-ending"
      >
        {closer === 'nuke' && (
          <MushroomCloud active onDone={onNukeDone} />
        )}

        {closer === 'fallout' && (
          <div className="campaign-fallout-veil" data-testid="campaign-fallout">
            <FalloutRain active durationMs={4500} onDone={onFalloutDone} />
            <p className="nuke-legend" style={{ opacity: 0.7, animation: 'none' }}>
              Ash settles
            </p>
          </div>
        )}

        {closer === 'radiation' && radiationCard && (
          <TarotPop
            card={radiationCard}
            caption="The ash settles — Radiation Poisoning"
            closeOnBackdrop={false}
            onClose={() => {
              setRadiationCard(null);
              const winter = cardById('nuclear_winter');
              if (winter) {
                setWinterCard(winter);
                setCloser('winter');
              } else {
                setCloser('epilogue');
              }
            }}
          />
        )}

        {closer === 'winter' && winterCard && (
          <TarotPop
            card={winterCard}
            caption="The sun fails — Nuclear Winter"
            closeOnBackdrop={false}
            onClose={() => {
              setWinterCard(null);
              setCloser('epilogue');
            }}
          />
        )}

        {closer === 'epilogue' && (
          <div className="campaign-epilogue" data-testid="campaign-epilogue">
            <p className="plate-kicker">{JUSTIN_EPILOGUE.kicker}</p>
            <h2>{JUSTIN_EPILOGUE.title}</h2>
            <div className="deco-rule" />
            {JUSTIN_EPILOGUE.paragraphs.map((p) => (
              <p key={p.slice(0, 24)} className="lede campaign-epilogue-p">
                {p}
              </p>
            ))}
            <p className="campaign-sequel-tease">{JUSTIN_EPILOGUE.sequelTease}</p>
            <button
              type="button"
              className="brass-btn brass-btn-solid"
              data-testid="campaign-epilogue-continue"
              onClick={() => {
                brassClick();
                const jk = cardById('justin_kern');
                if (jk) {
                  setJustinCard(jk);
                  setCloser('reveal');
                } else {
                  setCloser('plate');
                }
              }}
            >
              Behold the occupant
            </button>
          </div>
        )}

        {closer === 'reveal' && justinCard && (
          <TarotPop
            card={justinCard}
            caption="Justin Kern · ruler of what remains"
            closeOnBackdrop={false}
            onClose={() => {
              setJustinCard(null);
              setCloser('plate');
            }}
          />
        )}

        {closer === 'plate' && (
          <div className="campaign-epilogue" data-testid="campaign-plate">
            <p className="plate-kicker">The Leaden Hour · Lodge memory</p>
            <h2>{end.title}</h2>
            <p className="lede">{end.text}</p>
            <p className="campaign-justin-footnote">
              Then the gadget answered. Justin Kern rules the ash.
            </p>
            <button
              type="button"
              className="brass-btn brass-btn-solid"
              data-testid="campaign-plate-continue"
              onClick={() => {
                brassClick();
                setCloser('warning');
              }}
            >
              Continue
            </button>
          </div>
        )}

        {(closer === 'warning' || closer === null) && (
          <div
            className="campaign-fulcanelli campaign-epilogue"
            data-testid="campaign-fulcanelli"
          >
            <p className="plate-kicker">The Occult Wars · Final curtain</p>
            <h2>{FULCANELLI_WARNING.title}</h2>
            <p className="campaign-fulcanelli-attr">
              {FULCANELLI_WARNING.attribution}
            </p>
            <div className="deco-rule" />
            <p className="campaign-fulcanelli-memory">
              Lodge memory · {end.title}
            </p>
            <blockquote className="campaign-fulcanelli-quote">
              {FULCANELLI_WARNING.quote}
            </blockquote>
            <p className="campaign-justin-footnote">
              {FULCANELLI_WARNING.footnote}
            </p>
            <button
              type="button"
              className="brass-btn brass-btn-solid"
              onClick={resetHour}
            >
              Sit the hour again
            </button>
            <button
              type="button"
              className="brass-btn brass-btn-ghost"
              onClick={onBack}
            >
              Return
            </button>
          </div>
        )}
      </section>
    );
  }

  if (!stage) return null;

  return (
    <section className="campaign-root plate-screen" data-testid="campaign-hour">
      <p className="plate-kicker">
        The Leaden Hour · Stage {progress.stage + 1} / {LEADEN_STAGES.length}
      </p>
      <h2>{stage.title}</h2>

      {showCutscene ? (
        <div className="campaign-cutscene cutscene">
          <p className="campaign-veil plate-kicker">{stage.cutscene.veil}</p>
          <div className="deco-rule" />
          <p className="cutscene-line lede">{stage.cutscene.vo}</p>
          <p className="campaign-brief">{stage.briefing}</p>
          <p className="campaign-foe">Foe · {stage.foe}</p>
          <button
            type="button"
            className="brass-btn brass-btn-solid"
            data-testid="campaign-begin"
            onClick={() => {
              setShowCutscene(false);
              beginStage();
            }}
          >
            Enter the field
          </button>
          <button
            type="button"
            className="brass-btn brass-btn-ghost"
            onClick={() => speakLine(stage.cutscene.vo)}
          >
            Hear the hour (voice)
          </button>
        </div>
      ) : (
        <div className="campaign-ready">
          <p className="lede">{stage.briefing}</p>
          <button
            type="button"
            className="brass-btn brass-btn-solid"
            onClick={beginStage}
          >
            Sit against {stage.foe}
          </button>
        </div>
      )}

      <ol className="campaign-roadmap">
        {LEADEN_STAGES.map((s, i) => (
          <li
            key={s.id}
            className={
              i < progress.stage
                ? 'is-done'
                : i === progress.stage
                  ? 'is-current'
                  : ''
            }
          >
            {s.title}
            {progress.choices[String(i)]
              ? ` · ${progress.choices[String(i)]}`
              : ''}
          </li>
        ))}
      </ol>

      <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
        Return to the atelier
      </button>
    </section>
  );
}
