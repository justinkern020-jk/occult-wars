/** Device settings: leader voices, weather over the field, the battle choir. */
import { useSettings, writeSetting, type Settings } from '../game/settings';
import { brassClick } from '../game/sfx';

const ROWS: { key: keyof Settings; label: string; sub: string }[] = [
  { key: 'voice', label: 'Leader voices', sub: 'Short gramophone barks on leader powers, victory and defeat (with subtitles)' },
  { key: 'choir', label: 'Swelling choir', sub: 'A low choir rises in the battle music when a match tips' },
  { key: 'weather', label: 'Weather on the field', sub: 'Rain, fog, moonlight, snow or dusk over the map. Cosmetic only' },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <div className="codex-page-scrim" role="dialog" aria-modal aria-label="Settings" onClick={onClose}>
      <div className="settings-panel plate" onClick={(e) => e.stopPropagation()} data-testid="settings-panel">
        <p className="plate-kicker">This device</p>
        <h2>Settings</h2>
        {ROWS.map((r) => (
          <label key={r.key} className="settings-row">
            <input
              type="checkbox"
              checked={s[r.key]}
              data-testid={`setting-${r.key}`}
              onChange={(e) => {
                brassClick();
                writeSetting(r.key, e.target.checked);
              }}
            />
            <span>
              <strong>{r.label}</strong>
              <small>{r.sub}</small>
            </span>
          </label>
        ))}
        <button type="button" className="brass-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
