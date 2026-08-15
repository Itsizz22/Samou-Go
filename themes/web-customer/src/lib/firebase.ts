import { initializeApp } from "firebase/app";
import { getAuth, type RecaptchaVerifier } from "firebase/auth";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

// Firebase configuration
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