import { FEATURE_FLAGS } from './config/features';
/**
 * Samou' Go — runtime feature flags, resolved from Vite env at build time.
 *
 * Flags default to OFF so a missing `.env` keeps the app conservative; flip
 * them per environment by setting `VITE_ENABLE_*` in the theme's `.env` /
 * `.env.production`. The gated UI (e.g. map pickers, GPS nudges, live
 * tracking) stays wired up in code behind `{FLAG && <Component />}` so it can
 * be re-enabled without any data or logic changes.
 */

const envTrue = (value: unknown): boolean =>
  value === 'true' || value === '1';

/**
 * Master switch for every location / GPS surface in the customer experience
 * (header address row, map picker, first-login GPS nudge, "detect my
 * location" buttons). Underlying hooks/services are untouched — they simply
 * stop being rendered when this is falsy.
 */
export const ENABLE_LOCATION: boolean = FEATURE_FLAGS.ENABLE_LIVE_GPS_TRACKING && envTrue(
  import.meta.env.VITE_ENABLE_LOCATION,
);