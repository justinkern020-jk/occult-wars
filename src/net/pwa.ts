/**
 * Install-as-app and the offline service worker.
 *
 * The worker (dist/sw.js, built from scripts/sw.template.js) never takes over
 * mid-match: a new one waits until this page is on a safe screen (title, menu,
 * archive, ledger, shop, allegiance), then skips waiting. When it activates it
 * announces its build, and the existing stale-tab check (noteServerBuild)
 * reloads once, on that same safe screen.
 */
import { useEffect, useState } from 'react';
import { CLIENT_BUILD, noteServerBuild, onActivity, safeToReload } from './table';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export type InstallState = {
  /** The browser offered an install prompt (Android Chrome, desktop Chrome/Edge). */
  canPrompt: boolean;
  /** iPhone/iPad Safari: install is Share > Add to Home Screen. */
  ios: boolean;
  /** Already running as an installed app. */
  standalone: boolean;
};

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

export function installState(): InstallState {
  return { canPrompt: !!deferred && !installed, ios: isIos(), standalone: installed || isStandalone() };
}

export function useInstallState(): InstallState {
  const [s, setS] = useState(installState);
  useEffect(() => {
    const on = () => setS(installState());
    listeners.add(on);
    on();
    return () => {
      listeners.delete(on);
    };
  }, []);
  return s;
}

/** Show the browser's install sheet. Resolves true if the adept accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === 'accepted') installed = true;
    return choice.outcome === 'accepted';
  } catch {
    return false;
  } finally {
    emit();
  }
}

let waiting: ServiceWorker | null = null;
function applyWhenSafe(): void {
  if (waiting && safeToReload()) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    waiting = null;
  }
}

function track(reg: ServiceWorkerRegistration): void {
  const consider = (w: ServiceWorker | null) => {
    // Only an update waits; the very first worker installs straight away.
    if (w && navigator.serviceWorker.controller) {
      waiting = w;
      applyWhenSafe();
    }
  };
  if (reg.waiting) consider(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') consider(w);
    });
  });
}

/** Call once at startup. Production only; a no-op in dev and in old browsers. */
export function startPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; build?: string } | null;
    // A newer worker took over: the stale-tab check reloads once, at a safe screen.
    if (d?.type === 'OW_SW_ACTIVE' && typeof d.build === 'string' && d.build && d.build !== CLIENT_BUILD) {
      noteServerBuild(d.build);
    }
  });
  onActivity(applyWhenSafe);
  const go = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        track(reg);
        const check = () => reg.update().catch(() => undefined);
        window.setInterval(check, 10 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch(() => undefined);
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
