/**
 * Samou' Go — Biometric authentication (fingerprint / Face ID).
 *
 * After the first OTP sign-in, the user can optionally enable biometric
 * login so subsequent launches skip the OTP flow entirely.
 *
 * Uses:
 *   - @aparajita/capacitor-biometric-auth for the native biometric prompt
 *   - @aparajita/capacitor-secure-storage for encrypted token storage
 */

import { BiometricAuth, BiometryErrorType, type BiometryError } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';

const KEY_REFRESH = 'samougo_refresh';
const KEY_ACCESS = 'samougo_access';
const KEY_USER = 'samougo_user';
const KEY_ENABLED = 'samougo_bio_enabled';

// ---------------------------------------------------------------------------
// Device capability checks
// ---------------------------------------------------------------------------

/** True only on a native platform with biometric hardware enrolled. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/** True when the user has previously completed biometric setup. */
export async function isBiometricEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const val = await SecureStorage.getItem(KEY_ENABLED);
    return val === 'true';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Save / load session via Capacitor Secure Storage (encrypted at rest)
// ---------------------------------------------------------------------------

export interface SavedSession {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

export async function saveSession(session: SavedSession): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SecureStorage.setItem(KEY_ACCESS, session.accessToken);
    await SecureStorage.setItem(KEY_REFRESH, session.refreshToken);
    await SecureStorage.setItem(KEY_USER, JSON.stringify(session.user));
    await SecureStorage.setItem(KEY_ENABLED, 'true');
  } catch {
    console.warn('[biometric] Could not save session to secure storage');
  }
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const access = await SecureStorage.getItem(KEY_ACCESS);
    const refresh = await SecureStorage.getItem(KEY_REFRESH);
    const user = await SecureStorage.getItem(KEY_USER);
    if (!access || !refresh || !user) return null;
    return {
      accessToken: access,
      refreshToken: refresh,
      user: JSON.parse(user) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export async function clearSavedSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SecureStorage.removeItem(KEY_ACCESS);
    await SecureStorage.removeItem(KEY_REFRESH);
    await SecureStorage.removeItem(KEY_USER);
    await SecureStorage.removeItem(KEY_ENABLED);
  } catch {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Biometric prompt
// ---------------------------------------------------------------------------

export interface BiometricPromptResult {
  success: boolean;
  error?: string;
}

/**
 * Prompt the user for biometric verification.
 * Returns { success: true } on success, or an error description on
 * failure / user cancellation.
 */
export async function promptBiometric(): Promise<BiometricPromptResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: 'Not a native platform' };
  }

  try {
    await BiometricAuth.authenticate({
      reason: 'سجّل الدخول ببصمة الإصبع / Sign in with biometrics',
      cancelTitle: 'استخدام الرمز / Use code instead',
      allowDeviceCredential: true,
    });
    return { success: true };
  } catch (err: unknown) {
    const bioErr = err as BiometryError;
    const message = bioErr?.message ?? String(err);
    if (bioErr?.code === BiometryErrorType.userCancel || bioErr?.code === BiometryErrorType.userFallback) {
      return { success: false, error: 'cancelled' };
    }
    return { success: false, error: message };
  }
}
