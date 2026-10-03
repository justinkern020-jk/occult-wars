import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_BLURB,
  aiDifficultyLabel,
  type AiDifficulty,
} from '../game/ai';
import { brassClick } from '../game/sfx';

/** Rival mind picker (Easy / Experienced / Expert), as on occultwar.grok.me. */
export function AiMindPicker({
  value,
  onChange,
}: {
  value: AiDifficulty;
  onChange: (next: AiDifficulty) => void;
}) {
  return (
    <div className="ai-mind" role="group" aria-label="Rival mind">
      <span className="ai-mind-label">Rival mind</span>
      <div className="ai-mind-row">
        {AI_DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`brass-btn ai-mind-btn ${value === d ? 'brass-btn-solid' : ''}`}
            aria-pressed={value === d}
            data-testid={`ai-${d}`}
            title={AI_DIFFICULTY_BLURB[d]}
            onClick={() => {
              brassClick();
              onChange(d);
            }}
          >
            {aiDifficultyLabel(d)}
          </button>
        ))}
      </div>
      <p className="ai-mind-blurb">{AI_DIFFICULTY_BLURB[value]}</p>
    </div>
  );
}
