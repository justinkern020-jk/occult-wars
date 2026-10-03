/** "Honour earned" toasts: a small brass plate that rises, then fades. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HONOUR_BY_ID } from '../game/achievements';
import { powerCallSfx } from '../game/sfx';

export const HONOUR_TOAST_EVENT = 'ow:honour-toast';

export function toastHonours(ids: string[]): void {
  if (!ids.length) return;
  window.dispatchEvent(new CustomEvent<string[]>(HONOUR_TOAST_EVENT, { detail: ids }));
}

type Item = { key: number; id: string; more: number };

export function HonourToast() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let k = 0;
    const on = (e: Event) => {
      const ids = ((e as CustomEvent<string[]>).detail ?? []).filter((id) => HONOUR_BY_ID[id]);
      if (!ids.length) return;
      const head = ids.slice(0, 3);
      const more = ids.length - head.length;
      const add = head.map((id, i) => ({ key: ++k, id, more: i === head.length - 1 ? more : 0 }));
      setItems((cur) => [...cur, ...add].slice(-4));
      try {
        powerCallSfx();
      } catch {
        /* audio locked */
      }
      for (const it of add) {
        window.setTimeout(() => setItems((cur) => cur.filter((x) => x.key !== it.key)), 5200);
      }
    };
    window.addEventListener(HONOUR_TOAST_EVENT, on);
    return () => window.removeEventListener(HONOUR_TOAST_EVENT, on);
  }, []);
  if (!items.length) return null;
  return createPortal(
    <div className="honour-toasts" role="status" aria-live="polite">
      {items.map((it) => {
        const h = HONOUR_BY_ID[it.id];
        return (
          <div key={it.key} className="honour-toast" data-testid="honour-toast">
            <span className="honour-toast-seal" aria-hidden>
              ✦
            </span>
            <span>
              <small>Honour earned</small>
              <strong>{h.name}</strong>
              <em>Title: {h.title}</em>
              {it.more > 0 && <small>and {it.more} more in Honours &amp; Titles</small>}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
