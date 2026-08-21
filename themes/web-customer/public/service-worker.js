/* Samou' Go — customer app service worker.
 *
 * Lives in `public/` so Vercel serves it as a real static `.js` file
 * (`application/javascript`) instead of routing it through the SPA rewrite,
 * which would return `index.html` as `text/html` and fail registration with
 * "Unsupported MIME type".
 *
 * Strategy:
 *  - Network-first for navigations, falling back to the cached app shell so
 *    the SPA still opens offline.
 *  - Stale-while-revalidate for same-origin GET assets (hashed build files
 *    are immutable in practice; the cache refreshes in the background).
 *  - Cross-origin traffic (API, SMS verification) is never
 *    intercepted — network requests must always hit the origin.
 */
const CACHE_NAME = 'samou-go-customer-v2';
const APP_SHELL = '/index.html';
const API_HOSTNAME = 'samou-go.onrender.com';

/** `respondWith` must always receive a Response — never an undefined cache miss. */
function offlineResponse() {
  return new Response(JSON.stringify({ error: 'OFFLINE', message: 'Network unavailable' }), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function networkOnly(request) {
  return fetch(request).catch(() => offlineResponse());
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // The Render API is always live data. Do not cache it, even if a deployment
  // eventually proxies it through the same origin.
  if (url.hostname === API_HOSTNAME) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Only same-origin GETs participate in the cache. API calls and cross-origin
  // traffic stay network-only.
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  // Navigations: network first, app shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match(APP_SHELL).then((cached) => cached || offlineResponse()))
    );
    return;
  }

  // Static assets: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = networkOnly(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached || offlineResponse());
      return cached || network;
    }).catch(() => networkOnly(request))
  );
});
