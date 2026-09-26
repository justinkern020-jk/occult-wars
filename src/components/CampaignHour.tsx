import { useEffect, useMemo, useState } from 'react';
import {
  ENDINGS,
  LEADEN_STAGES,
  pickEnding,
  type EndingId,
  type StageOutcome,
} from '../game/campaign';
import type { Profile } from '../game/profile';
import { speakLine, playChronicle, brassClick } from '../game/sfx';

type Props = {
  profile: Profile;
  onUpdate: (p: Profile) => void;
  onPlayStage: (mapId: string, foeFaction: string, stageIndex: number) => void;
  onBack: () => void;
  lastOutcome?: { stageIndex: number; outcome: StageOutcome } | null;
  onConsumeOutcome?: () => void;
};

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
    if (nextStage >= LEADEN_STAGES.length) {
      end = pickEnding(
        Object.keys(nextChoices)
          .map(Number)
          .sort((a, b) => a - b)
          .map((k) => nextChoices[String(k)] as StageOutcome),
      );
      endings = [...new Set([...endings, end])];
      setEndingId(end);
    }
    onUpdate({
      ...profile,
      campaign: {
        stage: nextStage,
        choices: nextChoices,
        endings,
      },
    });
    onConsumeOutcome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOutcome]);

  const outcomes = useMemo(() => {
    const keys = Object.keys(progress.choices)
      .map(Number)
      .sort((a, b) => a - b);
    return keys.map((k) => progress.choices[String(k)] as StageOutcome);
  }, [progress.choices]);

  const stage = LEADEN_STAGES[progress.stage] ?? null;
  const done = progress.stage >= LEADEN_STAGES.length || !!endingId;

  function beginStage() {
    if (!stage) return;
    brassClick();
    speakLine(stage.cutscene.vo);
    if (stage.id === 'lamp') playChronicle('the_first_lamp');
    onPlayStage(stage.map, stage.foe, progress.stage);
  }

  if (done) {
    const end =
      ENDINGS[(endingId ?? pickEnding(outcomes)) as EndingId] ??
      ENDINGS['sealed-hour'];
    return (
      <section className="campaign-root" data-testid="campaign-ending">
        <p className="plate-kicker">The Leaden Hour</p>
        <h2>{end.title}</h2>
        <p className="lede">{end.text}</p>
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          onClick={() => {
            onUpdate({
              ...profile,
              campaign: { stage: 0, endings: progress.endings, choices: {} },
            });
            setEndingId(null);
            setShowCutscene(true);
          }}
        >
          Sit the hour again
        </button>
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return
        </button>
      </section>
    );
  }

  if (!stage) return null;

  return (
    <section className="campaign-root" data-testid="campaign-hour">
      <p className="plate-kicker">
        The Leaden Hour · Stage {progress.stage + 1} / {LEADEN_STAGES.length}
      </p>
      <h2>{stage.title}</h2>

      {showCutscene ? (
        <div className="campaign-cutscene">
          <div className="campaign-veil">{stage.cutscene.veil}</div>
          <p className="lede">{stage.cutscene.vo}</p>
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
