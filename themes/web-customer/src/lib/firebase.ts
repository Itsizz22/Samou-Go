import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type RecaptchaVerifier } from "firebase/auth";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

/**
 * Firebase client configuration — driven by Vite env vars so one codebase can
 * point at any Firebase project without an edit. Vercel (web-customer project)
 * must define, in Project Settings → Environment Variables:
 *
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_MEASUREMENT_ID        (optional)
 *
 * The values below match the active project (samougo-web) and act as a
 * last-resort fallback: a missing variable degrades to a console warning
 * instead of a broken bundle. `import.meta.env` is statically replaced at
 * build time, so the fallbacks are tree-shaken into the production bundle.
 *
 * Authorized domains (Firebase Console → Authentication → Settings →
 * Authorized domains) must include every Vercel production origin that runs
 * the Firebase phone-auth SDK (`signInWithPhoneNumber`), plus `localhost` for
 * local dev:
 *
 *   https://samou-go-customer.vercel.app   ← phone-auth client (REQUIRED today)
 *   https://samou-go-store-details.vercel.app
 *   https://samou-go-checkout.vercel.app
 *   https://samou-go-order-tracking.vercel.app
 *   https://samou-go-store-manager.vercel.app
 *   https://samou-go-captain.vercel.app
 *   https://samou-go-admin.vercel.app
 *   http://localhost
 *
 * Today only web-customer registers through Firebase — the other six apps
 * authenticate with phone+password against the API and never load the SDK, so
 * only its domain is strictly required. Add the rest now anyway: the list is
 * free, and any app that adopts phone auth later (or a native WebView origin)
 * will already be covered instead of failing with a 400 from
 * `identitytoolkit.googleapis.com` ("Failed to initialize reCAPTCHA Enterprise
 * config"). If the deployed origin is missing, phone sign-in fails with that
 * 400, and `auth/operation-not-allowed` ("Phone sign-in is not enabled")
 * appears until the Phone provider is enabled in the Firebase console.
 */
const defaults = {
  apiKey: "AIzaSyAuPfEY3F5UGYy8xvyZ2TDW2sH72VyBgL4",
  authDomain: "samougo-web.firebaseapp.com",
  projectId: "samougo-web",
  storageBucket: "samougo-web.firebasestorage.app",
  messagingSenderId: "989062376398",
  appId: "1:989062376398:web:d0d18465759f034ff5599f",
  measurementId: "G-V3G5V0JX9S",
} as const;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? defaults.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? defaults.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? defaults.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? defaults.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? defaults.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? defaults.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? defaults.measurementId,
};

// Fail loudly in the console (not in the user's face) when the deployment was
// not given the Firebase vars — a missing var means we silently pointed at the
// fallback project, which may be the WRONG Firebase project.
const requiredEnvVars = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_APP_ID",
] as const;
for (const name of requiredEnvVars) {
  const value = import.meta.env[name];
  if (!value || String(value).trim() === "") {
    console.warn(
      `[firebase] ${name} is not set — falling back to the samougo-web project config. ` +
        "Set VITE_FIREBASE_* in the Vercel project environment to pin an explicit Firebase project."
    );
  }
}

/**
 * `VITE_USE_MOCK_AUTH=true` bypasses Firebase Phone Auth for local testing and
 * demo deployments where the Phone provider is unavailable. The registration
 * screen then accepts ANY 6-digit code and signs up through the API's dev-only
 * mock-token path (`FIREBASE_MOCK_TOKENS=true` on the API — the API refuses it
 * in production). Never set this flag on a production deployment.
 */
export const isMockAuth = import.meta.env.VITE_USE_MOCK_AUTH === "true";

if (isMockAuth && import.meta.env.PROD) {
  console.warn(
    "[firebase] VITE_USE_MOCK_AUTH=true is set on a production build — registration is NOT protected by Firebase. Remove it before shipping."
  );
}

/** The unsigned token the API accepts for the mock path (must match the API's `MOCK_FIREBASE_ID_TOKEN`). */
export const MOCK_FIREBASE_ID_TOKEN = "mock-firebase-token";

// Initialize Firebase. `getApps()` guard: in a Vite SPA the module cache makes
// a second `initializeApp` unlikely, but HMR reloads and future multi-bundle
// setups (staff variants, lazy routes) can re-evaluate this file — a duplicate
// init throws `auth/already-initialized`-style errors and poisons the whole
// module graph, so the idempotent pattern is the only safe one.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Export Auth service to use in Register / OTP components
export const auth = getAuth(app);
export default app;