/** "Honour earned" toasts: a small brass plate that rises, then fades. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HONOUR_BY_ID } from '../game/achievements';
import { powerCallSfx } from '../game/sfx';

export const HONOUR_TOAST_EVENT = 'ow:honour-toast';
export const NOTICE_EVENT = 'ow:notice';

/** A plain notice in the same brass plate (the ladder, and the like). */
export function toastNotice(kicker: string, title: string, sub?: string): void {
  window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: { kicker, title, sub } }));
}

export function toastHonours(ids: string[]): void {
  if (!ids.length) return;
  window.dispatchEvent(new CustomEvent<string[]>(HONOUR_TOAST_EVENT, { detail: ids }));
}

type Item = { key: number; id: string; more: number; notice?: { kicker: string; title: string; sub?: string } };

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
    const onNotice = (e: Event) => {
      const d = (e as CustomEvent<{ kicker: string; title: string; sub?: string }>).detail;
      if (!d) return;
      const it = { key: ++k, id: '', more: 0, notice: d };
      setItems((cur) => [...cur, it].slice(-4));
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.key !== it.key)), 5200);
    };
    window.addEventListener(HONOUR_TOAST_EVENT, on);
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(HONOUR_TOAST_EVENT, on);
      window.removeEventListener(NOTICE_EVENT, onNotice);
    };
  }, []);
  if (!items.length) return null;
  return createPortal(
    <div className="honour-toasts" role="status" aria-live="polite">
      {items.map((it) => {
        if (it.notice) {
          return (
            <div key={it.key} className="honour-toast" data-testid="notice-toast">
              <span className="honour-toast-seal" aria-hidden>
                ☉
              </span>
              <span>
                <small>{it.notice.kicker}</small>
                <strong>{it.notice.title}</strong>
                {it.notice.sub && <em>{it.notice.sub}</em>}
              </span>
            </div>
          );
        }
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
