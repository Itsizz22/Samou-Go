/**
 * Samou' Go — Push notification manager.
 *
 * Handles registration, token management, and notification handling for
 * the customer mobile app. Works with both Capacitor native (Android/iOS)
 * and browser (FCM Web Push).
 *
 * Flow:
 *   1. On app launch, request permission
 *   2. Register for push notifications
 *   3. Send the device token to the API
 *   4. Handle incoming notifications (foreground + tap)
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { globalNavigate } from './globalNavigate';
import { createLoopingAlert } from '@samou-go/ui';
import { stopOrderAlarm } from './orderAlarm';
import { getRingOnOrder } from './ringPreference';

import { API_URL, setLogoutDeviceToken } from '@samou-go/api-client';

/** Detect platform for the `platform` field sent to the API. */
function getPlatform(): 'android' | 'ios' | 'web' {
  const p = Capacitor.getPlatform();
  if (p === 'android') return 'android';
  if (p === 'ios') return 'ios';
  return 'web';
}

/**
 * Guard: prevent duplicate listener registration. Capacitor PushNotifications
 * accumulates listeners on every `addListener` call — without this guard,
 * each login/refresh cycle stacks new handlers that never get cleaned up,
 * leading to memory leaks and duplicate API calls.
 */
let listenersRegistered = false;

/**
 * The device's FCM token from the most recent registration. A device owns one
 * token regardless of how many accounts sign in on it, so a module-level cache
 * is correct. Sign-out reads it (`getDeviceToken`) so the logout request can
 * carry `deviceToken` and unregister ONLY this device — the other devices of
 * the same account stay signed in (selective logout). Must be called BEFORE
 * tokens are cleared, which `useAuth.signOut()` now guarantees.
 */
let latestDeviceToken: string | null = null;

/** The current device's push token, or null if FCM never handed one out. */
export function getDeviceToken(): string | null {
  return latestDeviceToken;
}

/**
 * Request permission and register for push notifications.
 * Idempotent — only registers listeners once per app lifecycle.
 */
export async function registerForPushNotifications(accessToken: string): Promise<void> {
  // Only works on native platforms (Android/iOS) via Capacitor.
  if (!Capacitor.isNativePlatform()) return;

  // Already registered — skip to avoid accumulating duplicate listeners.
  if (listenersRegistered) return;

  try {
    // Step 1: Request permission.
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.log('[push] Notification permission not granted');
      return;
    }

    // Step 2: Register for push notifications.
    await PushNotifications.register();

    // Mark as registered before adding listeners to prevent re-entry.
    listenersRegistered = true;

    // Step 3: Listen for registration token.
    PushNotifications.addListener('registration', async (token) => {
      console.log('[push] Device token:', token.value);
      // Cache for the selective-logout flow AND surface it for the api-client
      // so POST /auth/logout can unregister just this device.
      latestDeviceToken = token.value;
      setLogoutDeviceToken(token.value);
      await sendTokenToServer(token.value, accessToken);
    });

    // Step 4: Listen for registration errors.
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[push] Registration error:', error);
    });

    // Step 5: Handle foreground notifications — respect the user's ring
    // preference. When enabled, play a 10-second looping alarm so the
    // store manager / captain hears new orders even in foreground.
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[push] Foreground notification:', notification);
      try {
        const ringEnabled = await getRingOnOrder();
        if (ringEnabled) {
          // Play the looping alarm for up to 10 seconds. The user can
          // dismiss it by tapping the notification or it stops automatically.
          createLoopingAlert(10_000);
        }
      } catch {
        // Audio may not be available — non-fatal.
      }
    });

    // Step 6: Handle notification taps (app opened from background).
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[push] Notification tapped:', action);
      // Stop the native alarm service — the app is now in the foreground
      // and JS-based looping alert will take over if needed.
      stopOrderAlarm().catch(() => {});
      const data = action.notification.data;
      if (data?.orderId) {
        // Navigate via SPA router only — never fall back to window.location.href
        // which causes a full page reload and "Throttling navigation" crash on Android.
        globalNavigate(`/orders/${encodeURIComponent(data.orderId)}`);
      }
    });
  } catch (err) {
    console.error('[push] Failed to register:', err);
  }
}

/**
 * Send the device token to the API server.
 * Retries once on failure (the server might not be ready yet).
 */
async function sendTokenToServer(token: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/devices/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        token,
        platform: getPlatform(),
        deviceInfo: `${getPlatform()} · ${navigator.userAgent.slice(0, 140)}`,
      }),
    });

    if (!response.ok) {
      console.error('[push] Failed to register token:', response.status);
    }
  } catch (err) {
    console.error('[push] Failed to send token to server:', err);
  }
}

/**
 * Unregister the device token from the API.
 * Called on logout.
 */
export async function unregisterDeviceToken(
  token: string,
  accessToken: string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await fetch(`${API_URL}/devices/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Best-effort — don't block logout.
  }
}
