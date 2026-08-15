/**
 * Samou' Go — CORS policy.
 *
 * Kept in its own module (rather than inline in `app.ts`) because "which origin
 * may talk to the API" is a deployment fact worth unit-testing on its own.
 *
 * Four sources of truth, checked in this order:
 *
 *   1. `PRODUCTION_ORIGINS` — the seven Vercel production deployments. Baked in
 *      so a fresh Render service is reachable before anyone remembers to set
 *      `CORS_ORIGINS` in the dashboard.
 *   2. `LOCAL_DEV_ORIGINS` — the seven Vite dev ports (5173–5179).
 *   3. `VERCEL_PREVIEW_PATTERN` — every `https://*.vercel.app` origin, so branch
 *      and per-commit preview deployments work without a config change.
 *   4. `env.corsOrigins` (`CORS_ORIGINS`) — deployment-specific extras: LAN IPs
 *      for phone testing, ngrok tunnels, a future custom domain. `*` there still
 *      disables the check entirely.
 *
 * Note on (3): the pattern admits any Vercel-hosted site, not only ours. That is
 * acceptable here because the API authenticates with a `Authorization: Bearer`
 * header read from `localStorage`, which a foreign origin cannot read or attach
 * — unlike cookie auth, where this width would be a real CSRF surface. Narrow it
 * to `/^https:\/\/samou-go-[a-z0-9-]+\.vercel\.app$/` if session cookies are
 * ever introduced.
 */
import type { CorsOptions } from 'cors';
import { env } from './env';
import { forbidden } from '../lib/http-error';

/** The seven production SPAs, one Vercel project each. */
export const PRODUCTION_ORIGINS: readonly string[] = [
  'https://samou-go-customer.vercel.app',
  'https://samou-go-checkout.vercel.app',
  'https://samou-go-store-details.vercel.app',
  'https://samou-go-order-tracking.vercel.app',
  'https://samou-go-store-manager.vercel.app',
  'https://samou-go-captain.vercel.app',
  'https://samou-go-admin.vercel.app',
];

/** Vite dev servers — web-customer 5173 … web-admin 5179, all `strictPort`. */
export const LOCAL_DEV_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
];

/** Vercel preview deployments (branch + per-commit URLs). */
export const VERCEL_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

/** Verbs the SPAs actually use; `PUT` is the raw-upload stream target. */
export const ALLOWED_METHODS: readonly string[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

/**
 * `Last-Event-ID` is listed because the SSE order-tracking stream replays from
 * it on reconnect, and a browser will not send it cross-origin unless allowed.
 *
 * `ngrok-skip-browser-warning` is sent by the API client when it is tunnelling
 * through free-tier ngrok (which serves an interstitial to unrecognised
 * requests). Allowed here so those preflights succeed; a normal deployment
 * never sends it.
 */
export const ALLOWED_HEADERS: readonly string[] = [
  'Content-Type',
  'Authorization',
  'Last-Event-ID',
  'ngrok-skip-browser-warning',
];

/** `true` when `origin` may make credentialed cross-origin requests. */
export function isAllowedOrigin(origin: string): boolean {
  if (env.corsOrigins.includes('*')) return true;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (LOCAL_DEV_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  return env.corsOrigins.includes(origin);
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin, curl, and native mobile clients (Capacitor) send no Origin.
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    // A disallowed origin is a client mistake (4xx), never a server bug.
    // Throwing a raw Error here would surface as a misleading 500; an
    // HttpError flows through the standard envelope as a clean 403.
    callback(forbidden('المصدر غير مسموح / Origin not allowed'));
  },
  credentials: true,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  // Lets the browser cache the preflight for a day instead of re-asking.
  maxAge: 86_400,
  optionsSuccessStatus: 204,
};
