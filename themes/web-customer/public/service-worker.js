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
 *  - Cross-origin traffic (API, Firebase Auth / reCAPTCHA / SMS) is never
 *    intercepted — the phone-sign-in iframe must always hit the network.
 */
const CACHE_NAME = 'samou-go-customer-v1';
const APP_SHELL = '/index.html';

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

  // Only same-origin GETs participate in the cache. API calls and the
  // Firebase Auth / reCAPTCHA widget traffic stay network-only.
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  // Navigations: network first, app shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          return response;
        })
        .catch(() => caches.match(APP_SHELL))
    );
    return;
  }

  // Static assets: serve from cache instantly, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});