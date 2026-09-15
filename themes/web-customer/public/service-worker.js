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
const CACHE_NAME = 'samou-go-customer-v4';
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
        Promise.all(keys.filter((key) => key.startsWith('samou-go-customer-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // The Render API is always live data. Do not cache it, even if a deployment
  // eventually proxies it through the same origin.
  if (url.hostname === API_HOSTNAME || url.pathname.startsWith('/api/')) return;

  // Only same-origin GETs participate in the cache. API calls and cross-origin
  // traffic stay network-only.
  if (url.origin !== self.location.origin || request.method !== 'GET' || request.headers.has('Authorization')) return;
  // Only public build assets are cacheable; never arbitrary same-origin endpoints.
  if (request.mode !== 'navigate' && !url.pathname.startsWith('/assets/')) return;

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

// FCM delivers to the existing worker; no second worker/cache or CDN SDK required.
// Keep lock-screen text generic: a device can go offline before logout reaches the API.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
    const data = payload && typeof payload.data === 'object' && payload.data ? payload.data : {};
    const orderId = typeof data.orderId === 'string' ? data.orderId.slice(0, 100) : '';
    const expiry = Number(data.expiresAt);
    const expired = Number.isFinite(expiry) && expiry > 0 && expiry <= Date.now();
    // iOS requires a visible notification for a push event, including stale messages.
    await self.registration.showNotification('Samou Quick', {
      body: expired ? 'افتح التطبيق للاطلاع على آخر التحديثات' : 'لديك تحديث جديد، افتح التطبيق للاطلاع عليه',
      tag: typeof data.notificationLogId === 'string' ? data.notificationLogId.slice(0, 100) : undefined,
      data: { path: !expired && orderId ? `/orders/${encodeURIComponent(orderId)}` : '/home' },
    });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = event.notification.data?.path;
    // Ignore payload URLs. Opening the protected route refetches authoritative state.
    const safePath = typeof path === 'string' && /^\/orders\/[^/?#]+$/.test(path) ? path : '/home';
    const target = new URL(safePath, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});
