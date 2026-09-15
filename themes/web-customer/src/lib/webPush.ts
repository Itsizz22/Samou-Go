import { Capacitor } from '@capacitor/core';
import { API_URL, getToken, setLogoutDeviceToken } from '@samou-go/api-client';
import { getFirebaseApp } from './firebase';

export const webPushConfigured = Boolean(import.meta.env.VITE_FIREBASE_VAPID_KEY && import.meta.env.VITE_FIREBASE_API_KEY);
export function supportsWebPush(): boolean {
  return !Capacitor.isNativePlatform() && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}
let pending: Promise<boolean> | null = null;
let pendingAccount: string | null = null;

/** Permission is requested by a button gesture, never automatically on page load. */
export async function enableWebPush(): Promise<boolean> {
  if (!supportsWebPush() || !webPushConfigured || !getToken()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  return syncWebPush();
}

/** Refresh the FCM subscription and current-account binding on login/resume. */
export function syncWebPush(): Promise<boolean> {
  if (pending) {
    if (pendingAccount === getToken()) return pending;
    return pending.then(() => getToken() ? syncWebPush() : false);
  }
  pendingAccount = getToken();
  pending = synchronize().finally(() => { pending = null; pendingAccount = null; });
  return pending;
}
async function synchronize(): Promise<boolean> {
  if (!supportsWebPush() || !webPushConfigured || Notification.permission !== 'granted') return false;
  const accessToken = getToken();
  if (!accessToken) return false;
  try {
    const { getMessaging, getToken: getMessagingToken, isSupported } = await import('firebase/messaging');
    if (!await isSupported()) return false;
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });
    const registration = await navigator.serviceWorker.ready;
    const deviceToken = await getMessagingToken(getMessaging(getFirebaseApp()), {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!deviceToken || getToken() !== accessToken) return false;
    setLogoutDeviceToken(deviceToken);
    const response = await fetch(`${API_URL}/devices/token`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token: deviceToken, platform: 'web', deviceInfo: navigator.userAgent.slice(0, 140) }),
    });
    return response.ok && getToken() === accessToken;
  } catch {
    console.warn('[push] Web registration pending; retry from notification settings');
    return false;
  }
}
