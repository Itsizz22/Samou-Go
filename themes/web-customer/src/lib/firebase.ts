import { initializeApp } from "firebase/app";
import { getAuth, type RecaptchaVerifier } from "firebase/auth";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

// Firebase configuration
//
// Authorized domains (Firebase Console → Authentication → Settings →
// Authorized domains) must include:
//   - samou-go-customer.vercel.app   (production)
//   - localhost                      (already enabled by default for local dev)
// If the deployed origin is missing, phone sign-in fails with a 400 from
// `identitytoolkit.googleapis.com` ("Failed to initialize reCAPTCHA Enterprise
// config") — reCAPTCHA refuses to render on an unauthorized origin.
//
// `authDomain` stays the Firebase project's own domain: phone-auth reCAPTCHA
// is validated against the *current page origin*, not this value.
const firebaseConfig = {
  apiKey: "AIzaSyAuPfEY3F5UGYy8xvyZ2TDW2sH72VyBgL4",
  authDomain: "samougo-web.firebaseapp.com",
  projectId: "samougo-web",
  storageBucket: "samougo-web.firebasestorage.app",
  messagingSenderId: "989062376398",
  appId: "1:989062376398:web:d0d18465759f034ff5599f",
  measurementId: "G-V3G5V0JX9S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth service to use in Register / OTP components
export const auth = getAuth(app);
export default app;