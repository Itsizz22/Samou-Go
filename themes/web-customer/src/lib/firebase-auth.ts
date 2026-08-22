/**
 * Samou' Go — Firebase Phone Authentication.
 *
 * Handles the full phone verification flow:
 *   1. Send OTP via Firebase (client-side)
 *   2. User enters the code
 *   3. Verify and get a Firebase ID token
 *   4. Send the ID token to our API for session creation
 *
 * This replaces the server-side OTP flow for customer sign-in.
 * Admin flows and password reset continue using server-side OTP.
 */

import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

/** API base URL */
const API_BASE: string = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:4000')
).replace(/\/+$/, '');

/** ReCAPTCHA verifier instance (cached). */
let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Initialise the invisible reCAPTCHA verifier.
 * Must be called once before sending OTP — renders in a hidden div.
 */
function getRecaptchaVerifier(): RecaptchaVerifier {
  if (recaptchaVerifier) return recaptchaVerifier;

  const auth = getFirebaseAuth();
  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved — invisible, so this fires silently.
    },
    'error-callback': (error: Error) => {
      console.error('[firebase-auth] reCAPTCHA error:', error);
    },
  });

  return recaptchaVerifier;
}

/**
 * Send an OTP to the given phone number via Firebase.
 * Returns a ConfirmationResult that the caller passes to `verifyCode`.
 *
 * @param phoneNumber - In E.164 format: "+9705XXXXXXXX"
 * @returns ConfirmationResult (contains `confirm(code)` method)
 */
export async function sendFirebaseOtp(phoneNumber: string): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  const verifier = getRecaptchaVerifier();

  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
  return confirmationResult;
}

/**
 * Verify the OTP code and return a Firebase ID token.
 *
 * @param confirmationResult - From `sendFirebaseOtp`
 * @param code - The 6-digit code the user entered
 * @returns Firebase ID token (a JWT)
 */
export async function verifyFirebaseCode(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<string> {
  const userCredential = await confirmationResult.confirm(code);
  const idToken = await userCredential.user.getIdToken();
  return idToken;
}

/**
 * Exchange a Firebase ID token for a Samou' Go session.
 *
 * The server verifies the ID token with Firebase Admin SDK, finds or creates
 * the user account, and returns access + refresh tokens.
 *
 * @param idToken - Firebase ID token from `verifyFirebaseCode`
 * @param name - Optional display name for new accounts
 * @returns Samou' Go auth response (accessToken, refreshToken, user)
 */
import type { AuthResponse } from '@samou-go/shared-types';

export async function exchangeFirebaseToken(
  idToken: string,
  name?: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/v1/auth/firebase/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, name }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? `Firebase auth failed (${response.status})`);
  }

  const envelope = await response.json();
  // Server wraps in { success: true, data: { accessToken, refreshToken, user } }
  const data = envelope.data ?? envelope as AuthResponse;

  // Store tokens in the API client's token layer (same as verifyOtp).
  const { setToken, setRefreshToken } = await import('@samou-go/api-client');
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken ?? null);

  return data;
}

/**
 * Reset the reCAPTCHA verifier.
 * Called after a failed attempt or when switching phone numbers.
 */
export function resetRecaptcha(): void {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
}
