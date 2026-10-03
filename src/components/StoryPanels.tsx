/**
 * Painted comic panels between Leaden Hour battles: one panel at a time, a
 * narration box, Next / Skip. Each panel tries /assets/story/<id>.jpg and
 * falls back to existing card or map art until its painting lands.
 */
import { useEffect, useState } from 'react';
import { storyArt, type StoryPanel } from '../game/storyPanels';
import { brassClick } from '../game/sfx';

function PanelArt({ panel }: { panel: StoryPanel }) {
  const painted = panel.paint !== false;
  const [src, setSrc] = useState(painted ? storyArt(panel.id) : panel.fallback);
  const [fallback, setFallback] = useState(!painted);
  useEffect(() => {
    setSrc(painted ? storyArt(panel.id) : panel.fallback);
    setFallback(!painted);
  }, [panel.id, panel.fallback, painted]);
  const portrait = fallback && panel.fallback.includes('/assets/images/');
  return (
    <div className={`story-art${fallback ? ' is-fallback' : ''}${portrait ? ' is-portrait' : ''}`}>
      {portrait && <img className="story-art-blur" src={src} alt="" aria-hidden />}
      <img
        key={src}
        className="story-art-img"
        src={src}
        alt={panel.scene}
        decoding="async"
        onError={() => {
          if (!fallback) {
            setFallback(true);
            setSrc(panel.fallback);
          }
        }}
      />
    </div>
  );
}

type Props = {
  panels: StoryPanel[];
  /** Small heading above the panel ("The Leaden Hour · Stage 2"). */
  kicker?: string;
  onDone: () => void;
};

export function StoryPanels({ panels, kicker, onDone }: Props) {
  const [i, setI] = useState(0);
  const p = panels[i];
  // Warm the next painting so Next feels instant.
  useEffect(() => {
    const n = panels[i + 1];
    if (n && n.paint !== false) new Image().src = storyArt(n.id);
  }, [i, panels]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setI((x) => (x + 1 >= panels.length ? (onDone(), x) : x + 1));
      }
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panels.length, onDone]);
  if (!p) return null;
  const last = i === panels.length - 1;
  return (
    <div className="story-panels" data-testid="story-panels" role="dialog" aria-label="The story so far">
      {kicker && <p className="plate-kicker story-kicker">{kicker}</p>}
      <figure className="story-panel" key={p.id} data-panel={p.id}>
        <PanelArt panel={p} />
        <figcaption className="story-caption">{p.caption}</figcaption>
      </figure>
      <div className="story-controls">
        <button type="button" className="brass-btn brass-btn-ghost" data-testid="story-skip" onClick={() => { brassClick(); onDone(); }}>
          Skip
        </button>
        <span className="story-dots" aria-label={`Panel ${i + 1} of ${panels.length}`}>
          {panels.map((x, k) => (
            <span key={x.id} className={k === i ? 'is-on' : k < i ? 'is-seen' : ''} />
          ))}
        </span>
        <button
          type="button"
          className="brass-btn brass-btn-solid"
          data-testid="story-next"
          onClick={() => {
            brassClick();
            if (last) onDone();
            else setI(i + 1);
          }}
        >
          {last ? 'To the briefing' : 'Next'}
        </button>
      </div>
    </div>
  );
}
