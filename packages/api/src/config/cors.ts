/** Exact production/mobile origins plus previews belonging to the Samou Go team.
 * Additional deployment origins must be explicitly listed in CORS_ORIGINS.
 * Bearer authentication remains mandatory regardless of CORS.
 */
import type { CorsOptions } from "cors";
import { env } from "./env";
import { forbidden } from "../lib/http-error";

/** The seven production SPAs, one Vercel project each. */
export const PRODUCTION_ORIGINS: readonly string[] = [
  "https://samou-go-customer.vercel.app",
  "https://samou-go-checkout.vercel.app",
  "https://samou-go-store-details.vercel.app",
  "https://samou-go-order-tracking.vercel.app",
  "https://samou-go-store-manager.vercel.app",
  "https://samou-go-captain.vercel.app",
  "https://samou-go-admin.vercel.app",
];

/** Vite dev servers — web-customer 5173 … web-admin 5179, all `strictPort`. */
export const LOCAL_DEV_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
];

/**
 * Capacitor origins — the Android/iOS WebView serves the bundled app from a
 * local origin and the browser reports THAT origin (not the deployed one) in
 * the `Origin` header of every cross-origin fetch and preflight. The scheme
 * depends on the platform/build: `https://localhost` is Capacitor's default
 * local server scheme, `http://localhost` is the cleartext fallback, and
 * `capacitor://localhost` is the legacy iOS scheme. Baked in so a fresh Render
 * service answers native clients even before `CORS_ORIGINS` is configured.
 */
export const MOBILE_ORIGINS: readonly string[] = [
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
];

/** Vercel preview deployments (branch + per-commit URLs). */
export const VERCEL_PREVIEW_PATTERN =
  /^https:\/\/samou-go-(customer|checkout|store-details|order-tracking|store-manager|captain|admin)-[a-z0-9-]+-samou-go\.vercel\.app$/;

/** Verbs the SPAs actually use; `PUT` is the raw-upload stream target. */
export const ALLOWED_METHODS: readonly string[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
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
  "Content-Type",
  "Authorization",
  "Last-Event-ID",
  "ngrok-skip-browser-warning",
];

/** `true` when `origin` may make credentialed cross-origin requests. */
export function isAllowedOrigin(origin: string): boolean {
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (
    LOCAL_DEV_ORIGINS.includes(origin) ||
    LOCAL_DEV_ORIGINS.includes(origin.replace("://127.0.0.1:", "://localhost:"))
  )
    return true;
  if (MOBILE_ORIGINS.includes(origin)) return true;
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
    callback(forbidden("المصدر غير مسموح / Origin not allowed"));
  },
  credentials: true,
  methods: [...ALLOWED_METHODS],
  allowedHeaders: [...ALLOWED_HEADERS],
  // Lets the browser cache the preflight for a day instead of re-asking.
  maxAge: 86_400,
  optionsSuccessStatus: 204,
};
