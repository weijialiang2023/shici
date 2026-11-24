const CACHE_VERSION = 'shici-v34';
const CACHE_NUMBER = Number((CACHE_VERSION.match(/^shici-v(\d+)$/) || [])[1] || 0);
const RETAINED_CACHE_NUMBER = Math.max(0, CACHE_NUMBER - 1);
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/styles.css?v=34',
  './js/product-analytics.js?v=34',
  './js/premium-config.js?v=34',
  './js/domain/state-schema.js?v=34',
  './js/domain/srs-engine.js?v=34',
  './js/storage/state-integrity.js?v=34',
  './js/domain/entitlements.js?v=34',
  './js/data.js?v=34',
  './js/store.js?v=34',
  './js/ui.js?v=34',
  './js/app.js?v=34',
  './data/books/index.js?v=27',
  './assets/favicon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) {
        return Promise.all(APP_SHELL.map(function (path) {
          return cache.add(new Request(path, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          const match = key.match(/^shici-v(\d+)$/);
          const generation = match ? Number(match[1]) : null;
          // Keep the previous generation while old clients may still be reading
          // a large book script from it. Delete only older or unknown caches.
          return key !== CACHE_VERSION && (generation === null || generation < RETAINED_CACHE_NUMBER);
        })
          .map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;

  if (request.mode === 'navigate') {
    const appRoot = new URL('./', self.location).pathname;
    const appIndex = new URL('./index.html', self.location).pathname;
    const cacheKey = url.pathname === appRoot || url.pathname === appIndex ? './index.html' : request;
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) { cache.put(cacheKey, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(cacheKey).then(function (cached) {
            return cached || caches.match('./offline.html');
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
