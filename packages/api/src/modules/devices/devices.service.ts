/**
 * Samou' Go — Device token service.
 *
 * Registers and unregisters FCM/APNs device tokens for push notifications.
 * Each user may have many tokens (multiple devices). Duplicate registrations
 * are idempotent — upserting by the unique token field.
 */

import { prisma } from '../../lib/prisma';
import type { RegisterDeviceTokenBody, UnregisterDeviceTokenBody } from './devices.schemas';

/** Register or update a device token. Idempotent — safe to call on every app open.
 *  Upsert semantics: re-registering the SAME token for the SAME user refreshes
 *  the device metadata + `updatedAt`; registering a token that was previously
 *  held by another account reassigns it. Tokens belonging to the user's OTHER
 *  devices are never touched. */
export async function registerDeviceToken(
  userId: string,
  body: RegisterDeviceTokenBody
): Promise<{ id: string; upserted: boolean }> {
  const existing = await prisma.deviceToken.findUnique({
    where: { token: body.token },
    select: { id: true, userId: true },
  });

  // Metadata always set together so the row stays coherent on every write.
  const metadata = {
    platform: body.platform,
    ...(body.deviceInfo !== undefined ? { deviceInfo: body.deviceInfo } : {}),
  };

  if (existing) {
    // Same device, same user → refresh metadata (bumps `updatedAt`). This
    // keeps the row fresh without creating a duplicate or affecting the
    // user's other active devices.
    if (existing.userId === userId) {
      await prisma.deviceToken.update({
        where: { id: existing.id },
        data: metadata,
      });
    } else {
      // Token already registered — if it belongs to a different user (e.g.
      // device was factory-reset and re-registered by another account),
      // reassign it rather than creating a duplicate row.
      await prisma.deviceToken.update({
        where: { id: existing.id },
        data: { userId, ...metadata },
      });
    }
    return { id: existing.id, upserted: true };
  }

  const row = await prisma.deviceToken.create({
    data: {
      userId,
      token: body.token,
      ...metadata,
    },
  });

  return { id: row.id, upserted: false };
}

/** Remove a device token — called on logout or when the app is uninstalled. */
export async function unregisterDeviceToken(
  userId: string,
  body: UnregisterDeviceTokenBody
): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: {
      token: body.token,
      userId, // Only delete own tokens — never another user's.
    },
  });
}

/** Remove all tokens for a user — called on logout from all devices. */
export async function unregisterAllDeviceTokens(userId: string): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: { userId },
  });
}
