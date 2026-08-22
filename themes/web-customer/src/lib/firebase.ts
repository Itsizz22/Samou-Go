/**
 * Samou' Go — Firebase client configuration.
 *
 * Firebase project: `samou-go` (unified web + Android).
 * Configured via environment variables (set in .env / Vercel dashboard).
 * Do NOT hard-code API keys here — they live in env vars so web and Android
 * can use different app IDs from the same project.
 *
 * Used for:
 *   1. Phone number authentication (replaces server-side OTP for customer sign-in)
 *   2. Push notifications (FCM token registration)
 *
 * The Firebase project must have:
 *   - Phone Authentication enabled (Firebase Console → Authentication → Sign-in method)
 *   - Android app registered (google-services.json in android/app/)
 *   - Web app registered (VITE_FIREBASE_APP_ID = web app ID)
 *
 * Environment variables:
 *   VITE_FIREBASE_API_KEY              — Web API key from Firebase Console → Project Settings
 *   VITE_FIREBASE_AUTH_DOMAIN          — samou-go.firebaseapp.com
 *   VITE_FIREBASE_PROJECT_ID           — samou-go
 *   VITE_FIREBASE_STORAGE_BUCKET       — samou-go.firebasestorage.app
 *   VITE_FIREBASE_MESSAGING_SENDER_ID  — 949776098795
 *   VITE_FIREBASE_APP_ID               — Web app ID (1:949776098795:web:...)
 *   VITE_FIREBASE_MEASUREMENT_ID       — G-6Z215DD5JG
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * Get the Firebase Auth instance.
 * Lazy-initialised on first call — safe to import anywhere.
 */
export function getFirebaseAuth(): Auth {
  if (auth) return auth;

  if (!firebaseConfig.apiKey) {
    throw new Error(
      'Firebase config missing. Set VITE_FIREBASE_API_KEY etc. in your .env file.'
    );
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  return auth;
}

/**
 * Get the Firebase App instance.
 */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  getFirebaseAuth(); // ensures app is initialised
  return app!;
}
