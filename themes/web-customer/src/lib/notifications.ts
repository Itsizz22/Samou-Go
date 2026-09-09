/** Native notification listeners live once per WebView; account tokens never do. */
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { API_URL, getToken, setLogoutDeviceToken, recordNotificationOpened, ApiError } from '@samou-go/api-client';
import { globalNavigate } from './globalNavigate';
import { stopOrderAlarm } from './orderAlarm';
import { presentIncomingOrder, dismissIncomingOrder } from './incomingOrder';

const receiptKey = 'samou_notification_opens';
function pendingOpens(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(receiptKey) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length <= 100).slice(-30) : [];
  } catch { return []; }
}
function saveOpens(ids: string[]): void { try { localStorage.setItem(receiptKey, JSON.stringify(ids.slice(-30))); } catch { /* Storage may be unavailable. */ } }
let flushing = false;
async function flushOpens(): Promise<void> {
  if (flushing || !getToken()) return;
  flushing = true;
  try {
    for (const id of pendingOpens()) {
      try { await recordNotificationOpened(id); }
      catch (error) { if (!(error instanceof ApiError) || error.status !== 404) break; }
      saveOpens(pendingOpens().filter(pending => pending !== id));
    }
  } finally { flushing = false; }
}
function recordOpen(id: string): void {
  saveOpens([...new Set([...pendingOpens(), id])]);
  void flushOpens();
}
let latestDeviceToken: string | null = null;
let setup: Promise<void> | null = null;
let registration: Promise<void> | null = null;

export function getDeviceToken(): string | null { return latestDeviceToken; }

function ensureListeners(): Promise<void> {
  if (setup) return setup;
  setup = (async () => {
    const handles: PluginListenerHandle[] = [];
    try {
      handles.push(await PushNotifications.addListener('registration', ({ value }) => {
        latestDeviceToken = value;
        setLogoutDeviceToken(value);
        const token = getToken();
        if (token) void sendTokenToServer(value, token);
      }));
      handles.push(await PushNotifications.addListener('registrationError', () => {
        console.warn('[push] Registration failed; retry on next foreground/resume');
      }));
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
        void stopOrderAlarm().catch(() => {});
        if (action.actionId === 'SAMOU_DISMISS' || action.actionId === 'dismiss') { dismissIncomingOrder(); return; }
        const auditId: unknown = action.notification.data?.notificationLogId;
        if (typeof auditId === 'string') recordOpen(auditId);
        if (Capacitor.getPlatform() === 'ios' && presentIncomingOrder(action.notification)) return;
        const orderId: unknown = action.notification.data?.orderId;
        if (typeof orderId === 'string' && orderId.length > 0) {
          globalNavigate(`/orders/${encodeURIComponent(orderId)}`);
        }
      }));
      const { App } = await import('@capacitor/app');
      handles.push(await App.addListener('appStateChange', ({ isActive }) => {
        const token = getToken();
        if (isActive && token) void registerForPushNotifications(token, false);
      }));
      // Android owns its native banner/alarm. Preserve iOS foreground feedback.
      if (Capacitor.getPlatform() === 'ios') {
        handles.push(await PushNotifications.addListener('pushNotificationReceived', notification => { presentIncomingOrder(notification); }));
      }
      window.addEventListener('online', () => {
        void flushOpens();
        const token = getToken();
        if (token && latestDeviceToken) void sendTokenToServer(latestDeviceToken, token);
      });
    } catch (error) {
      await Promise.all(handles.map(handle => handle.remove()));
      throw error;
    }
  })().catch(error => { setup = null; throw error; });
  return setup;
}

export async function registerForPushNotifications(accessToken: string, requestPermission = true): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Tap delivery must work even when permission was revoked after delivery.
    await ensureListeners();
    void flushOpens();
    const pending = registration ?? Promise.resolve();
    const task = pending.catch(() => {}).then(async () => {
      let permission = await PushNotifications.checkPermissions();
      if (requestPermission && permission.receive === 'prompt') {
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== 'granted') return;
      if (latestDeviceToken) {
        await sendTokenToServer(latestDeviceToken, accessToken);
      } else {
        await PushNotifications.register();
      }
    });
    registration = task;
    try { await task; } finally { if (registration === task) registration = null; }
  } catch {
    console.warn('[push] Registration unavailable; retry on next foreground/resume');
  }
}

async function sendTokenToServer(token: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (getToken() !== accessToken) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${API_URL}/devices/token`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token, platform: Capacitor.getPlatform(), deviceInfo: navigator.userAgent.slice(0, 140) }),
      });
      if (response.ok) return;
      if (response.status < 500 && response.status !== 429) return;
    } catch {
      // Retry transient network failures once, then again on online/resume.
    } finally { window.clearTimeout(timeout); }
    if (attempt === 0) await new Promise(resolve => window.setTimeout(resolve, 1_000));
  }
  console.warn('[push] Device synchronization pending; retry on online/resume');
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
