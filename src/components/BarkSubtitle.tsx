/** Subtitles for leader barks: a line of italic text low on the screen. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BARK_EVENT, type BarkDetail } from '../game/voice';

export function BarkSubtitle() {
  const [line, setLine] = useState<(BarkDetail & { key: number }) | null>(null);
  useEffect(() => {
    let k = 0;
    let timer = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<BarkDetail>).detail;
      if (!d) return;
      const key = ++k;
      setLine({ ...d, key });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLine((cur) => (cur?.key === key ? null : cur)), d.ms);
    };
    window.addEventListener(BARK_EVENT, on);
    return () => {
      window.removeEventListener(BARK_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  if (!line) return null;
  return createPortal(
    <p key={line.key} className={`bark-sub${line.foe ? ' is-foe' : ''}`} role="status" aria-live="polite" data-testid="bark-sub">
      “{line.text}”
    </p>,
    document.body,
  );
}
