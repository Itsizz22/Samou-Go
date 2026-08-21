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

import { prisma } from './prisma';
import { env } from '../config/env';

// Lazy-loaded Firebase messaging instance. `null` = not initialised / disabled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseMessaging: any = null;
let initialised = false;

/** Lazy-initialise Firebase Admin SDK. Safe to call multiple times. */
async function getMessaging(): Promise<any> {
  if (initialised) return firebaseMessaging;

  // No service account configured — push is disabled (dev/test).
  if (!env.firebase.serviceAccountPath && !env.firebase.serviceAccountJson) {
    initialised = true;
    return null;
  }

  try {
    // Dynamic imports so the SDK is only loaded when push is actually used.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = await import('firebase-admin/app') as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messagingMod = await import('firebase-admin/messaging') as Record<string, any>;

    if (admin.getApps().length === 0) {
      // Support both file path (local dev) and inline JSON string (Render / cloud).
      let serviceAccount: Record<string, string>;
      if (env.firebase.serviceAccountJson) {
        serviceAccount = JSON.parse(env.firebase.serviceAccountJson);
      } else {
        const fs = await import('node:fs/promises');
        const nodePath = await import('node:path');
        const keyPath = nodePath.resolve(env.firebase.serviceAccountPath!);
        serviceAccount = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
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
 * Send a push notification to all devices registered to a user.
 * Sends in parallel and silently removes stale tokens on failure.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const msg = await getMessaging();
  if (!msg) return { sent: 0, failed: 0 };

  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true, platform: true },
  });

  if (tokens.length === 0) return { sent: 0, failed: 0 };

  // Build the multicast message — each token gets the same payload.
  const messages = tokens.map((t: { token: string }) => ({
    token: t.token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data ?? {},
    // Android: use the "notification" channel for heads-up display.
    android: {
      priority: 'high' as const,
      notification: {
        channelId: 'samou-go-orders',
        clickAction: 'OPEN_APP',
      },
    },
    // iOS: critical alert for delivery updates.
    apns: {
      payload: {
        aps: {
          badge: payload.badge,
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  }));

  // Send all messages in parallel.
  const results = await Promise.allSettled(
    messages.map((m: (typeof messages)[number]) =>
      msg.sendEachForMulticast({ tokens: [m.token], ...m })
    )
  );

  let sent = 0;
  let failed = 0;
  const staleTokenIds: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result && result.status === 'fulfilled') {
      const response = result.value as { responses: Array<{ success: boolean; error?: { code: string } }> };
      for (const resp of response.responses) {
        if (resp.success) {
          sent++;
        } else {
          failed++;
          const errorCode = resp.error?.code;
          // Token is no longer valid — mark for removal.
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            const token = tokens[i];
            if (token) staleTokenIds.push(token.id);
          }
        }
      }
    } else {
      failed++;
    }
  }

  // Clean up stale tokens so we never retry them.
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
  payload: PushPayload
): Promise<{ totalSent: number; totalFailed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  // Send to all users in parallel (each user may have multiple devices).
  const results = await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
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
