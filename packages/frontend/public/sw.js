// Minimal service worker for the Sweepstake PWA.
//
// Its only jobs are (1) satisfy Chrome's installability gate (a registered SW
// with a fetch handler) and (2) provide a basic offline shell. It is network-
// first on purpose: the app is a Trusted Web Activity over the live site, so
// fresh content/API responses must always win — the cache is just a fallback.
//
// Bump CACHE (v2 -> v3 ...) whenever this file or the shell list changes; the
// activate handler purges any cache whose name isn't the current one, so a stale
// precached shell on a returning device is cleared the next time the SW updates.
const CACHE = 'sweepstake-v2';
const SHELL = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/admin.html',
  '/groups.html',
  '/tree.html',
  '/bracket.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for GETs: keep the live site/API fresh, fall back to cache then
// the cached app shell when offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache successful responses. Caching a 404/5xx (e.g. a hashed
        // asset that was pruned by a deploy) would otherwise be replayed as the
        // offline fallback and serve a broken page.
        if (response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match('/index.html'))
      )
  );
});
