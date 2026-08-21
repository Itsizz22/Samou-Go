/**
 * Samou' Go — Biometric authentication (fingerprint / Face ID).
 *
 * DISABLED: The @aparajita/capacitor-biometric-auth and
 * @aparajita/capacitor-secure-storage plugins caused native crashes on
 * Android. This module is now a no-op stub until stable alternatives are
 * evaluated. All functions return safe defaults.
 */

export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function isBiometricEnabled(): Promise<boolean> {
  return false;
}

export interface SavedSession {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

export async function saveSession(_session: SavedSession): Promise<void> {
  // No-op — secure storage disabled.
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  return null;
}

export async function clearSavedSession(): Promise<void> {
  // No-op.
}

export interface BiometricPromptResult {
  success: boolean;
  error?: string;
}

export async function promptBiometric(): Promise<BiometricPromptResult> {
  return { success: false, error: 'Biometric not available' };
}
