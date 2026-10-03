/** Honours & Titles: what has been earned, what is near, and the title worn. */
import { useEffect } from 'react';
import type { Profile } from '../game/profile';
import { HONOURS, chooseTitle, earnedTitles } from '../game/achievements';
import { brassClick } from '../game/sfx';

type Props = {
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  onBack: () => void;
};

export function TitlePicker({ profile, onUpdate }: Omit<Props, 'onBack'>) {
  const titles = earnedTitles(profile);
  return (
    <label className="title-picker">
      <span>Title worn beside your name</span>
      <select
        data-testid="title-picker"
        value={profile.title ?? ''}
        onChange={(e) => {
          brassClick();
          const v = e.target.value;
          onUpdate((p) => chooseTitle(p, v ? v : null));
        }}
        disabled={titles.length === 0}
      >
        <option value="">{titles.length ? 'No title' : 'Earn an honour to wear a title'}</option>
        {titles.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Honours({ profile, onUpdate, onBack }: Props) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const got = profile.ach?.got ?? {};
  const shown = HONOURS.filter((h) => !h.secret || got[h.id]);
  const secretsLeft = HONOURS.filter((h) => h.secret && !got[h.id]).length;
  const earned = HONOURS.filter((h) => got[h.id]).length;
  return (
    <section className="honours" data-testid="honours">
      <header className="codex-head">
        <button type="button" className="brass-btn brass-btn-ghost" onClick={onBack}>
          Return to the atelier
        </button>
        <div>
          <p className="plate-kicker">What the circle remembers</p>
          <h1 className="codex-title">Honours &amp; Titles</h1>
          <p className="codex-count">
            {earned} of {HONOURS.length} honours earned
          </p>
        </div>
      </header>
      <div className="honours-worn plate">
        <p className="honours-name">
          {profile.username || 'The adept'}
          {profile.title && <em className="adept-title"> · {profile.title}</em>}
        </p>
        <TitlePicker profile={profile} onUpdate={onUpdate} />
      </div>
      <ul className="honours-list">
        {shown.map((h) => {
          const [have, need] = h.progress(profile);
          const done = !!got[h.id];
          const pct = Math.round((Math.min(have, need) / need) * 100);
          return (
            <li
              key={h.id}
              className={`honour${done ? ' is-earned' : ''}${h.secret ? ' is-secret' : ''}`}
              data-testid={done ? 'honour-earned' : 'honour-open'}
            >
              <span className="honour-seal" aria-hidden>
                {done ? '✦' : '○'}
              </span>
              <span className="honour-copy">
                <strong>{h.name}</strong>
                <span className="honour-goal">{h.goal}</span>
                <span className="honour-title">Title: {h.title}</span>
              </span>
              <span className="honour-progress" aria-label={`${Math.min(have, need)} of ${need}`}>
                <span className="honour-bar">
                  <span style={{ width: `${done ? 100 : pct}%` }} />
                </span>
                <small>{done ? 'Earned' : `${Math.min(have, need)} / ${need}`}</small>
              </span>
            </li>
          );
        })}
        {Array.from({ length: secretsLeft }, (_, i) => (
          <li key={`s${i}`} className="honour is-hidden" data-testid="honour-secret">
            <span className="honour-seal" aria-hidden>
              ?
            </span>
            <span className="honour-copy">
              <strong>???</strong>
              <span className="honour-goal">A secret honour. It shows itself when earned.</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
