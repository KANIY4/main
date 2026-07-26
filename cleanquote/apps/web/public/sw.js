/*
 * Service worker: shell caching only.
 *
 * What it does: keeps the stylesheet and icons available so that opening the app
 * with no signal shows a readable page rather than a browser error.
 *
 * What it deliberately does not do: cache quote data, queue uploads, or replay
 * form submissions. Background sync of captured work is real engineering with
 * real conflict-resolution questions, and pretending to have it is worse than
 * not having it — an estimator who believes their walkthrough was saved offline
 * and finds it gone has lost an afternoon.
 */

const SHELL_CACHE = 'cleanquote-shell-v1';
const SHELL_ASSETS = ['/icon.svg', '/icon-maskable.svg', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only ever GET, only ever same-origin, and never the API: a cached response
  // to a quote query is a stale price, and a replayed POST is a duplicate quote.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
