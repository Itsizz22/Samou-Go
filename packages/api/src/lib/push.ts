/**
 * Samou' Go — Push notification service (FCM).
 *
 * Sends push notifications to registered mobile devices via Firebase Cloud
 * Messaging. The service is initialised lazily on first use — if no Firebase
 * credentials are configured, all send calls are no-ops so the API never
 * crashes in dev/test.
 *
 * Device tokens are stored in the `device_tokens` table and cleaned up
 * automatically when FCM reports a token as unregistered.
 */

import type { Messaging, MulticastMessage } from 'firebase-admin/messaging';
import { prisma } from './prisma';
import { env } from '../config/env';

// Lazy-loaded Firebase messaging instance. `null` = not initialised / disabled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseMessaging: Messaging | null = null;
let initialised = false;

/** Lazy-initialise Firebase Admin SDK. Safe to call multiple times. */
async function getMessaging(): Promise<Messaging | null> {
  if (initialised) return firebaseMessaging;

  // No service account configured — push is disabled (dev/test).
  if (!env.firebase.serviceAccountPath && !env.firebase.serviceAccountJson) {
    initialised = true;
    return null;
  }

  try {
    // Dynamic imports so the SDK is only loaded when push is actually used.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = await import('firebase-admin/app');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messagingMod = await import('firebase-admin/messaging');

    if (admin.getApps().length === 0) {
      // Support both file path (local dev) and inline JSON string (Render / cloud).
      let serviceAccount: Record<string, string>;
      if (env.firebase.serviceAccountJson) {
        serviceAccount = JSON.parse(env.firebase.serviceAccountJson);
      } else {
        const fs = await import('node:fs/promises');
        const nodePath = await import('node:path');
        // Try Render's /etc/secrets/ path first, then the configured path.
        const secretsPath = `/etc/secrets/${env.firebase.serviceAccountPath}`;
        let keyPath: string;
        if (await fs.access(secretsPath).then(() => true).catch(() => false)) {
          keyPath = secretsPath;
        } else {
          keyPath = nodePath.resolve(env.firebase.serviceAccountPath!);
        }
        serviceAccount = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      }

      admin.initializeApp({
        credential: admin.cert(serviceAccount),
        projectId: env.firebase.projectId ?? serviceAccount.project_id,
      });
    }

    firebaseMessaging = messagingMod.getMessaging();
    initialised = true;
    return firebaseMessaging;
  } catch (err) {
    console.error('[push] Failed to initialise Firebase Admin SDK — push disabled', err);
    initialised = true;
    return null;
  }
}

/** Notification payload — what the device receives. */
export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link path the app opens when the notification is tapped. */
  data?: Record<string, string>;
  /** Notification badge count (iOS). */
  badge?: number;
}

/**
 * Classification of per-token FCM errors that mean "this token is no longer
 * valid" (app uninstalled, device logged out, quota/registration scrub). Tokens
 * that fail with one of these codes are silently removed so they are never
 * retried. Firestore/FCM surfaces the code in a few shapes depending on the SDK
 * version: error-code string literally named `UNREGISTERED` (admin SDK
 * `unregistered` error code) or `messaging/registration-token-not-registered`.
 */
export function isStaleTokenCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/unregistered' ||
    code === 'UNREGISTERED'
  );
}

/**
 * Send a push notification to all devices registered to a user.
 * Sends in parallel and silently removes stale tokens on failure.
 */
export interface SendPushOptions {
  /** If true, omit the root-level `notification` key so the message is
   *  data-only. This guarantees `onMessageReceived()` fires in
   *  FirebaseMessagingService even when the app is killed, allowing the
   *  native side to build a custom notification with the correct channel
   *  (ringing vs. silent) based on user preferences.
   *  When false (default), FCM delivers a standard notification+data message
   *  that Android handles natively in the background. */
  dataOnly?: boolean;
}

