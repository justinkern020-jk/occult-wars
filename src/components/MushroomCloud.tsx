import { useEffect } from 'react';

type Props = {
  active: boolean;
  /** Fired after the cinematic (~3.2s). */
  onDone?: () => void;
};

/**
 * Layered SVG/CSS detonation: flash, shockwave, stem, cap bloom,
 * heat shimmer, ash fall — brass/ink Occult Wars palette (~3.2s).
 */
export function MushroomCloud({ active, onDone }: Props) {
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => onDone?.(), 3200);
    return () => window.clearTimeout(t);
  }, [active, onDone]);

  if (!active) return null;

  return (
    <div
      className="nuke-overlay"
      data-testid="mushroom-cloud"
      role="presentation"
      aria-hidden
    >
      <div className="nuke-fade" />
      <div className="nuke-flash" />
      <div className="nuke-shockwave" />
      <div className="nuke-shockwave nuke-shockwave-2" />

      <div className="nuke-column">
        <svg
          className="nuke-svg"
          viewBox="0 0 200 280"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id="nukeCapGrad" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#f7e7b0" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#c6a15b" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#5c4030" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#1a120c" stopOpacity="0.7" />
            </radialGradient>
            <linearGradient id="nukeStemGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e7d7a4" stopOpacity="0.85" />
              <stop offset="40%" stopColor="#8a6a3a" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#2a1c12" stopOpacity="0.55" />
            </linearGradient>
            <filter id="nukeBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
            <filter id="nukeGlow">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse
            className="nuke-ground"
            cx="100"
            cy="255"
            rx="70"
            ry="12"
            fill="#c6a15b"
            opacity="0.35"
            filter="url(#nukeBlur)"
          />

          <path
            className="nuke-stem"
            d="M88 250 C90 180, 86 120, 92 78 C94 68, 106 68, 108 78 C114 120, 110 180, 112 250 Z"
            fill="url(#nukeStemGrad)"
            filter="url(#nukeGlow)"
          />
          <path
            className="nuke-stem-veil"
            d="M94 248 C96 190, 93 130, 97 90 C98 82, 102 82, 103 90 C107 130, 104 190, 106 248 Z"
            fill="#f3ead7"
            opacity="0.25"
          />

          <ellipse
            className="nuke-cap"
            cx="100"
            cy="70"
            rx="58"
            ry="38"
            fill="url(#nukeCapGrad)"
            filter="url(#nukeGlow)"
          />
          <ellipse
            className="nuke-cap-rim"
            cx="100"
            cy="88"
            rx="72"
            ry="18"
            fill="#3d2a1a"
            opacity="0.55"
            filter="url(#nukeBlur)"
          />
          <ellipse
            className="nuke-cap-hot"
            cx="100"
            cy="58"
            rx="28"
            ry="16"
            fill="#fff6d4"
            opacity="0.55"
          />

          <ellipse className="nuke-lobe" cx="55" cy="95" rx="22" ry="14" fill="#6b4a2e" opacity="0.7" />
          <ellipse className="nuke-lobe" cx="145" cy="95" rx="22" ry="14" fill="#6b4a2e" opacity="0.7" />
          <ellipse className="nuke-lobe nuke-lobe-late" cx="70" cy="108" rx="16" ry="10" fill="#8a6a3a" opacity="0.5" />
          <ellipse className="nuke-lobe nuke-lobe-late" cx="130" cy="108" rx="16" ry="10" fill="#8a6a3a" opacity="0.5" />
        </svg>

        <div className="nuke-shimmer" />
      </div>

      <div className="nuke-ash" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={`nuke-ember nuke-ember-${i % 7}`}
            style={{ ['--i' as string]: i }}
          />
        ))}
      </div>

      <p className="nuke-legend">The gadget answers</p>
    </div>
  );
}
