/**
 * Samou' Go — Firebase client configuration.
 *
 * Used for:
 *   1. Phone number authentication (replaces server-side OTP for customer sign-in)
 *   2. Push notifications (FCM token registration)
 *
 * The Firebase project must have:
 *   - Phone Authentication enabled (Firebase Console → Authentication → Sign-in method)
 *   - Android app registered (for push notifications)
 *   - iOS app registered (for push notifications)
 *
 * Environment variables (set in .env):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
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
