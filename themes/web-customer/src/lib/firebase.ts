import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type Auth,
} from 'firebase/auth';

/**
 * Firebase client configuration for Samou' Go phone authentication.
 *
 * Vite exposes only variables prefixed with VITE_. The defaults keep local
 * development usable when a `.env` file has not been created; deployments
 * should provide the same values through VITE_FIREBASE_* environment vars.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyD4uHMzZjCRZk6ENxMRNaS-BKJqOCAbkO4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'samou-go.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'samou-go',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'samou-go.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '949776098795',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:949776098795:web:86d23148cc888d7aa2a5ae',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-6Z215DD5JG',
} as const;

/** The singleton Firebase app used by the customer authentication flow. */
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/** Firebase Auth instance bound to the Samou' Go project. */
export const auth: Auth = getAuth(app);

/**
 * Start phone-number verification. Render the returned verifier container in
 * the page (usually `<div id="recaptcha-container" />`) before calling this.
 */
export function requestPhoneVerification(
  phoneNumber: string,
  container: string | HTMLElement = 'recaptcha-container'
): Promise<{ confirmation: ConfirmationResult; verifier: RecaptchaVerifier }> {
  const verifier = new RecaptchaVerifier(auth, container);
  return signInWithPhoneNumber(auth, phoneNumber, verifier).then((confirmation) => ({ confirmation, verifier }));
}

export { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

