/** Device settings: leader voices, weather, the battle choir, haptics, install as app. */
import { useState } from 'react';
import { useSettings, writeSetting, type Settings } from '../game/settings';
import { brassClick } from '../game/sfx';
import { haptic, hapticsSupported } from '../game/haptics';
import { promptInstall, useInstallState } from '../net/pwa';

const ROWS: { key: keyof Settings; label: string; sub: string }[] = [
  { key: 'voice', label: 'Leader voices', sub: 'Short gramophone barks on leader powers, victory and defeat (with subtitles)' },
  { key: 'choir', label: 'Swelling choir', sub: 'A low choir rises in the battle music when a match tips' },
  { key: 'weather', label: 'Weather on the field', sub: 'Rain, fog, moonlight, snow or dusk over the map. Cosmetic only' },
  { key: 'haptics', label: 'Haptics', sub: 'The phone ticks on a move, buzzes when a unit falls, thumps on a capture' },
];

/** "Install the grimoire": the browser's install sheet, or iOS Share-sheet steps. */
export function InstallGrimoire({ compact = false }: { compact?: boolean }) {
  const st = useInstallState();
  const [iosHelp, setIosHelp] = useState(false);
  if (st.standalone) return compact ? null : <p className="settings-install-note">Installed: the grimoire opens from your home screen.</p>;
  if (st.canPrompt) {
    return (
      <button
        type="button"
        className={compact ? 'brass-btn menu-ledger-btn menu-install-btn' : 'brass-btn settings-install-btn'}
        data-testid={compact ? 'menu-install' : 'install-grimoire'}
        onClick={() => {
          brassClick();
          void promptInstall();
        }}
        title="Add Occult Wars to this device as an app (works offline for Training)"
      >
        <span className="menu-ledger-glyph" aria-hidden>
          ❖
        </span>
        Install the grimoire
      </button>
    );
  }
  if (!st.ios || compact) return null;
  return (
    <div className="settings-install-ios" data-testid="install-ios">
      <button type="button" className="brass-btn settings-install-btn" onClick={() => setIosHelp((v) => !v)}>
        <span className="menu-ledger-glyph" aria-hidden>
          ❖
        </span>
        Install the grimoire
      </button>
      {iosHelp && (
        <p className="settings-install-note">
          In Safari, tap <strong>Share</strong> <span aria-hidden>(the square with an arrow)</span>, then{' '}
          <strong>Add to Home Screen</strong>. The grimoire then opens full screen, and Training works offline.
        </p>
      )}
    </div>
  );
}

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
                if (r.key === 'haptics' && e.target.checked) haptic('capture');
              }}
            />
            <span>
              <strong>{r.label}</strong>
              <small>
                {r.key === 'haptics' && !hapticsSupported() ? 'This device or browser has no vibration (iPhone Safari). Nothing to feel here' : r.sub}
              </small>
            </span>
          </label>
        ))}
        <InstallGrimoire />
        <button type="button" className="brass-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
