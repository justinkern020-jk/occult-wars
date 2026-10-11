import { useEffect, useRef } from 'react';

/** Open plates, newest last: Escape closes only the top one. */
const stack: { current: () => void }[] = [];
let bound = false;
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
}

/** Close a modal plate on Escape (latest handler wins; no re-binding per render). */
export function useEscape(onEscape: () => void, active = true): void {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const entry = ref;
    stack.push(entry);
    if (!bound) {
      window.addEventListener('keydown', onKey);
      bound = true;
    }
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