async function deliverPushToUser(
  userId: string,
  payload: PushPayload,
  options?: SendPushOptions
): Promise<{ sent: number; failed: number; skipped?: string }> {
  const msg = await getMessaging();
  if (!msg) return { sent: 0, failed: 0, skipped: "DISABLED" };

  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true, platform: true },
  });

  if (tokens.length === 0) return { sent: 0, failed: 0, skipped: "NO_DEVICE" };

  // Build ONE multicast message carrying every registered device of this
  // user. A single `sendEachForMulticast` batch deliver the same payload to
  // all devices at once — responses align with `tokens` by index.
  // When data-only, omit the notification object entirely so Android
  // routes through onMessageReceived() even when the app is killed.
  // A preparation reminder is useful only before the estimate. Do not deliver stale countdowns after an offline device reconnects.
  const expiry = Number(payload.data?.expiresAt);
  const ttl = Number.isFinite(expiry) && expiry > 0 ? Math.max(0, expiry - Date.now()) : undefined;
  if (ttl === 0) return { sent: 0, failed: 0, skipped: "EXPIRED" };
  const multicast: MulticastMessage = {
    tokens: tokens.map((t: { token: string }) => t.token),
    ...(options?.dataOnly
      ? {}
      : {
          notification: {
            title: payload.title,
            body: payload.body,
          },
        }),
    data: {
      title: payload.title,
      body: payload.body,
      ...(payload.data ?? {}),
    },
    // Android: use the "orders_high_priority" channel for urgent order alerts.
    // IMPORTANCE_HIGH + custom ringtone ensures the alarm plays even when the
    // app is killed, with heads-up display on lockscreen.
    android: {
      priority: 'high' as const,
      ...(ttl !== undefined ? { ttl } : {}),
      // Android notification metadata also turns a send into a display message.
      // Omit it for data-only staff alerts so the native service owns rendering.
      ...(!options?.dataOnly ? { notification: {
        channelId: 'orders_high_priority',
        sound: 'order_alarm',
      } } : {}),
    },
    // iOS needs a visible APNs alert even for Android data-only staff messages.
    apns: {
      headers: { 'apns-push-type': 'alert', 'apns-priority': '10', ...(ttl !== undefined ? { 'apns-expiration': String(Math.floor(expiry / 1000)) } : {}) },
      payload: {
        aps: {
          alert: { title: payload.title, body: payload.body },
          badge: payload.badge,
          sound: 'default',
          ...(['NEW_ORDER', 'NEW_ORDER_ALERT', 'CAPTAIN_ASSIGN'].includes(payload.data?.type ?? '')
            ? { category: 'SAMOU_NEW_ORDER' } : {}),
        },
      },
    },
  };

  // Fire the multicast batch. In offline/dev mode (no Firebase credentials)
  // getMessaging() returns null and we already returned early above.
  const response = await msg.sendEachForMulticast(multicast);

  let sent = 0;
  let failed = 0;
  const staleTokenIds: string[] = [];

  const perToken = response.responses as Array<{ success: boolean; error?: { code: string } }>;
  for (let i = 0; i < perToken.length; i++) {
    const resp = perToken[i];
    if (resp && resp.success) {
      sent++;
      continue;
    }
    failed++;
    // Token is no longer valid — mark for removal so we never retry it.
    if (tokens[i] && isStaleTokenCode(resp?.error?.code)) {
      staleTokenIds.push(tokens[i]!.id);
    }
  }

  // Clean up stale tokens so we never retry them. Only the reported-gone
  // tokens of this user are removed — other devices stay untouched.
  if (staleTokenIds.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { id: { in: staleTokenIds } },
    });
  }

  return { sent, failed };
}

/**
 * Send a push notification to a specific list of user IDs.
 * Useful for notifying store managers + captains about a new order.
 */
export async function sendPushToMany(
  userIds: string[],
  payload: PushPayload,
  options?: SendPushOptions
): Promise<{ totalSent: number; totalFailed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  // Send to all users in parallel (each user may have multiple devices).
  const results = await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload, options))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      totalSent += result.value.sent;
      totalFailed += result.value.failed;
    } else {
      totalFailed++;
    }
  }

  return { totalSent, totalFailed };
}

/** Returns true if Firebase is configured and ready. */
export function isPushEnabled(): boolean {
  return initialised && firebaseMessaging !== null;
}

/** Provider acceptance is not proof that Android displayed or sounded an alert. */
export async function sendPushToUser(userId: string, payload: PushPayload, options?: SendPushOptions): Promise<{ sent: number; failed: number }> {
  if (['PROMOTION', 'OFFER', 'MARKETING'].includes(payload.data?.type ?? '')) {
    const preferences = await prisma.user.findUnique({ where: { id: userId }, select: { marketingNotificationsEnabled: true } });
    if (preferences?.marketingNotificationsEnabled === false) return { sent: 0, failed: 0 };
  }
  const audit = await prisma.notificationDelivery.create({ data: {
    userId, orderId: payload.data?.orderId, type: payload.data?.type ?? 'GENERAL', title: payload.title,
  } }).catch(() => { console.error('[push-audit] Could not create delivery audit'); return null; });
  try {
    const result = await deliverPushToUser(userId, { ...payload, data: { ...payload.data, ...(audit ? { notificationLogId: audit.id } : {}) } }, options);
    if (audit) await prisma.notificationDelivery.update({ where: { id: audit.id }, data: {
      status: result.skipped ?? (result.failed ? (result.sent ? 'PARTIAL' : 'FAILED') : 'ACCEPTED'),
      sentCount: result.sent, failedCount: result.failed,
      providerAcceptedAt: result.sent ? new Date() : null,
    } }).catch(() => console.error('[push-audit] Could not record provider result'));
    return { sent: result.sent, failed: result.failed };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 100) : 'SEND_FAILED';
    if (audit) await prisma.notificationDelivery.update({ where: { id: audit.id }, data: { status: 'FAILED', errorCode: code, failedCount: 1 } }).catch(() => console.error('[push-audit] Could not record provider failure'));
    throw error;
  }
}
