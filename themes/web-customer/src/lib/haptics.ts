/**
 * Haptic feedback for native builds — wired to `@capacitor/haptics`, silently
 * no-ops in the browser so the same code runs on web and Android.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

/** Light tap — good for taps, toggles, tab switches. */
export async function hapticTap(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* WebView without haptics — fine. */
  }
}

/** Medium impact — add-to-cart, submit, confirm. */
export async function hapticConfirm(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* no-op */
  }
}

/** Success feedback — OTP verified, order placed, code copied. */
export async function hapticSuccess(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* no-op */
  }
}

/** Error feedback — wrong OTP, failed submit. */
export async function hapticError(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* no-op */
  }
}
