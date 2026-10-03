/*
 * Occult Wars service worker (generated at build time by vite.config.ts from
 * scripts/sw.template.js; do not edit dist/sw.js by hand).
 *
 * - Navigations: network first (so a reload always picks up a new deploy),
 *   falling back to the cached app shell when offline.
 * - Hashed build files (/assets/*-<hash>.js|css): cache first, kept across
 *   deploys (pruned) so a tab still on an older build can lazy-load its chunks.
 * - Other same-origin assets (card art, maps, audio): stale-while-revalidate.
 * - /api: network first; GETs fall back to the last good answer offline.
 * - A new worker waits until the page says it is safe (menu, never mid-match).
 */
const BUILD = __OW_SW_BUILD__;
const VERSION = __OW_SW_VERSION__;
const SHELL = __OW_SW_SHELL__;
const CORE = __OW_SW_CORE__;

const SHELL_CACHE = 'ow-shell-' + VERSION;
const ASSET_CACHE = 'ow-assets';
const RUNTIME_CACHE = 'ow-runtime';
const API_CACHE = 'ow-api';
const KEEP_ASSETS = 160;
const KEEP_RUNTIME = 450;
const NAV_TIMEOUT_MS = 4000;

const HASHED = /^\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css|mjs)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(['/index.html']);
      const assets = await caches.open(ASSET_CACHE);
      await assets.addAll(SHELL.filter((u) => u !== '/index.html'));
      // Core art is best effort: one missing file must not block the install.
      const runtime = await caches.open(RUNTIME_CACHE);
      await Promise.all(
        CORE.map((u) =>
          runtime.match(u).then((hit) => hit || runtime.add(u).catch(() => undefined)),
        ),
      );
    })(),
  );
});

async function trim(name, keep, protect) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const extra = keys.length - keep;
  if (extra <= 0) return;
  let removed = 0;
  for (const req of keys) {
    if (removed >= extra) break;
    if (protect && protect.has(new URL(req.url).pathname)) continue;
    await cache.delete(req);
    removed++;
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('ow-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n)),
      );
      await trim(ASSET_CACHE, KEEP_ASSETS, new Set(SHELL));
      await trim(RUNTIME_CACHE, KEEP_RUNTIME, new Set(CORE));
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: 'OW_SW_ACTIVE', build: BUILD });
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'OW_SW_BUILD?' && event.ports && event.ports[0]) event.ports[0].postMessage({ build: BUILD });
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function navigate(request) {
  try {
    const res = await Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)]);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => undefined);
    }
    return res;
  } catch {
    const cached = (await caches.match('/index.html')) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('<h1>Occult Wars</h1><p>The circle is offline. Reconnect and reload.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirst(request, name) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    caches.open(name).then((c) => c.put(request, copy)).catch(() => undefined);
  }
  return res;
}

async function staleWhileRevalidate(event, name) {
  const request = event.request;
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if ((res.ok && res.status === 200) || res.type === 'opaque') {
        cache.put(request, res.clone()).catch(() => undefined);
      }
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  const res = await fresh;
  return res || new Response('', { status: 504 });
}

async function networkFirstApi(request) {
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) {
      const copy = res.clone();
      caches.open(API_CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
    }
    return res;
  } catch (err) {
    const hit = await caches.match(request, { cacheName: API_CACHE });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // POSTs (moves, saves, reports) go straight through
  if (request.headers.has('range')) return; // media seeking: let the browser stream it
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/_vercel/')) return;
    if (url.pathname.startsWith('/api/')) {
      // Signed requests (a seat's own page) are never kept on the device.
      if (request.headers.has('authorization')) return;
      event.respondWith(networkFirstApi(request));
      return;
    }
    if (request.mode === 'navigate') {
      event.respondWith(navigate(request));
      return;
    }
    if (HASHED.test(url.pathname)) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
      return;
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
      event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
  }
});
