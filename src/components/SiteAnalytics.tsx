import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';

/** Vercel Web Analytics script path (served by the platform once Analytics is on). */
export const INSIGHTS_SCRIPT = '/_vercel/insights/script.js';

/**
 * Vercel Web Analytics (page views by country etc.), production builds only.
 * Until Analytics is switched on for the project, the SPA rewrite answers the
 * script path with index.html; injecting that would throw a SyntaxError in the
 * console, so probe first and mount only when the platform serves JavaScript.
 * Offline / blocked / local dev: renders nothing, logs nothing.
 */
export function SiteAnalytics() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || typeof fetch !== 'function') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let alive = true;
    fetch(INSIGHTS_SCRIPT, { method: 'HEAD', cache: 'no-store' })
      .then((r) => {
        if (alive && r.ok && /javascript/i.test(r.headers.get('content-type') ?? '')) setLive(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return live ? <Analytics mode="production" debug={false} /> : null;
}
